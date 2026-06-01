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
 * @param {Error} err
 * @returns {Error}
 */
const classifyError = (err) => {
  // Auth failures
  if (
    err.status === 401 ||
    err.message?.includes("auth") ||
    err.message?.includes("cookie") ||
    err.message?.includes("invalid")
  ) {
    return new YoutubeMusicAuthError(
      "YouTube Music auth failed — refresh YOUTUBE_MUSIC_COOKIES",
    );
  }

  // Rate limits
  if (err.status === 429 || err.message?.includes("rate")) {
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
      videoId: item.id ?? "",
      artist: item.artists?.[0]?.name ?? "",
      duration: item.duration?.seconds ?? 0,
    }));
  });

/**
 * Searches YouTube Music for a specific song by artist.
 * Returns the single best match or null if nothing found.
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

    const track = {
      title: shelf.contents[0].flex_columns?.[0]?.title?.text ?? "",
      videoId: shelf.contents[0].id ?? "",
      artist: shelf.contents[0].artists?.[0]?.name ?? "",
      duration: shelf.contents[0].duration?.seconds ?? 0,
    };

    return track;
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
