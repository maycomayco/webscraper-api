# Web Scraper API

A small REST API that scrapes e-commerce sites and returns the results as JSON. Built with Node.js, Express, and Cheerio. Deployed on [Render](https://render.com).

## Stack

- Node.js 18.15.0 (see `.node-version`), native ESM
- Express 4
- Cheerio 1 for HTML parsing

## Getting started

```bash
yarn install
yarn dev      # starts nodemon on port 3001
yarn start    # runs the server with node
```

Override the port with the `PORT` environment variable.

## Endpoints

All routes are served under `/api/v1`.

| Method | Path          | Description                                    |
| ------ | ------------- | ---------------------------------------------- |
| GET    | `/newbalance` | Returns New Balance Hierro shoes from NB Argentina |

Example response:

```json
{
  "status": 200,
  "data": [
    {
      "id": 0,
      "name": "Fresh Foam X Hierro v7",
      "url": "https://www.newbalance.com.ar/...",
      "price": "$ 189.999",
      "variant": "black"
    }
  ]
}
```

## Project structure

```
index.js                    # Express app entry point
v1/routes/                  # HTTP routes (versioned under /api/v1)
controllers/                # One controller per target site (URLs + selectors + handler)
services/scraperService.js  # Generic fetch + Cheerio loader, reused by all controllers
```

## License

MIT. See [LICENSE](LICENSE).
