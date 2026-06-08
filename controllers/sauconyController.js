import { scrape } from "../services/scraperService.js";

const URL = {
  BASE: "https://www.saucony.com.ar",
  LISTING_GUIDE_8_5:
    "https://saucony.com.ar/hombre/calzado1/tipo1/running1/?Talle=Us%208.5%20%2F%2026%2C5%20Cm&m_estilo=Guide",
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
    const $ = await scrape(URL.LISTING_GUIDE_8_5);

    // 1. Check if the product container selector exists in the page
    const productNodes = $(SELECTORS.PRODUCTS);
    if (productNodes.length === 0) {
      // Selector not found — either no products match the filter, or page structure changed
      // Distinguish by checking if the "no products" message exists
      const noProductsMessage = $("h6.text-center").text();
      if (noProductsMessage.includes("No tenemos productos")) {
        console.warn("[getSauconyShoes] Upstream returned 0 products for this filter combination");
        return res.status(404).send({
          error: "No products found for the specified model and size",
          detail: "The upstream page confirms no products match this filter",
        });
      }

      // Selector missing — page structure likely changed
      console.error("[getSauconyShoes] Product selector not found — page structure may have changed");
      return res.status(502).send({
        error: "Product selector not found on upstream page",
        detail: `Selector '${SELECTORS.PRODUCTS}' returned 0 elements. Page structure may have changed.`,
      });
    }

    // 2. Extract products
    const shoes = [];
    productNodes.each((_, el) => {
      const product = {
        id: $(el).attr(CONSTANTS.PID),
        name: $(el).find(SELECTORS.NAME).first().text().trim(),
        url: $(el).find(SELECTORS.URL).attr(CONSTANTS.HREF),
        price: $(el).find(SELECTORS.PRICE).first().text().trim(),
        variants: null,
      };
      shoes.push(product);
    });

    const source = {
      site: SOURCE.SITE,
      baseUrl: URL.BASE,
      listingUrl: URL.LISTING_GUIDE_8_5,
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
