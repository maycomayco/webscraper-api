# Web Scraper API

A small REST API that scrapes e-commerce sites and returns the results as JSON. Built with Node.js, Express, and Cheerio. Deployed on [Render](https://render.com).

## Stack

- Node.js 24.16.0 (see `.node-version`), native ESM
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
| GET    | `/music/discovery` | Finds IndieHoy recommendations on YouTube Music without authentication |

### Response Format

The shoe endpoints return a top-level `source` object with metadata about the scrape, alongside a `data` array of products:

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

### Music discovery

`GET /api/v1/music/discovery` finds the latest IndieHoy recommendations and
returns individual YouTube Music listening links. Searches are anonymous;
no playlist is created and no Google account setup is needed.

The optional `type` parameter accepts `tracks` (default) or `albums` to select
the source article. Both use song search for the extracted article headings.

```json
{
  "source": {
    "url": "https://indiehoy.com/noticias/example/",
    "title": "Lanzamientos para escuchar esta semana",
    "date": "Tue, 22 Sep 2026 12:00:00 GMT"
  },
  "tracksFound": [
    {
      "title": "Example song",
      "artist": "Example artist",
      "videoId": "example-id",
      "url": "https://music.youtube.com/watch?v=example-id"
    }
  ],
  "tracksNotFound": [],
  "summary": { "total": 1, "found": 1, "notFound": 0 }
}
```

Use `tracksFound` and `summary.found` for new consumers. Unmatched
recommendations appear in `tracksNotFound` with a title, artist, and reason; an
entirely unmatched article still returns HTTP 200 with an empty `tracksFound`
array.

Invalid types return 400, no matching article returns 404, upstream failures
return 502, upstream timeouts return 504, and YouTube rate limits return 429.
Errors use `{ "status": "FAILED", "error": "..." }`.

Previous `YOUTUBE_*` authentication variables and `data/youtube-oauth-tokens.json`
are no longer read and can be removed from your local environment and Render.

## Tests

Run `pnpm test`. The discovery HTTP tests use controlled upstream responses
and do not require credentials or network access.

## Project structure

```
index.js                    # Express app entry point
v1/routes/                  # HTTP routes (versioned under /api/v1)
controllers/                # One controller per target site (URLs + selectors + handler)
services/scraperService.js  # Generic fetch + Cheerio loader, reused by all controllers
```

## License

MIT. See [LICENSE](LICENSE).
