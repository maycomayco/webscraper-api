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
    // return { status: 200, data: shoes };
    res.send({ status: 200, data: shoes });
  } catch (error) {
    res.status(500).send({ status: "FAILED", error: error?.message || error });
  }
};
