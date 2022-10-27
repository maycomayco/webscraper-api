const axios = require("axios");
const cheerio = require("cheerio");

const axiosClient = axios.create({
  timeout: 5000,
});

// get html
axiosClient(
  "https://www.newbalance.com.ar/hombre/zapatillas/running/trail-running"
)
  .then((resp) => resp.data)
  .then((data) => {
    const $ = cheerio.load(data);
    const products = [];
    $(".info-inner").each((i, el) => {
      const product = {
        name: $(el).find(".item-title > a").text().trim(),
        link: $(el).find(".item-title > a").attr("href"),
        price: $(el).find(".item-price .price").text(),
      };
      products.push(product);
    });
    console.log(products);
  });
