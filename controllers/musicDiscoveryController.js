import { discover } from "../services/musicDiscoveryService.js";
import { fetchFeed } from "../services/rssService.js";
import {
  sendFailure,
  sendSanitizedError,
} from "../services/httpErrorService.js";
import {
  searchSong,
  createPlaylist,
  addTracksToPlaylist,
} from "../services/youtubeMusicService.js";

// --- IndieHoy Parser ----------------------------------------------------------
// Site-specific knowledge (selectors, regex) lives here, not in services.
// When a new music source is added, it gets its own parser block in its
// own controller — each controller owns its source's DOM shape.

const SELECTORS = {
  ENTRY_CONTENT: ".post-content-wrap .entry-content",
  HEADINGS: "h2.wp-block-heading",
};

/**
 * Extracts artist/song pairs from an IndieHoy article's DOM.
 *
 * Strategy:
 * 1. Scopes to .post-content-wrap .entry-content to avoid matching
 *    headings outside the article body.
 * 2. Iterates h2.wp-block-heading elements.
 * 3. Matches each heading against two regexes (text quotes then HTML <em>)
 *    to extract artist and song. Non-matching headings (Conclusion, etc.)
 *    are skipped with a console.warn for debugging.
 *
 * @param {import("cheerio").CheerioAPI} $ - Cheerio instance loaded with the article HTML.
 * @returns {{ artist: string, song: string }[]}
 */
export const indieHoyParser = ($) => {
  const items = [];
  const scope = $(SELECTORS.ENTRY_CONTENT);

  scope.find(SELECTORS.HEADINGS).each((_, el) => {
    const $h2 = $(el);
    const text = $h2.text().trim();
    // .html() keeps entities like &nbsp; as-is — strip them so the
    // $ anchor in the HTML regex isn't blocked by trailing non-breaking spaces.
    const html = ($h2.html() || "").replace(/&nbsp;/g, "").trim();

    // Try text regex first: matches "Artist - "Song"" (handles both
    // straight quotes U+0022 and smart/curly quotes U+201C/U+201D).
    const textMatch = text.match(/^(.+?)\s+-\s+["\u201c](.+?)["\u201d]$/);
    if (textMatch) {
      items.push(buildItem(textMatch[1], textMatch[2]));
      return;
    }

    // Try HTML regex: matches "Artist - <em>Song</em>"
    const htmlMatch = html.match(/^(.+?)\s+-\s+<em>(.+?)<\/em>$/i);
    if (htmlMatch) {
      items.push(buildItem(htmlMatch[1], htmlMatch[2]));
      return;
    }

    // No match — skip non-music headings (Conclusion, etc.)
    console.warn(`[indieHoyParser] Skipping heading with no artist/song pattern: "${text}"`);
  });

  return items;
};

/**
 * Builds a single parsed item from a heading element.
 *
 * @param {string} artist - Artist name extracted via regex.
 * @param {string} song - Song title extracted via regex.
 * @returns {{ artist: string, song: string }}
 */
const buildItem = (artist, song) => {
  return {
    artist: artist.trim(),
    song: song.trim(),
  };
};

// --- Article Type Config ------------------------------------------------------
// Maps each type to its RSS title regex and the response field name for items.

const ARTICLE_TYPES = {
  tracks: { regex: /lanzamientos.*para\s+escuchar/i, responseKey: "song" },
  albums: { regex: /discos.*para\s+escuchar/i, responseKey: "album" },
};

// --- Category Blocklist -------------------------------------------------------
// IndieHoy tags generic categories on every article; these are not artists.

const CATEGORY_BLOCKLIST = new Set([
  "Música",
  "Indie",
  "Rock",
  "Pop",
  "Lanzamientos",
]);

// --- RSS / Source Config ------------------------------------------------------

const BASE_RSS_URL = "https://indiehoy.com/tag/lanzamientos";

const URL = {
  BASE: "https://indiehoy.com",
};

const SOURCE = {
  SITE: "IndieHoy",
};

// --- RSS Helpers --------------------------------------------------------------

/**
 * Resolves the most recent matching article URL from the IndieHoy RSS feed.
 * Fetches the feed, filters items by type-specific title regex, and returns
 * the first (most recent) match.
 *
 * @param {string} type - Article type key (e.g. "tracks", "albums").
 * @param {number} year - Year to build the RSS URL for.
 * @returns {Promise<{ link: string, title: string, pubDate: string, categories: string[] } | null>}
 * @throws {Error} "RSS_UNAVAILABLE" on fetch/parse failure (propagated from fetchFeed).
 */
const resolveArticleUrl = async (type, year) => {
  const rssUrl = `${BASE_RSS_URL}-${year}/feed/`;
  const items = await fetchFeed(rssUrl);

  const matched = items.filter((item) =>
    ARTICLE_TYPES[type].regex.test(item.title),
  );

  // RSS feeds list newest first; the first match is the most recent article.
  return matched.length > 0 ? matched[0] : null;
};

/**
 * Filters generic/blocklisted terms from RSS categories to extract artist names.
 *
 * @param {string[]} categories - Raw RSS category values.
 * @returns {string[]} Categories minus blocklisted entries.
 */
const extractArtists = (categories) => {
  return categories.filter((c) => !CATEGORY_BLOCKLIST.has(c));
};

// --- Helpers ------------------------------------------------------------------

/**
 * Returns today's UTC date as YYYY-MM-DD.
 * @returns {string}
 */
const todayUTC = () => {
  const d = new Date();
  return d.toISOString().slice(0, 10);
};

/**
 * Builds the standard IndieHoy playlist title.
 * @returns {string}
 */
const playlistTitle = () => `IndieHoy · descubrimientos · ${todayUTC()}`;

// --- Pipeline Orchestration ---------------------------------------------------

/**
 * Full music discovery endpoint.
 *
 * Flow:
 *  1. Parse `?type` query param (default: "tracks", allowed: "tracks" | "albums").
 *  2. Resolve article URL from IndieHoy RSS feed (year fallback).
 *  3. Scrape the resolved article and parse with indieHoyParser.
 *  4. Return a typed JSON envelope with artist/items.
 *
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @returns {Promise<void>}
 */
export const getMusicDiscovery = async (req, res) => {
  let type = "tracks";
  let matchedItem = null;

  try {
    // Step 1 — parse and validate type param
    type = req.query.type || "tracks";

    if (!ARTICLE_TYPES[type]) {
      return sendFailure(res, {
        status: 400,
        publicMessage: `Invalid type. Allowed: ${Object.keys(ARTICLE_TYPES).join(", ")}`,
        handler: "getMusicDiscovery",
        logLevel: "warn",
        logContext: {
          providedType: type,
          allowedTypes: Object.keys(ARTICLE_TYPES),
        },
      });
    }

    // Step 2 — resolve article URL from RSS (with year fallback)
    const currentYear = new Date().getFullYear();

    matchedItem = await resolveArticleUrl(type, currentYear);
    if (!matchedItem) {
      matchedItem = await resolveArticleUrl(type, currentYear - 1);
    }

    if (!matchedItem) {
      return sendFailure(res, {
        status: 404,
        publicMessage: `No matching article found for type: ${type}`,
        handler: "getMusicDiscovery",
        logLevel: "warn",
        logContext: {
          type,
          yearsChecked: [currentYear, currentYear - 1],
        },
      });
    }

    // Step 3 — scrape and parse
    const result = await discover(
      { site: SOURCE.SITE, baseUrl: URL.BASE, parser: indieHoyParser },
      matchedItem.link,
    );

    if (result.data.length === 0) {
      return sendFailure(res, {
        status: 502,
        publicMessage: "No music entries parsed from upstream page",
        handler: "getMusicDiscovery",
        logLevel: "warn",
        logContext: {
          type,
          articleUrl: matchedItem.link,
          selector: SELECTORS.HEADINGS,
        },
      });
    }

    // Step 4 — search each track on YouTube Music
    const parsedTracks = result.data; // Array<{ artist, song }>
    const tracksAdded = [];
    const tracksNotFound = [];

    for (const track of parsedTracks) {
      const match = await searchSong(track.artist, track.song);

      if (match && match.videoId) {
        tracksAdded.push({
          title: match.title,
          artist: match.artist || track.artist,
          videoId: match.videoId,
        });
      } else {
        tracksNotFound.push({
          title: track.song,
          artist: track.artist,
          reason: "No results found on YouTube Music",
        });
      }
    }

    // Step 5 — create playlist (only if we found tracks)
    let playlist = null;

    if (tracksAdded.length > 0) {
      const created = await createPlaylist(playlistTitle());
      playlist = {
        title: created.title,
        id: created.playlistId,
        url: created.url,
      };

      // Step 6 — add found tracks to the playlist
      const videoIds = tracksAdded.map((t) => t.videoId);
      const addResult = await addTracksToPlaylist(created.playlistId, videoIds);

      // Reconcile: move skipped tracks from tracksAdded to tracksNotFound
      if (addResult.skipped > 0) {
        const actuallyAdded = tracksAdded.slice(0, addResult.trackCount);
        const skippedTracks = tracksAdded.slice(addResult.trackCount);
        skippedTracks.forEach((t) =>
          tracksNotFound.push({
            title: t.title,
            artist: t.artist,
            reason: "Skipped during playlist add (unavailable)",
          }),
        );
        tracksAdded.length = 0;
        tracksAdded.push(...actuallyAdded);
      }
    }

    // Step 7 — build and return report
    const report = {
      source: {
        url: matchedItem.link,
        title: matchedItem.title,
        date: matchedItem.pubDate || todayUTC(),
      },
      playlist,
      tracksAdded: tracksAdded.map(({ title, artist }) => ({ title, artist })),
      tracksNotFound,
      summary: {
        total: parsedTracks.length,
        added: tracksAdded.length,
        notFound: tracksNotFound.length,
      },
    };

    return res.send(report);
  } catch (err) {
    return sendSanitizedError(res, err, {
      handler: "getMusicDiscovery",
      logContext: {
        type,
        articleUrl: matchedItem?.link,
      },
    });
  }
};
