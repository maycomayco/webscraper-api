const { chromium } = require("playwright");
// const websites = require("./websites.json");

const options = { timeout: 5000 };
const PAGE_URL = "https://www.newbalance.com.ar/";

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(PAGE_URL);

  await page
    .locator(".sns-serachbox-pro", { timeout: 5000 })
    .hover({ timeout: 5000 });
  await page
    .locator('[placeholder="Buscar en la tienda"]', { timeout: 5000 })
    .fill("hierro");
  await page.locator('[title="Búsqueda"]').click();

  // await page.close();

  // end of execution
  // await browser.close();
})();
