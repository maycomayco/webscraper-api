import { scrape } from "../services/scraperService.js";
import {
  sendFailure,
  sendSanitizedError,
} from "../services/httpErrorService.js";

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
        return sendFailure(res, {
          status: 404,
          publicMessage: "No products found for the specified model and size",
          handler: "getSauconyShoes",
          logLevel: "warn",
          logContext: {
            site: SOURCE.SITE,
            listingUrl: URL.LISTING_GUIDE_8_5,
            reason: "upstream_empty_listing",
          },
        });
      }

      // Selector missing — page structure likely changed
      return sendFailure(res, {
        status: 502,
        publicMessage: "Unable to parse upstream product listing",
        handler: "getSauconyShoes",
        logLevel: "error",
        logContext: {
          site: SOURCE.SITE,
          listingUrl: URL.LISTING_GUIDE_8_5,
          productSelector: SELECTORS.PRODUCTS,
          reason: "product_selector_missing",
        },
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
    return sendSanitizedError(res, error, {
      handler: "getSauconyShoes",
      logContext: {
        site: SOURCE.SITE,
        listingUrl: URL.LISTING_GUIDE_8_5,
      },
    });
  }
};
