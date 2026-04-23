import { scrape } from "../services/scraperService.js";

const URL = {
  ALL_TRAIL_RUNNING_SHOES:
    "https://www.newbalance.com.ar/hombre/zapatillas/running/trail-running",
  HIERRO_SHOES:
    "https://www.newbalance.com.ar/catalogsearch/result/?cat=&q=%22hierro%22",
};

const SELECTORS = {
  PRODUCTS: ".prd",
  NAME: ".item-title > a",
  URL: ".item-title > a",
  PRICE: ".item-price .price",
  VARIANT: ".item-img > a",
};

const CONSTANTS = {
  HREF: "href",
  TITLE: "title",
};

/**
 * Retrieves Hierro shoes from a specified URL and sends the scraped data as a response.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise<void>} - A promise that resolves when the data is sent as a response.
 */
export const getHierroShoes = async (req, res) => {
  try {
    const $ = await scrape(URL.HIERRO_SHOES);
    const shoes = [];

    $(SELECTORS.PRODUCTS).each((idx, el) => {
      const product = {
        id: idx,
        name: $(el).find(SELECTORS.NAME).text().trim(),
        url: $(el).find(SELECTORS.URL).attr(CONSTANTS.HREF),
        price: $(el).find(SELECTORS.PRICE).text(),
        variant: $(el)
          .find(SELECTORS.VARIANT)
          .attr(CONSTANTS.TITLE)
          .toLocaleLowerCase(),
      };
      shoes.push(product);
    });
    res.send({ status: 200, data: shoes });
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
