import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { StoreService } from "../lib/service.js";
import { renderPage, sitemap } from "../lib/render.js";
if (!process.env.FIRESTORE_EMULATOR_HOST)
  throw Error("Run through Firebase emulators; refusing live test access.");
const app = initializeApp({ projectId: "demo-rufus" }, "service-tests"),
  db = getFirestore(app),
  service = new StoreService(db);
const catalog = JSON.parse(
    await readFile(new URL("../../sample-products.json", import.meta.url)),
  ),
  settings = JSON.parse(
    await readFile(new URL("../../sample-settings.json", import.meta.url)),
  );
const buyer = {
  name: "Test Buyer",
  phone: "9876543210",
  email: "",
  address: "Test street number 10",
  pin: "600001",
  city: "Chennai",
  state: "Tamil Nadu",
};
beforeEach(async () => {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-rufus/databases/(default)/documents`,
    { method: "DELETE" },
  );
  const b = db.batch();
  for (const p of catalog)
    b.set(db.doc("products/" + p.id), structuredClone(p));
  b.set(db.doc("settings/public"), structuredClone(settings));
  await b.commit();
});
after(async () => {
  await db.terminate();
  await deleteApp(app);
});
async function payload(method = "cod", quantity = 1) {
  const items = [{ productId: "sample-1", variantId: "v1", quantity }];
  const q = await service.quote({ items, paymentMethod: method });
  return {
    items,
    paymentMethod: method,
    buyer,
    idempotencyKey: randomUUID(),
    expectedTotal: q.total,
    expectedQuote: q.quoteHash,
    ...(method === "upi" ? { utr: "TESTREF12345" } : {}),
  };
}
async function stock() {
  return (await db.doc("products/sample-1").get()).data().variants[0].stock;
}
test("authoritative paise totals, COD fee, pending manual verification and opaque lookup", async () => {
  const input = await payload();
  const result = await service.create(input, "guest1");
  assert.equal(result.total, 349900 + 9900 + 4900);
  const order = await service.lookup(result.id, result.token);
  assert.equal(order.paymentStatus, "unpaid");
  assert.equal(order.fulfillmentStatus, "pending_verification");
  assert.equal(order.reserved, true);
  assert.equal(await stock(), 7);
  assert.equal(order.tokenHash, undefined);
  assert.equal(order.ownerUid, undefined);
  await assert.rejects(service.lookup(result.id, "x".repeat(64)));
});
test("rejects tampered totals, unexpected trusted fields, negative quantities, duplicate lines", async () => {
  const input = await payload();
  await assert.rejects(service.create({ ...input, expectedTotal: 1 }, "guest"));
  await assert.rejects(
    service.create({ ...input, paymentStatus: "paid" }, "guest"),
  );
  await assert.rejects(
    service.create(
      { ...input, items: [{ ...input.items[0], quantity: -1 }] },
      "guest",
    ),
  );
  await assert.rejects(
    service.quote({
      paymentMethod: "cod",
      items: [...input.items, ...input.items],
    }),
  );
  assert.equal(await stock(), 8);
});
test("revalidates changed prices and payment settings", async () => {
  const input = await payload();
  await db.doc("settings/public").update({ "cod.fee": 5000 });
  await assert.rejects(service.create(input, "guest"));
  const fresh = await payload();
  await db
    .doc("settings/public")
    .update({ "cod.instructions": "changed instructions" });
  await assert.rejects(service.create(fresh, "guest"));
  await db.doc("settings/public").update({ "cod.enabled": false });
  await assert.rejects(
    service.quote({ items: input.items, paymentMethod: "cod" }),
  );
});
test("concurrent requests cannot oversell", async () => {
  const p = catalog[0];
  await db.doc("products/sample-1").update({
    variants: p.variants.map((v, i) => ({
      ...v,
      stock: i === 0 ? 1 : v.stock,
    })),
  });
  const a = await payload(),
    b = await payload();
  const results = await Promise.allSettled([
    service.create(a, "a"),
    service.create(b, "b"),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(await stock(), 0);
});
test("idempotent simultaneous retries return one order and reserve once", async () => {
  const input = await payload();
  const [a, b] = await Promise.all([
    service.create(input, "same"),
    service.create(input, "same"),
  ]);
  assert.deepEqual(a, b);
  assert.equal(await stock(), 7);
  assert.equal((await db.collection("orders").get()).size, 1);
  await assert.rejects(
    service.create(
      { ...input, buyer: { ...buyer, name: "Changed buyer" } },
      "same",
    ),
  );
});
test("concurrent cancellation restores inventory exactly once", async () => {
  const a = await service.create(await payload(), "guest");
  await Promise.all([
    service.transition(a.id, "cancel", "guest"),
    service.transition(a.id, "cancel", "admin"),
  ]);
  assert.equal(await stock(), 8);
  assert.equal(
    (await service.lookup(a.id, a.token)).fulfillmentStatus,
    "cancelled",
  );
});
test("UPI reference remains unverified, duplicates are flagged, rejects restore stock", async () => {
  const a = await service.create(await payload("upi"), "guest");
  const b = await service.create(await payload("upi"), "guest2");
  assert.equal(
    (await service.lookup(a.id, a.token)).paymentStatus,
    "pending_verification",
  );
  assert.equal(
    (await db.doc("orders/" + b.id).get()).data().duplicateReference,
    true,
  );
  await assert.rejects(service.transition(a.id, "processing", "admin"));
  await service.transition(a.id, "reject", "admin");
  assert.equal(await stock(), 7);
  assert.equal((await service.lookup(a.id, a.token)).paymentStatus, "rejected");
  await assert.rejects(service.transition(a.id, "approve_payment", "admin"));
});
test("UPI verified workflow, shipment, no cancellation/restock after shipping", async () => {
  const a = await service.create(await payload("upi"), "guest");
  await service.transition(a.id, "approve_payment", "admin");
  await assert.rejects(service.transition(a.id, "cancel", "admin"));
  await service.transition(a.id, "processing", "admin");
  await service.transition(a.id, "ship", "admin", {
    carrier: "Test",
    number: "TRACK-001",
    url: "",
  });
  await assert.rejects(service.transition(a.id, "cancel", "admin"));
  await service.transition(a.id, "deliver", "admin");
  assert.equal(
    (await service.lookup(a.id, a.token)).fulfillmentStatus,
    "delivered",
  );
  assert.equal(await stock(), 7);
});
test("COD verified/delivered and payment collected are separate transitions", async () => {
  const a = await service.create(await payload(), "guest");
  await assert.rejects(service.transition(a.id, "processing", "admin"));
  await assert.rejects(service.transition(a.id, "cod_collected", "admin"));
  await service.transition(a.id, "verify_cod", "admin");
  await service.transition(a.id, "processing", "admin");
  await service.transition(a.id, "ship", "admin", {
    carrier: "Test",
    number: "COD-001",
    url: "",
  });
  await service.transition(a.id, "deliver", "admin");
  assert.equal((await service.lookup(a.id, a.token)).paymentStatus, "unpaid");
  await service.transition(a.id, "cod_collected", "admin");
  assert.equal((await service.lookup(a.id, a.token)).paymentStatus, "paid");
});
test("expiry releases once and late approvals fail", async () => {
  const a = await service.create(await payload("upi"), "guest");
  await db
    .doc("orders/" + a.id)
    .update({ expiresAt: Timestamp.fromMillis(Date.now() - 1) });
  await assert.rejects(service.transition(a.id, "approve_payment", "admin"));
  await service.expire();
  await service.expire();
  assert.equal(await stock(), 8);
  assert.equal(
    (await service.lookup(a.id, a.token)).fulfillmentStatus,
    "expired",
  );
});
test("missing products/variants fail; archived products retain restorability", async () => {
  const input = await payload();
  const a = await service.create(input, "guest");
  await db.doc("products/sample-1").update({ published: false });
  await assert.rejects(
    service.create({ ...input, idempotencyKey: randomUUID() }, "other"),
  );
  await service.transition(a.id, "cancel", "guest");
  assert.equal(await stock(), 8);
  await assert.rejects(
    service.quote({
      paymentMethod: "cod",
      items: [{ productId: "missing", variantId: "v1", quantity: 1 }],
    }),
  );
});
test("receipt attachment owner checked; unique product slugs and variant history preserved", async () => {
  const a = await service.create(await payload("upi"), "guest");
  await assert.rejects(service.attachReceipt(a.id, "other"));
  await service.attachReceipt(a.id, "guest");
  assert.match(
    (await service.lookup(a.id, a.token)).receiptPath,
    /receipts\/guest/,
  );
  process.env.GCLOUD_PROJECT = "demo-rufus";
  await service.saveProduct(catalog[0], "admin");
  await assert.rejects(
    service.saveProduct({ ...catalog[1], slug: catalog[0].slug }, "admin"),
  );
  await assert.rejects(
    service.saveProduct(
      { ...catalog[0], variants: [catalog[0].variants[0]] },
      "admin",
    ),
  );
});
test("rate limiting and SSR metadata, sitemap and real route status", async () => {
  await service.rate("test", 1);
  await assert.rejects(service.rate("test", 1));
  const p = { ...catalog[0], sample: false };
  const page = renderPage(
    "<head><!--seo--></head><body><!--prerender--></body>",
    "/product/" + p.slug,
    [p],
    settings,
  );
  assert.equal(page.status, 200);
  assert.match(page.html, /<h1>The Entryway/);
  assert.match(page.html, /application\/ld\+json/);
  assert.match(page.html, /3499/);
  assert.match(page.html, /InStock/);
  assert.equal(
    renderPage("<!--seo--><!--prerender-->", "/product/missing", [p], settings)
      .status,
    404,
  );
  assert.match(
    renderPage("<!--seo-->", "/admin", [p], settings).html,
    /noindex/,
  );
  assert.match(sitemap([p], settings), /product\/the-entryway/);
  assert.doesNotMatch(sitemap([catalog[0]], settings), /product\/the-entryway/);
});
