import * as cheerio from "cheerio";
import { FETCH_TIMEOUT_MS } from "../constants/config.js";

/**
 * Scrapes the HTML content of a given URL using Cheerio.
 * @param {string} url - The URL to scrape.
 * @returns {Promise<CheerioStatic>} - A promise that resolves to the Cheerio object representing the scraped HTML.
 */
export const scrape = async (url) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
    console.error(`[scrape] Upstream error ${res.status} for ${url}`);
    throw new Error(`Upstream ${res.status}`);
  }
    const html = await res.text();
    return cheerio.load(html);
};
