import { scrape } from "../services/scraperService.js";

const URL = {
    TRAIL_RUNNING_SHOES_8_5_SIZE: "https://www.newbalance.com.ar/running/zapatillas/trail/?cgid=running-zapatillas-trail&prefn1=Gender&prefv1=Mens&prefn2=size&prefv2=8.5&srule=price-high-to-low&start=0&sz=9"
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
};

const getVariants = ($, el) => {
    if ($(el).find(SELECTORS.COLOR_SWATCHES).length === 0) return null;
    return $(el).find(SELECTORS.SWATCH_LINK).map((_, a) => {
        const value = $(a).attr("data-value") ?? "";
        return value.slice(value.indexOf("-") + 1);
    }).get();
};

/**
 * Retrieves Hierro shoes from a specified URL and sends the scraped data as a response.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise<void>} - A promise that resolves when the data is sent as a response.
 */
export const getNewBalanceShoes = async (req, res) => {
    try {
        const $ = await scrape(URL.TRAIL_RUNNING_SHOES_8_5_SIZE);
        const shoes = [];

        $(SELECTORS.PRODUCTS).each((idx, el) => {
            const product = {
                id: idx,
                name: $(el).find(SELECTORS.NAME).text().trim(),
                url: $(el).find(SELECTORS.URL).attr(CONSTANTS.HREF),
                price: $(el).find(SELECTORS.PRICE).first().text().trim(),
                variants: getVariants($, el),
            };
            shoes.push(product);
        });

        res.send({ data: shoes });
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
