import * as cheerio from "cheerio";

/**
 * Scrapes the HTML content of a given URL using Cheerio.
 * @param {string} url - The URL to scrape.
 * @returns {Promise<CheerioStatic>} - A promise that resolves to the Cheerio object representing the scraped HTML.
 */
export const scrape = async (url) => {
  const res = await fetch(url);
  const html = await res.text();
  return cheerio.load(html);
};
