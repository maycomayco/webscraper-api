import { XMLParser } from "fast-xml-parser";
import { FETCH_TIMEOUT_MS } from "../constants/config.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

/**
 * Fetches an RSS/Atom feed and returns normalized items.
 * @param {string} url - Feed URL.
 * @returns {Promise<{ title: string, link: string, pubDate: string, categories: string[] }[]>}
 * @throws {Error} "RSS_UNAVAILABLE" on network or parse failure.
 */
export const fetchFeed = async (url) => {
  let res;

  try {
    res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (err) {
    throw new Error("RSS_UNAVAILABLE");
  }

  if (!res.ok) {
    throw new Error("RSS_UNAVAILABLE");
  }

  let obj;
  try {
    const xml = await res.text();
    obj = parser.parse(xml);
  } catch (err) {
    throw new Error("RSS_UNAVAILABLE");
  }

  const rawItems = obj.rss?.channel?.item ?? [];
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  return items.map((item) => ({
    title: String(item.title ?? "").trim(),
    link: String(item.link ?? "").trim(),
    pubDate: String(item.pubDate ?? "").trim(),
    categories: Array.isArray(item.category)
      ? item.category.map(String).map((c) => c.trim())
      : item.category
        ? [String(item.category).trim()]
        : [],
  }));
};
