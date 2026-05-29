import NodeCache from "node-cache";
import * as cheerio from "cheerio";
import { FETCH_TIMEOUT_MS, CACHE_TTL_S } from "../constants/config.js";

// Cache raw HTML keyed by URL. We store HTML strings (not Cheerio objects)
// because Cheerio instances have internal state that can't be safely serialized.
// checkperiod: 120s — how often node-cache scans for expired keys.
const cache = new NodeCache({ stdTTL: CACHE_TTL_S, checkperiod: 120 });

/**
 * Fetches a URL and returns a Cheerio instance for DOM traversal.
 * Implements a cache-aside pattern: on cache miss, fetches upstream,
 * stores the raw HTML, and returns a loaded Cheerio object.
 *
 * @param {string} url - The URL to scrape.
 * @returns {Promise<CheerioStatic>} A Cheerio instance loaded with the page HTML.
 * @throws {Error} When the upstream returns a non-2xx status.
 */
export const scrape = async (url) => {
    // Cache-aside: return immediately on hit, skip the network call
    const cached = cache.get(url);
    if (cached) {
        return cheerio.load(cached);
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
        console.error(`[scrape] Upstream error ${res.status} for ${url}`);
        throw new Error(`Upstream ${res.status}`);
    }

    const html = await res.text();

    // Only cache non-empty responses — empty HTML likely means bot detection
    // or an upstream issue. Caching it would serve broken pages for TTL duration.
    if (html.trim().length > 0) {
        cache.set(url, html);
    }

    return cheerio.load(html);
};
