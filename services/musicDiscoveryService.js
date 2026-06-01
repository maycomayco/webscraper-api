import { scrape } from "./scraperService.js";

/**
 * Discovers music entries from a source using its parser strategy.
 * Delegates HTML fetching to scraperService and extraction to the
 * source config's parser function. Site-specific knowledge (selectors,
 * regex) stays in the controller; this service stays agnostic.
 *
 * @param {Object} sourceConfig - { site, baseUrl, parser }
 * @param {Function} sourceConfig.parser - ($) => items[]
 * @param {string} url - The listing URL to scrape.
 * @returns {Promise<Object>} { source: { site, baseUrl, listingUrl }, data: items[] }
 */
export const discover = async (sourceConfig, url) => {
    const $ = await scrape(url);
    const items = sourceConfig.parser($);

    return {
        source: {
            site: sourceConfig.site,
            baseUrl: sourceConfig.baseUrl,
            listingUrl: url,
        },
        data: items,
    };
};
