const axios = require("axios");
const cheerio = require("cheerio");
const express = require("express");

const PORT = 3001;
const app = express();

const axiosClient = axios.create({
  timeout: 5000,
});

app.get("/api/newbalance", (req, res) => {
  // get html
  axiosClient(
    "https://www.newbalance.com.ar/hombre/zapatillas/running/trail-running"
  )
    .then((resp) => resp.data)
    .then((data) => {
      const $ = cheerio.load(data);
      const jsonResponse = { sitename: "New Balance", products: [] };
      $(".prd").each((i, el) => {
        const product = {
          name: $(el).find(".item-title > a").text().trim(),
          url: $(el).find(".item-title > a").attr("href"),
          price: $(el).find(".item-price .price").text(),
          variant: $(el)
            .find(".item-img > a")
            .attr("title")
            .toLocaleLowerCase(),
        };
        jsonResponse.products.push(product);
      });
      res.send(jsonResponse);
    });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
