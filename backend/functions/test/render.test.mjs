import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderPage, sitemap } from "../lib/render.js";

const products = JSON.parse(
    readFileSync(new URL("../../sample-products.json", import.meta.url)),
  ),
  settings = JSON.parse(
    readFileSync(new URL("../../sample-settings.json", import.meta.url)),
  );

test("public page metadata uses the storefront domain and current brand", () => {
  const product = {
    ...products[0],
    sample: false,
    responsiveImages: [
      {
        src: products[0].images[0],
        variants: [
          {
            src: "https://firebasestorage.googleapis.com/v0/b/example/o/480.webp",
            width: 480,
          },
        ],
      },
    ],
  };
  const page = renderPage(
    "<head><!--seo--></head><body><!--prerender--></body>",
    `/product/${product.slug}`,
    [product],
    settings,
  );
  assert.equal(page.status, 200);
  assert.match(page.html, /<title>.*ZAK ENTERPRISES<\/title>/);
  assert.match(
    page.html,
    new RegExp(
      `rel="canonical" href="https://www\\.shoerack\\.space/product/${product.slug}"`,
    ),
  );
  assert.match(page.html, /"name":"ZAK ENTERPRISES"/);
  assert.match(page.html, /srcset="https:\/\/firebasestorage\.googleapis\.com/);
  assert.match(sitemap([product], settings), /https:\/\/www\.shoerack\.space/);
  assert.match(sitemap([product], settings), new RegExp(product.slug));
});
