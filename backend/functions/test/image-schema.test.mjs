import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { productSchema } from "../lib/schema.js";

test("Storage emulator URLs are accepted only in demo Functions; production requires HTTPS", () => {
  const product = JSON.parse(
    readFileSync(new URL("../../sample-products.json", import.meta.url)),
  )[0];
  const project = process.env.GCLOUD_PROJECT;
  const emulator = process.env.FUNCTIONS_EMULATOR;
  try {
    product.images = [
      "http://127.0.0.1:9199/v0/b/demo-rufus.appspot.com/o/public%2Fproducts%2Ftest?alt=media",
    ];
    process.env.GCLOUD_PROJECT = "demo-rufus";
    process.env.FUNCTIONS_EMULATOR = "true";
    assert.equal(productSchema.safeParse(product).success, true);
    process.env.FUNCTIONS_EMULATOR = "false";
    assert.equal(productSchema.safeParse(product).success, false);
    process.env.FUNCTIONS_EMULATOR = "true";
    process.env.GCLOUD_PROJECT = "rufus-website-540cb";
    assert.equal(productSchema.safeParse(product).success, false);
    product.images = [
      "https://firebasestorage.googleapis.com/v0/b/example/o/test",
    ];
    assert.equal(productSchema.safeParse(product).success, true);
    product.responsiveImages = [
      {
        src: product.images[0],
        variants: [
          {
            src: "https://firebasestorage.googleapis.com/v0/b/example/o/test-480.webp",
            width: 480,
          },
          {
            src: "https://firebasestorage.googleapis.com/v0/b/example/o/test-960.webp",
            width: 960,
          },
        ],
      },
    ];
    assert.equal(productSchema.safeParse(product).success, true);
    product.responsiveImages[0].variants[0].width = 0;
    assert.equal(productSchema.safeParse(product).success, false);
  } finally {
    if (project === undefined) delete process.env.GCLOUD_PROJECT;
    else process.env.GCLOUD_PROJECT = project;
    if (emulator === undefined) delete process.env.FUNCTIONS_EMULATOR;
    else process.env.FUNCTIONS_EMULATOR = emulator;
  }
});
