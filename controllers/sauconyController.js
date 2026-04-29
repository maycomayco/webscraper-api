import { scrape } from "../services/scraperService.js";

const URL = {
    BASE: "https://www.saucony.com.ar",
    LISTING_8_5_SIZE: "https://saucony.com.ar/hombre/calzado1/tipo1/running1/?mpage=2&Talle=Us%208.5%20%2F%2026%2C5%20Cm",
};

const SOURCE = {
    SITE: "Saucony",
};

const SELECTORS = {
    PRODUCTS: ".js-item-product",
    NAME: ".js-item-name",
    URL: ".item-link",
    PRICE: ".js-price-display",
};

const CONSTANTS = {
    HREF: "href",
    PID: "data-product-id",
};

export const getSauconyShoes = async (req, res) => {
    try {
        const $ = await scrape(URL.LISTING_8_5_SIZE);
        const shoes = [];

        $(SELECTORS.PRODUCTS).each((_, el) => {
            const product = {
                id: $(el).attr(CONSTANTS.PID),
                name: $(el).find(SELECTORS.NAME).first().text().trim(),
                url: $(el).find(SELECTORS.URL).attr(CONSTANTS.HREF),
                price: $(el).find(SELECTORS.PRICE).first().text().trim(),
                // Saucony's listing page doesn't expose color variants — null keeps the response shape consistent with other brands.
                variants: null,
            };
            shoes.push(product);
        });

        if (shoes.length === 0) {
            console.warn("[getSauconyShoes] No products found — selector may be stale or page content changed");
            return res.status(502).send({ error: "No products parsed from upstream page" });
        }

        const source = {
            site: SOURCE.SITE,
            baseUrl: URL.BASE,
            listingUrl: URL.LISTING_8_5_SIZE,
        };

        res.send({ source, data: shoes });
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
