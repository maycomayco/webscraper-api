import { indieHoyParser } from "./musicArticleController.js";
import { discover } from "../services/musicDiscoveryService.js";
import {
  searchSong,
  createPlaylist,
  addTracksToPlaylist,
  YoutubeMusicAuthError,
  YoutubeMusicRateLimitError,
} from "../services/youtubeMusicService.js";

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
    const tracksAdded = [];
    const tracksNotFound = [];

    for (const track of parsedTracks) {
      try {
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
      } catch (err) {
        // searchSong failures (auth, rate-limit) are fatal — propagate
        throw err;
      }
    }

    // Step 3 — create playlist (only if we found tracks)
    let playlist = null;

    if (tracksAdded.length > 0) {
      const created = await createPlaylist(playlistTitle());
      playlist = {
        title: created.title,
        id: created.playlistId,
        url: created.url,
      };

      // Step 4 — add found tracks to the playlist
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
          })
        );
        tracksAdded.length = 0;
        tracksAdded.push(...actuallyAdded);
      }
    }

    // Step 5 — build and return report (strip videoId from response)
    const report = {
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
