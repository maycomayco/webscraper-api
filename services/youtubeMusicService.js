import { Innertube } from "youtubei.js";

// --- Typed Errors -------------------------------------------------------------

export class YoutubeMusicAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = "YoutubeMusicAuthError";
    this.code = "AUTH_EXPIRED";
  }
}

export class YoutubeMusicRateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = "YoutubeMusicRateLimitError";
    this.code = "RATE_LIMITED";
  }
}

// --- Lazy Singleton -----------------------------------------------------------

/** @type {import("youtubei.js").Innertube | null} */
let client = null;
let initPromise = null;

/**
 * Lazy-initializes (or re-initializes) the Innertube client with cookie auth.
 * Uses a mutex (initPromise) so concurrent requests wait for the same init.
 *
 * @returns {Promise<import("youtubei.js").Innertube>}
 */
const initializeClient = async () => {
  if (client) return client;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const cookies = process.env.YOUTUBE_MUSIC_COOKIES;
    if (!cookies) {
      throw new YoutubeMusicAuthError(
        "YouTube Music auth failed — YOUTUBE_MUSIC_COOKIES env var is not set",
      );
    }

    try {
      client = await Innertube.create({ cookie: cookies });
      return client;
    } catch (err) {
      // Clear promise so next call can retry
      initPromise = null;
      throw classifyError(err);
    }
  })();

  try {
    return await initPromise;
  } catch (err) {
    initPromise = null;
    throw err;
  }
};

// --- Helpers ------------------------------------------------------------------

/**
 * Classifies raw errors from youtubei.js into typed application errors.
 *
 * Detection strategy (in order):
 *  1. Already-typed errors pass through (prevents double-wrapping).
 *  2. Explicit status property (future-proof if youtubei.js adds it).
 *  3. HTTP status code embedded in message string — e.g.
 *     "Request to ... failed with status code 401" (HTTPClient.js:94).
 *  4. Auth sentinel messages — e.g.
 *     "You must be signed in to perform this operation." (Session.js, Studio.js).
 *  5. Keyword fallback for edge cases.
 *
 * @param {Error} err
 * @returns {Error}
 */
const classifyError = (err) => {
  // Already-typed errors pass through unchanged — prevents double-wrapping
  // when an inner catch already classified and then withClient classifies again.
  if (err instanceof YoutubeMusicAuthError || err instanceof YoutubeMusicRateLimitError) {
    return err;
  }

  const msg = err.message || "";

  // --- Auth failures ---
  if (
    err.status === 401 ||
    msg.includes("status code 401") ||
    msg.includes("UNAUTHENTICATED") ||
    msg.includes("You must be signed in") ||
    msg.includes("auth") ||
    msg.includes("cookie") ||
    msg.includes("invalid")
  ) {
    return new YoutubeMusicAuthError(
      "YouTube Music auth failed — refresh YOUTUBE_MUSIC_COOKIES",
    );
  }

  // --- Rate limits ---
  if (
    err.status === 429 ||
    msg.includes("status code 429") ||
    msg.includes("rate")
  ) {
    return new YoutubeMusicRateLimitError(
      "YouTube Music rate limited — wait before retrying",
    );
  }

  return err;
};

/**
 * Wraps an async operation with auth checking and error classification.
 * If auth fails, clears the singleton so the next call re-initializes.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
const withClient = async (fn) => {
  try {
    const yt = await initializeClient();
    return await fn(yt);
  } catch (err) {
    const typed = classifyError(err);
    if (typed instanceof YoutubeMusicAuthError) {
      client = null;
      initPromise = null;
    }
    throw typed;
  }
};

// --- Testing Utility (not part of public API) ---------------------------------

/**
 * Resets the internal client singleton. For testing only.
 * @private
 */
export const _resetClient = () => {
  client = null;
  initPromise = null;
};

// --- Public API ---------------------------------------------------------------

/**
 * Searches YouTube Music for the top tracks of an artist.
 *
 * @param {string} name - Artist name.
 * @returns {Promise<Array<{ title: string, videoId: string, artist: string, duration: string | number }>>}
 */
export const searchArtist = (name) =>
  withClient(async (yt) => {
    const search = await yt.music.search(name);
    const shelf = search.songs;

    if (!shelf || !shelf.contents || shelf.contents.length === 0) {
      return [];
    }

    return shelf.contents.slice(0, 20).map((item) => ({
      title: item.flex_columns?.[0]?.title?.text ?? "",
      videoId:
        item.id ??
        item.flex_columns?.[0]?.title?.runs?.[0]?.endpoint?.payload?.videoId ??
        "",
      artist: item.artists?.[0]?.name ?? "",
      duration: item.duration?.seconds ?? 0,
    }));
  });

/**
 * Normalizes a string for fuzzy comparison: lowercase, strip accents,
 * remove punctuation and extra whitespace.
 * @param {string} str
 * @returns {string}
 */
const normalize = (str) =>
  str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9\s]/g, "") // strip punctuation
    .replace(/\s+/g, " ")
    .trim();

/**
 * Checks if two strings are similar enough to be considered a match.
 * Uses token overlap: what fraction of the expected tokens appear in the candidate.
 * @param {string} expected - The title we searched for.
 * @param {string} candidate - The title YouTube Music returned.
 * @returns {boolean}
 */
const isTitleMatch = (expected, candidate) => {
  const expTokens = normalize(expected).split(" ").filter(Boolean);
  const candNorm = normalize(candidate);

  if (expTokens.length === 0) return false;

  const hits = expTokens.filter((t) => candNorm.includes(t)).length;
  return hits / expTokens.length >= 0.5;
};

/**
 * Searches YouTube Music for a specific song by artist.
 * Iterates through search results and picks the first one whose title
 * matches the expected song (fuzzy). Returns null if no match passes validation.
 *
 * @param {string} artist - Artist name.
 * @param {string} song - Song title.
 * @returns {Promise<{ title: string, videoId: string, artist: string, duration: string | number } | null>}
 */
export const searchSong = (artist, song) =>
  withClient(async (yt) => {
    const query = `${artist} ${song}`;
    const search = await yt.music.search(query, { type: "song" });
    const shelf = search.songs;

    if (!shelf || !shelf.contents || shelf.contents.length === 0) {
      return null;
    }

    // Iterate results and pick the first whose title matches the expected song
    for (const item of shelf.contents.slice(0, 5)) {
      const title = item.flex_columns?.[0]?.title?.text ?? "";

      if (!isTitleMatch(song, title)) continue;

      const videoId =
        item.id ??
        item.flex_columns?.[0]?.title?.runs?.[0]?.endpoint?.payload?.videoId ??
        "";

      if (!videoId) continue;

      return {
        title,
        videoId,
        artist: item.artists?.[0]?.name ?? "",
        duration: item.duration?.seconds ?? 0,
      };
    }

    // No result matched the expected title
    return null;
  });

/**
 * Creates a YouTube Music playlist.
 *
 * @param {string} title - Playlist title.
 * @param {string} [description] - Optional description.
 * @returns {Promise<{ playlistId: string, title: string, trackCount: number, url: string }>}
 */
export const createPlaylist = (title, description) =>
  withClient(async (yt) => {
    const result = await yt.playlist.create(title, [], {
      description: description ?? "",
    });

    const playlistId = result.playlist_id ?? result.data?.playlistId ?? "";
    if (!playlistId) {
      throw new Error("Failed to create playlist — no playlist ID returned");
    }

    return {
      playlistId,
      title: result.data?.title ?? title,
      trackCount: 0,
      url: `https://music.youtube.com/playlist?list=${playlistId}`,
    };
  });

/**
 * Adds tracks (by videoId) to an existing playlist.
 * Unavailable tracks are skipped individually; the batch continues.
 *
 * @param {string} playlistId - Target playlist ID.
 * @param {string[]} videoIds - Video IDs to add.
 * @returns {Promise<{ trackCount: number, skipped: number }>}
 */
export const addTracksToPlaylist = (playlistId, videoIds) =>
  withClient(async (yt) => {
    let trackCount = 0;
    let skipped = 0;

    for (const videoId of videoIds) {
      try {
        await yt.playlist.addVideos(playlistId, [videoId]);
        trackCount++;
      } catch (err) {
        // 409 = track already in playlist (duplicate) — count as success
        if (err.message?.includes("409")) {
          console.info(
            `[youtubeMusicService] videoId ${videoId} already in playlist — skipping`,
          );
          trackCount++;
          continue;
        }

        // Check if this is an auth failure — if so, abort the batch
        const typed = classifyError(err);
        if (typed instanceof YoutubeMusicAuthError) {
          client = null;
          initPromise = null;
          throw new YoutubeMusicAuthError(
            "YouTube Music auth failed during batch add — refresh YOUTUBE_MUSIC_COOKIES. " +
              `Added ${trackCount} tracks before failure.`,
          );
        }
        // Otherwise skip this track and continue
        console.warn(
          `[youtubeMusicService] Skipping videoId ${videoId}: ${err.message}`,
        );
        skipped++;
      }

      // Throttle to avoid rate limits
      if (videoIds.length > 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    return { trackCount, skipped };
  });
