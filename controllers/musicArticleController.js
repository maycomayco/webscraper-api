import { discover } from "../services/musicDiscoveryService.js";

const URL = {
    BASE: "https://indiehoy.com",
    ARTICLE: "https://indiehoy.com/noticias/10-lanzamientos-para-escuchar-esta-semana-2026-05-27/",
};

const SOURCE = {
    SITE: "IndieHoy",
};

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

/**
 * Scrapes IndieHoy's weekly music article and returns extracted artist/song
 * pairs as JSON. Empty results are treated as a gateway failure (502).
 *
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @returns {Promise<void>}
 */
export const getIndieHoyMusic = async (req, res) => {
    try {
        const result = await discover(
            { site: SOURCE.SITE, baseUrl: URL.BASE, parser: indieHoyParser },
            URL.ARTICLE
        );

        if (result.data.length === 0) {
            console.warn("[getIndieHoyMusic] No music entries found — selector may be stale or page content changed");
            return res.status(502).send({ error: "No music entries parsed from upstream page" });
        }

        res.send(result);
    } catch (error) {
        if (error.name === "TimeoutError") {
            return res.status(504).send({ error: "Upstream timeout" });
        }
        if (error.message?.startsWith("Upstream ")) {
            return res.status(502).send({ error: error.message });
        }
        res.status(500).send({ error: error?.message || "Internal error" });
    }
};
