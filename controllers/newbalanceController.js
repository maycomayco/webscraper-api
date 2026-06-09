import { scrape } from "../services/scraperService.js";
import {
    sendFailure,
    sendSanitizedError,
} from "../services/httpErrorService.js";

const URL = {
    BASE: "https://www.newbalance.com.ar",
    TRAIL_RUNNING_SHOES_8_5_SIZE: "https://www.newbalance.com.ar/running/zapatillas/trail/?cgid=running-zapatillas-trail&prefn1=Gender&prefv1=Mens&prefn2=size&prefv2=8.5&srule=price-high-to-low&start=0&sz=9"
};

const SOURCE = {
    SITE: "New Balance",
};

const SELECTORS = {
    PRODUCTS: "div.product[data-pid]",
    NAME: ".pdp-link > a.link",
    URL: ".pdp-link > a.link",
    PRICE: ".price .sales .value",
    COLOR_SWATCHES: ".color-swatches",
    SWATCH_LINK: "a.swatch-link",
};

const CONSTANTS = {
    HREF: "href",
    PID: "data-pid",
};

// data-value format is "{productId}-{colorName}" — strip the id prefix to get the readable color name.
// If there's no dash (unexpected format), return the raw value rather than an empty string.
const getVariants = ($, el) => {
    if ($(el).find(SELECTORS.COLOR_SWATCHES).length === 0) return null;
    return $(el).find(SELECTORS.SWATCH_LINK).map((_, a) => {
        const value = $(a).attr("data-value") ?? "";
        const dashIdx = value.indexOf("-");
        return dashIdx === -1 ? value : value.slice(dashIdx + 1);
    }).get(); // .get() converts the Cheerio collection to a plain JS array
};

/**
 * Scrapes New Balance trail running shoes (size 8.5) and sends the result as JSON.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @returns {Promise<void>}
 */
export const getNewBalanceShoes = async (req, res) => {
    try {
        const $ = await scrape(URL.TRAIL_RUNNING_SHOES_8_5_SIZE);
        const shoes = [];

        $(SELECTORS.PRODUCTS).each((_, el) => {
            const product = {
                id: $(el).attr(CONSTANTS.PID),
                name: $(el).find(SELECTORS.NAME).first().text().trim(),
                url: URL.BASE + $(el).find(SELECTORS.URL).attr(CONSTANTS.HREF),
                // .first() is required because the price container holds two .value spans
                // (regular price + sale price); we always want the first one.
                price: $(el).find(SELECTORS.PRICE).first().text().trim(),
                variants: getVariants($, el),
            };
            shoes.push(product);
        });

        // Empty result means the upstream returned 200 but the page content changed
        // (bot-detection wall, HTML restructure, etc.) — treat it as a gateway failure.
        if (shoes.length === 0) {
            return sendFailure(res, {
                status: 502,
                publicMessage: "No products parsed from upstream page",
                handler: "getNewBalanceShoes",
                logLevel: "warn",
                logContext: {
                    site: SOURCE.SITE,
                    listingUrl: URL.TRAIL_RUNNING_SHOES_8_5_SIZE,
                    productSelector: SELECTORS.PRODUCTS,
                },
            });
        }

        const source = {
            site: SOURCE.SITE,
            baseUrl: URL.BASE,
            listingUrl: URL.TRAIL_RUNNING_SHOES_8_5_SIZE,
        };

        res.send({ source, data: shoes });
    } catch (error) {
        return sendSanitizedError(res, error, {
            handler: "getNewBalanceShoes",
            logContext: {
                site: SOURCE.SITE,
                listingUrl: URL.TRAIL_RUNNING_SHOES_8_5_SIZE,
            },
        });
    }
};
