# AGENTS.md

## Commands

- `yarn dev` — run with nodemon (auto-reload) on port `3001` (override via `PORT` env var).
- `yarn start` — run production server (`node index.js`).
- No test, lint, or build tooling is configured.

Node version is pinned by `.node-version` to **18.15.0**. The project uses native ESM (`"type": "module"`), so all relative imports must include the `.js` extension.

## Architecture

The app is a thin Express API that scrapes e-commerce sites and returns JSON. It is organized in three clearly separated layers, and any new scraper should preserve that separation:

1. **Routes layer** — `v1/routes/*.js`
   Declares HTTP endpoints under the `/api/v1` prefix (mounted in `index.js`). Routes only wire URLs to controller functions; they contain no scraping logic. The `v1/` directory exists to make future API versioning explicit — new breaking versions should go under a sibling `v2/` rather than mutating `v1`.

2. **Controllers layer** — `controllers/*.js`
   One controller per target site (e.g. `newbalanceController.js`). Each controller owns:
   - The set of source URLs for that site (`URL` constant object).
   - The CSS selectors used to extract fields (`SELECTORS` constant object).
   - The request handler that calls the scraper service, iterates the product nodes with Cheerio, and shapes the JSON response.

   Controllers are the only place where site-specific knowledge (URLs, selectors, DOM shape) lives. Errors are caught and returned as `{ status: "FAILED", error }` with HTTP 500.

3. **Services layer** — `services/scraperService.js`
   Exposes a single generic `scrape(url)` that fetches the HTML with the global `fetch` and returns a loaded Cheerio instance (`$`). The service is site-agnostic — it must not be specialized per site. New controllers reuse it as-is.

### Data flow
`request → sitesRoutes → <site>Controller → scraperService.scrape(url) → Cheerio traversal in controller → JSON response`

### Adding a new site
1. Add a new controller in `controllers/` with its `URL` and `SELECTORS` objects and one exported handler per endpoint.
2. Register the route in `v1/routes/sitesRoutes.js` (or a new `*Routes.js` file mounted from `index.js` if the grouping warrants it).
3. Reuse `scrape()` from `services/scraperService.js` — do not add `fetch`/parsing logic to controllers.
