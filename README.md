# Web Scraper API

A small REST API that scrapes e-commerce sites and returns the results as JSON. Built with Node.js, Express, and Cheerio. Deployed on [Render](https://render.com).

## Stack

- Node.js 18.15.0 (see `.node-version`), native ESM
- Express 4
- Cheerio 1 for HTML parsing

## Getting started

```bash
pnpm install
pnpm dev      # starts nodemon on port 3001
pnpm start    # runs the server with node
```

Override the port with the `PORT` environment variable.

## Endpoints

All routes are served under `/api/v1`.

| Method | Path          | Description                                    |
| ------ | ------------- | ---------------------------------------------- |
| GET    | `/newbalance` | Returns New Balance trail running shoes (size 8.5) from NB Argentina |
| GET    | `/saucony`    | Returns Saucony running shoes (size US 8.5) from Saucony Argentina |

### Response Format

Each endpoint returns a top-level `source` object with metadata about the scrape, alongside a `data` array of products:

```json
{
  "source": {
    "site": "New Balance",
    "baseUrl": "https://www.newbalance.com.ar",
    "listingUrl": "https://www.newbalance.com.ar/running/zapatillas/trail/?cgid=running-zapatillas-trail&prefn1=Gender&prefv1=Mens&prefn2=size&prefv2=8.5&srule=price-high-to-low&start=0&sz=9"
  },
  "data": [
    {
      "id": "N1T000338",
      "name": "Fresh Foam X Hierro v9 GORE-TEX®",
      "url": "https://www.newbalance.com.ar/hombre-zapatillas-N1T000338.html",
      "price": "$269.999",
      "variants": ["Black/Faded Black/Castlerock", "Mosaic Green/Permafrost/Black"]
    },
    {
      "id": "N1T000258",
      "name": "Fresh Foam X Hierro v9",
      "url": "https://www.newbalance.com.ar/hombre-zapatillas-N1T000258.html",
      "price": "$239.999",
      "variants": ["Urgent Red/Reflection/Raincloud", "Black Cement/Black"]
    }
  ]
}
```

**Response fields:**

- `source.site`: The brand name
- `source.baseUrl`: The website base URL for the scraper
- `source.listingUrl`: The specific product listing URL that was scraped
- `data`: Array of products from the listing
  - `id`: Product identifier
  - `name`: Product display name
  - `url`: Link to the product detail page
  - `price`: Price as displayed on the site (includes currency symbol)
  - `variants`: Array of color/style variants, or `null` if unavailable

## Project structure

```
index.js                    # Express app entry point
v1/routes/                  # HTTP routes (versioned under /api/v1)
controllers/                # One controller per target site (URLs + selectors + handler)
services/scraperService.js  # Generic fetch + Cheerio loader, reused by all controllers
```

## License

MIT. See [LICENSE](LICENSE).
