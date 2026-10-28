import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
const requireBackend = createRequire(
  new URL("../../backend/package.json", import.meta.url),
);
const { initializeApp } = requireBackend("firebase-admin/app");
const { getAuth } = requireBackend("firebase-admin/auth");
const { getFirestore } = requireBackend("firebase-admin/firestore");
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const app = initializeApp({ projectId: "demo-rufus" }, "browser-tests"),
  db = getFirestore(app),
  adminAuth = getAuth(app);
const email = "admin-test@example.com",
  password = randomBytes(18).toString("hex");
const sampleProducts = JSON.parse(
  readFileSync(
    new URL("../../backend/sample-products.json", import.meta.url),
    "utf8",
  ),
);
const sampleSettings = JSON.parse(
  readFileSync(
    new URL("../../backend/sample-settings.json", import.meta.url),
    "utf8",
  ),
);
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jI1sAAAAASUVORK5CYII=",
  "base64",
);
test.beforeAll(async ({ request }) => {
  test.setTimeout(300000);
  try {
    const u = await adminAuth.getUserByEmail(email);
    await adminAuth.updateUser(u.uid, { password });
    await adminAuth.setCustomUserClaims(u.uid, { admin: true });
  } catch {
    const u = await adminAuth.createUser({ email, password });
    await adminAuth.setCustomUserClaims(u.uid, { admin: true });
  }
  const b = db.batch();
  for (const p of sampleProducts) b.set(db.doc("products/" + p.id), p);
  b.set(db.doc("settings/public"), sampleSettings);
  await b.commit();
  // The emulator announces routes before workers have loaded. Warm each worker
  // explicitly so UI assertions measure application behavior, not disk-bound
  // cold starts. Invalid unauthenticated payloads must be rejected.
  for (const [name, status] of Object.entries({
    quoteOrder: 400,
    createOrder: 400,
    lookupOrder: 400,
    cancelOrder: 400,
    attachReceipt: 400,
    saveSettings: 403,
    saveProduct: 403,
    updateOrder: 403,
  })) {
    const response = await request.post(
      `http://127.0.0.1:5001/demo-rufus/us-central1/${name}`,
      { data: { data: {} }, timeout: 120000 },
    );
    expect(
      response.status(),
      `${name} must reject an invalid unauthenticated readiness request`,
    ).toBe(status);
  }
  const storefront = await request.get("http://127.0.0.1:5000/", {
    timeout: 120000,
  });
  expect(storefront.status()).toBe(200);
});
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  const emulator = await page.evaluate(async () => {
    const path = "/src/services/firebase/index.ts";
    const firebase = await import(/* @vite-ignore */ path);
    return firebase.isEmulator;
  });
  expect(
    emulator,
    "Browser tests require npm run dev:emulators; refusing live mutations",
  ).toBe(true);
});
async function addItem(page: any, slug = "the-entryway") {
  await page.goto("/product/" + slug);
  await expect(
    page.getByRole("button", { name: "Add to cart", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Your cart" });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("Subtotal");
  await drawer.getByRole("link", { name: "Checkout" }).click();
  await expect(
    page.getByRole("heading", { name: "Order summary" }),
  ).toBeVisible();
}
async function buyer(page: any) {
  await page.getByLabel("Full name").fill("Browser Test Buyer");
  await page.getByLabel("Mobile number").fill("9876543210");
  await page
    .getByLabel("House / flat, street & locality")
    .fill("42 Local Test Street");
  await page.getByLabel("PIN code", { exact: true }).fill("600001");
  await page.getByLabel("City / district").fill("Chennai");
  await page.getByLabel("State", { exact: true }).fill("Tamil Nadu");
  await page.getByRole("checkbox").check();
}
async function login(page: any) {
  await page.goto("/admin");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
}
test("catalog routes, filters, variants, quantity and cart persistence", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /A place for/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  await page.goto("/shop");
  await expect(page.locator(".product-card")).toHaveCount(6);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(2);
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("Footwear");
  await expect(page.locator(".product-card")).toHaveCount(2);
  await page.getByRole("link", { name: "The Everyday", exact: true }).click();
  await expect(page).toHaveURL(/product\/the-everyday/);
  await expect(page.getByRole("button", { name: "Sand / UK 7" })).toBeVisible();
  await page.goto("/product/the-entryway");
  await page.getByRole("button", { name: "Midnight", exact: true }).click();
  await expect(page.locator(".detail-price")).toContainText("3,599");
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Your cart" });
  await expect(drawer).toContainText("The Entryway");
  await expect(drawer).toContainText("Midnight");
  await expect(drawer).toContainText("₹7,198");
  await drawer.getByRole("button", { name: "Continue Shopping" }).click();
  await expect(drawer).toBeHidden();
  await page.goto("/cart");
  await page.reload();
  await expect(page.getByRole("spinbutton")).toHaveValue("2");
  await expect(page.locator(".cart-line")).toContainText("Midnight");
  await page.getByRole("spinbutton").fill("1");
  await expect(
    page.getByRole("link", { name: /Continue to checkout/ }),
  ).toBeVisible();
});
test("guest COD checkout, secure lookup, safe cancellation", async ({
  page,
}) => {
  await addItem(page);
  await buyer(page);
  await expect(page.locator(".order-summary")).toContainText("₹49");
  await expect(page.locator(".grand-total")).toContainText("₹3,647");
  await page.getByRole("button", { name: "Place test order" }).click();
  await expect(
    page.getByRole("heading", { name: "Thank you, Browser." }),
  ).toBeVisible();
  await expect(page.locator(".order-status")).toContainText(
    "pending verification",
  );
  await expect(page.locator(".order-status")).toContainText("unpaid");
  const url = page.url();
  const id = url.split("/order/")[1].split("#")[0];
  const order = (await db.doc("orders/" + id).get()).data();
  expect(order.total).toBe(364700);
  expect(order.ownerUid).toBe("");
  await page.screenshot({
    path: "test-results/order-desktop.png",
    fullPage: true,
  });
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Cancel order", exact: true }).click();
  await expect(page.locator(".order-status")).toContainText("cancelled");
  await page.goto("/order/" + id + "#" + "0".repeat(64));
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("invalid");
});
test("mobile UPI checkout leaves payment unverified and uploads a private receipt", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await addItem(page, "the-compact");
  await buyer(page);
  await page.getByRole("radio").nth(1).check();
  await expect(
    page.getByText("Rufus Demo — DO NOT PAY", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("UTR / transaction reference").fill("BROWSER-UPI-123");
  await page
    .getByLabel(/Payment receipt \(optional/)
    .setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: png });
  await expect(page.locator(".grand-total")).toContainText("₹2,598");
  await page.screenshot({
    path: "test-results/checkout-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Place test order" }).click();
  await expect(
    page.getByRole("heading", { name: "Thank you, Browser." }),
  ).toBeVisible();
  await expect(page.locator(".order-status")).toContainText(
    "pending verification",
  );
  const id = page.url().split("/order/")[1].split("#")[0];
  const order = (await db.doc("orders/" + id).get()).data();
  expect(order.paymentStatus).toBe("pending_verification");
  expect(order.receiptPath).toMatch(/^receipts\//);
});
test("admin authentication, settings subscriptions, QR replacement/removal, product warranty defaults", async ({
  page,
  browser,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Products", exact: true }).click();
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  await expect(page.getByLabel("Warranty text", { exact: true })).toHaveValue(
    "1-Year Warranty",
  );
  await expect(
    page.getByLabel(/verified and approved this product/),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Store name", { exact: true })
    .fill("Rufus Browser Test");
  const second = await browser.newContext();
  const storefront = await second.newPage();
  await storefront.goto("/");
  await page
    .getByLabel("Announcement banner", { exact: true })
    .fill("Browser-tested banner");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Saved successfully");
  await expect
    .poll(async () => (await db.doc("settings/public").get()).data().banner)
    .toBe("Browser-tested banner");
  await expect(storefront.locator("footer")).toContainText(
    "Rufus Browser Test",
  );
  const inputs = page.locator("input[type=file]");
  await inputs
    .nth(1)
    .setInputFiles({ name: "qr.png", mimeType: "image/png", buffer: png });
  await expect(page.getByAltText("qr preview 1")).toBeVisible();
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect
    .poll(
      async () => (await db.doc("settings/public").get()).data().upi.qrImage,
    )
    .toContain("public%2Fqr");
  const first = (await db.doc("settings/public").get()).data().upi.qrImage;
  await inputs.nth(1).setInputFiles({
    name: "replacement.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect
    .poll(
      async () => (await db.doc("settings/public").get()).data().upi.qrImage,
    )
    .not.toBe(first);
  await page
    .getByAltText("qr preview 1")
    .locator("..")
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect
    .poll(
      async () => (await db.doc("settings/public").get()).data().upi.qrImage,
    )
    .toBe("");
  await second.close();
});
test("admin reviews UPI receipt and cannot approve without bank confirmation", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Orders", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search orders" })
    .fill("BROWSER-UPI-123");
  await page.locator("tbody tr").first().getByRole("button").click();
  await expect(
    page.getByRole("button", { name: "Approve payment", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "View private receipt" }).click();
  await expect(
    page.getByAltText("Customer-submitted unverified receipt"),
  ).toBeVisible();
  await page.getByLabel(/I checked the actual bank/).check();
  await page
    .getByRole("button", { name: "Approve payment", exact: true })
    .click();
  await expect(page.locator(".order-status")).toContainText("paid");
  await page
    .getByRole("button", { name: "Start processing", exact: true })
    .click();
  await expect(page.locator(".order-status")).toContainText("processing");
});
test("non-admin account cannot access dashboard", async ({ page }) => {
  const userEmail = "nonadmin-test@example.com";
  try {
    const u = await adminAuth.getUserByEmail(userEmail);
    await adminAuth.updateUser(u.uid, { password });
  } catch {
    await adminAuth.createUser({ email: userEmail, password });
  }
  await page.goto("/admin");
  await page.getByLabel("Email", { exact: true }).fill(userEmail);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "does not have an administrator claim",
  );
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toHaveCount(0);
});

test("callable backend denies unauthenticated and non-admin mutations", async ({
  request,
}) => {
  const base = "http://127.0.0.1:5001/demo-rufus/us-central1/";
  const missing = await request.post(base + "quoteOrder", {
    data: {
      data: {
        items: [{ productId: "sample-1", variantId: "v1", quantity: 1 }],
        paymentMethod: "cod",
      },
    },
  });
  expect(missing.status()).toBe(401);
  const signup = await request.post(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local-test",
    { data: { returnSecureToken: true } },
  );
  const { idToken } = await signup.json();
  const denied = await request.post(base + "saveSettings", {
    headers: { Authorization: "Bearer " + idToken },
    data: { data: sampleSettings },
  });
  expect(denied.status()).toBe(403);
  expect((await denied.json()).error.status).toBe("PERMISSION_DENIED");
  const forged = await request.post(base + "createOrder", {
    headers: { Authorization: "Bearer " + idToken },
    data: { data: { paymentStatus: "paid", admin: true } },
  });
  expect(forged.status()).toBe(400);
});

test("Hosting renders product HTML and JSON-LD without JavaScript, sitemap refreshes, unknown products are HTTP 404", async ({
  request,
}) => {
  const origin = "http://127.0.0.1:5000";
  const response = await request.get(origin + "/product/the-entryway");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain("<h1>The Entryway");
  expect(html).toContain("application/ld+json");
  expect(html).toContain("AggregateOffer");
  expect(html).toContain("INR 3499.00");
  expect(html).toContain('rel="canonical"');
  expect(
    (await request.get(origin + "/product/not-a-real-product")).status(),
  ).toBe(404);
  expect(await (await request.get(origin + "/admin")).text()).toContain(
    "noindex,nofollow",
  );
  expect(await (await request.get(origin + "/robots.txt")).text()).toContain(
    "Disallow: /checkout",
  );
  await db.doc("products/sample-1").update({ sample: false });
  expect(await (await request.get(origin + "/sitemap.xml")).text()).toContain(
    "/product/the-entryway",
  );
  await db.doc("products/sample-1").update({ published: false });
  expect(
    await (await request.get(origin + "/sitemap.xml")).text(),
  ).not.toContain("/product/the-entryway");
  expect((await request.get(origin + "/product/the-entryway")).status()).toBe(
    404,
  );
  await db.doc("products/sample-1").update({ published: true, sample: true });
});

test("admin creates, uploads, edits and archives a product visible to a signed-out shopper", async ({
  page,
  browser,
}) => {
  await login(page);
  const slug = "crud-" + randomBytes(6).toString("hex");
  const productName = `CRUD verification product ${slug}`;
  await page.getByRole("button", { name: "Products", exact: true }).click();
  await page.getByRole("button", { name: "Add product", exact: true }).click();
  for (const [label, value] of Object.entries({
    "Product name": productName,
    "Unique URL slug": slug,
    SKU: slug,
    Category: "Storage",
    Description: "A product created by the browser regression test.",
    "Variant SKU": slug + "-v1",
    "Selling price (paise)": "10000",
    "Original price (paise)": "12000",
    "Available stock": "5",
  }))
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel("Published", { exact: true }).check();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({ name: "product.png", mimeType: "image/png", buffer: png });
  await expect(page.getByAltText("products preview 1")).toBeVisible();
  await page
    .getByRole("button", { name: "Save product", exact: true })
    .first()
    .click();
  await expect(page.getByRole("status")).toContainText("Saved successfully");
  const shopper = await browser.newContext();
  const storefront = await shopper.newPage();
  try {
    await storefront.goto(`/product/${slug}`);
    await expect(
      storefront.getByRole("heading", {
        name: productName,
        exact: true,
      }),
    ).toBeVisible();
    await expect
      .poll(async () =>
        storefront
          .locator('img[src*="firebasestorage"], img[src*="9199"]')
          .first()
          .evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
      )
      .toBe(true);
    await page
      .getByRole("row")
      .filter({ hasText: productName })
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    const editedProductName = `Edited ${productName}`;
    await page
      .getByLabel("Product name", { exact: true })
      .fill(editedProductName);
    await page
      .getByRole("button", { name: "Save product", exact: true })
      .first()
      .click();
    await expect(
      storefront.getByRole("heading", {
        name: editedProductName,
        exact: true,
      }),
    ).toBeVisible();
    await storefront.reload();
    await expect(
      storefront.getByRole("heading", {
        name: editedProductName,
        exact: true,
      }),
    ).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("row")
      .filter({ hasText: editedProductName })
      .getByRole("button", { name: "Archive", exact: true })
      .click();
    await expect
      .poll(async () => {
        const saved = await db
          .collection("products")
          .where("slug", "==", slug)
          .get();
        return saved.docs[0]?.data().published;
      })
      .toBe(false);
    await expect(
      storefront.getByRole("heading", {
        name: editedProductName,
        exact: true,
      }),
    ).toHaveCount(0);
  } finally {
    await shopper.close();
  }
});
