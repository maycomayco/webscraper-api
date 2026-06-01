import { discover } from "../services/musicDiscoveryService.js";
import {
  searchSong,
  createPlaylist,
  addTracksToPlaylist,
  YoutubeMusicAuthError,
  YoutubeMusicRateLimitError,
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

// --- IndieHoy Source Config ---------------------------------------------------

const URL = {
  BASE: "https://indiehoy.com",
  ARTICLE:
    "https://indiehoy.com/noticias/10-lanzamientos-para-escuchar-esta-semana-2026-05-27/",
};

const SOURCE = {
  SITE: "IndieHoy",
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
 * Full discovery pipeline:
 *  1. Scrape the IndieHoy article for artist/song pairs
 *  2. Search each pair on YouTube Music
 *  3. Create a playlist with the weekly naming convention
 *  4. Add found tracks to the playlist
 *  5. Return a structured report
 *
 * Partial failures (some tracks not found) are OK — they are reported but
 * do not fail the whole request. Only auth/rate-limit/unexpected errors
 * trigger an HTTP error response.
 *
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @returns {Promise<void>}
 */
export const getMusicDiscovery = async (req, res) => {
  try {
    // Step 1 — scrape and parse
    const result = await discover(
      { site: SOURCE.SITE, baseUrl: URL.BASE, parser: indieHoyParser },
      URL.ARTICLE,
    );

    if (result.data.length === 0) {
      console.warn(
        "[getMusicDiscovery] No music entries parsed — selector may be stale or page content changed",
      );
      return res.status(502).send({
        status: "FAILED",
        error: "No music entries parsed from upstream page",
      });
    }

    // Step 2 — search each track on YouTube Music
    const parsedTracks = result.data; // Array<{ artist, song }>
    const tracksFound = [];
    const tracksNotAdded = [];

    console.info(`[getMusicDiscovery] Searching ${parsedTracks.length} tracks on YouTube Music`);

    for (const track of parsedTracks) {
      try {
        console.info(`[getMusicDiscovery] Searching: "${track.artist} - ${track.song}"`);
        const match = await searchSong(track.artist, track.song);

        if (match && match.videoId) {
          console.info(`[getMusicDiscovery] ✓ Found: "${match.title}" (${match.videoId})`);
          tracksFound.push({
            title: match.title,
            artist: match.artist || track.artist,
            videoId: match.videoId,
          });
        } else {
          console.warn(`[getMusicDiscovery] ✗ Not found: "${track.artist} - ${track.song}"`);
          tracksNotAdded.push({
            title: track.song,
            artist: track.artist,
            reason: "Not found on YouTube Music",
          });
        }
      } catch (err) {
        // searchSong failures (auth, rate-limit) are fatal — propagate
        throw err;
      }
    }

    console.info(`[getMusicDiscovery] Search complete: ${tracksFound.length} found, ${tracksNotAdded.length} not found`);

    // Step 3 — create playlist (only if we found tracks)
    let playlist = null;
    const tracksAdded = [];

    if (tracksFound.length > 0) {
      const created = await createPlaylist(playlistTitle());
      playlist = {
        title: created.title,
        id: created.playlistId,
        url: created.url,
      };

      // Step 4 — add found tracks to the playlist
      const videoIds = tracksFound.map((t) => t.videoId);
      const addResult = await addTracksToPlaylist(created.playlistId, videoIds);

      // Classify added vs failed
      const addedSet = new Set(addResult.added);
      for (const track of tracksFound) {
        if (addedSet.has(track.videoId)) {
          tracksAdded.push({ title: track.title, artist: track.artist });
        }
      }
      for (const fail of addResult.failed) {
        const track = tracksFound.find((t) => t.videoId === fail.videoId);
        tracksNotAdded.push({
          title: track?.title ?? fail.videoId,
          artist: track?.artist ?? "",
          reason: `Failed to add to playlist: ${fail.reason}`,
        });
      }
    }

    // Step 5 — build and return report
    const report = {
      playlist,
      tracksAdded,
      tracksNotAdded,
      summary: {
        total: parsedTracks.length,
        added: tracksAdded.length,
        notAdded: tracksNotAdded.length,
      },
    };

    return res.send(report);
  } catch (err) {
    if (err instanceof YoutubeMusicAuthError) {
      return res.status(401).json({
        status: "FAILED",
        error: err.message,
      });
    }

    if (err instanceof YoutubeMusicRateLimitError) {
      return res.status(429).json({
        status: "FAILED",
        error: err.message,
      });
    }

    if (err.name === "TimeoutError") {
      return res.status(504).json({
        status: "FAILED",
        error: "Upstream timeout",
      });
    }

    if (err.message?.startsWith("Upstream ")) {
      return res.status(502).json({
        status: "FAILED",
        error: err.message,
      });
    }

    console.error("[getMusicDiscovery] Unexpected error:", err);
    return res.status(500).json({
      status: "FAILED",
      error: err?.message || "Internal error",
    });
  }
};
