import { test, expect } from "@playwright/test";

test("localhost debug exchanges with Firebase without a site key and fails closed on rejection", async ({
  page,
}) => {
  let exchanges = 0;
  let dataRequests = 0;
  let recaptchaRequests = 0;
  // All external traffic is intercepted: this test never reaches live Firebase.
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") return route.continue();
    if (url.pathname.endsWith(":exchangeDebugToken")) {
      exchanges++;
      expect(route.request().postDataJSON().debug_token).toMatch(
        /^[a-f0-9-]{36}$/i,
      );
      return route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: 403, message: "Unregistered test debug token" },
        }),
      });
    }
    if (/firestore|firebasestorage|cloudfunctions/.test(url.hostname))
      dataRequests++;
    if (/recaptcha/.test(url.href)) recaptchaRequests++;
    return route.abort();
  });
  await page.goto("/");
  await expect(
    page.getByText(/App Check debug verification failed/).first(),
  ).toBeVisible({ timeout: 20000 });
  expect(exchanges).toBeGreaterThan(0);
  expect(dataRequests).toBe(0);
  expect(recaptchaRequests).toBe(0);
  expect(
    await page.evaluate(
      () =>
        (self as typeof self & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean })
          .FIREBASE_APPCHECK_DEBUG_TOKEN,
    ),
  ).toBe(true);
});

test("debug opt-in is ignored on a non-loopback hostname", async ({ page }) => {
  let exchanges = 0;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "rufus.invalid") {
      url.hostname = "127.0.0.1";
      const response = await route.fetch({ url: url.href });
      return route.fulfill({ response });
    }
    if (url.pathname.endsWith(":exchangeDebugToken")) exchanges++;
    return route.abort();
  });
  await page.goto("http://rufus.invalid:5175/");
  await expect(
    page.getByText(/Configure VITE_APPCHECK_SITE_KEY/).first(),
  ).toBeVisible();
  expect(exchanges).toBe(0);
  expect(
    await page.evaluate(
      () =>
        (self as typeof self & { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean })
          .FIREBASE_APPCHECK_DEBUG_TOKEN,
    ),
  ).toBeUndefined();
});
