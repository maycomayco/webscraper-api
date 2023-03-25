import * as cheerio from "cheerio";

// method to scrapte a specific url
export const scrape = async (url) => {
  const res = await fetch(url);
  const html = await res.text();
  return cheerio.load(html);
};
