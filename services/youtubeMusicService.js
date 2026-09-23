import { Innertube } from "youtubei.js";
import { UpstreamRequestError } from "./scraperService.js";

export class YoutubeMusicRateLimitError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "YoutubeMusicRateLimitError";
    this.code = "RATE_LIMITED";
    this.details = details;
  }
}

/** @type {Promise<import("youtubei.js").Innertube> | null} */
let clientPromise = null;

// Share anonymous initialization across requests; retry initialization if it fails.
// Credentials from the old OAuth/cookie setup are intentionally never loaded.
const initializeClient = () => {
  if (!clientPromise) {
    clientPromise = Innertube.create().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
};

const withClient = async (fn) => {
  try {
    return await fn(await initializeClient());
  } catch (err) {
    if (err.status === 429 || /status code 429\b/.test(err.message || "")) {
      throw new YoutubeMusicRateLimitError("YouTube Music rate limited", {
        originalMessage: err.message,
      });
    }
    if (err.name === "TimeoutError") throw err;
    throw new UpstreamRequestError("YouTube Music search failed", {
      cause: err,
      upstreamStatus: err.status,
    });
  }
};

/** Resets the anonymous client for isolated tests. */
export const _resetClient = () => {
  clientPromise = null;
};

/** Normalizes titles for fuzzy comparison. */
const normalize = (str) =>
  str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Accepts candidates containing at least half of the expected title tokens. */
const isTitleMatch = (expected, candidate) => {
  const expTokens = normalize(expected).split(" ").filter(Boolean);
  const candNorm = normalize(candidate);

  if (expTokens.length === 0) return false;

  const hits = expTokens.filter((t) => candNorm.includes(t)).length;
  return hits / expTokens.length >= 0.5;
};

/**
 * Finds the first of five results whose title matches the requested song.
 * @param {string} artist - Artist name.
 * @param {string} song - Song title.
 * @returns {Promise<{ title: string, videoId: string, artist: string, duration: string | number } | null>}
 */
export const searchSong = (artist, song) =>
  withClient(async (yt) => {
    const search = await yt.music.search(`${artist} ${song}`, { type: "song" });
    const shelf = search.songs;

    if (!shelf || !shelf.contents || shelf.contents.length === 0) {
      return null;
    }

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
    return null;
  });
