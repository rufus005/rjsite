import { test, expect, type Page } from "@playwright/test";

const debugToken = "11111111-2222-4333-8444-555555555555";

async function intercept(
  page: Page,
  options: {
    siteKey?: string;
    enabled?: string;
    debugToken?: string;
    production?: boolean;
    initializationFailure?: boolean;
  } = {},
) {
  const requests = { exchanges: 0, signIns: 0, attestation: 0 };
  // Keep all Firebase traffic isolated from the live project.
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.port === "5175") {
      url.hostname = "127.0.0.1";
      const response = await route.fetch({ url: url.href });
      if (url.pathname === "/src/services/firebase/index.ts") {
        let body = await response.text();
        body = body
          .replace(
            /import\.meta\.env\.VITE_ENABLE_APPCHECK/g,
            JSON.stringify(options.enabled ?? "true"),
          )
          .replace(
            /import\.meta\.env\.VITE_APPCHECK_SITE_KEY/g,
            JSON.stringify(options.siteKey ?? ""),
          )
          .replace(
            /import\.meta\.env\.VITE_APPCHECK_DEBUG_TOKEN/g,
            JSON.stringify(options.debugToken ?? debugToken),
          );
        if (options.production)
          body = body.replace(/import\.meta\.env\.DEV/g, "false");
        if (options.initializationFailure) {
          body = body.replace(
            "appCheck = initializeAppCheck(app,",
            'appCheck = (() => { throw Error("Test initialization failure"); })(app,',
          );
        }
        return route.fulfill({ response, body });
      }
      return route.fulfill({ response });
    }
    if (/firebaseappcheck|recaptcha/.test(url.href)) requests.attestation++;
    if (url.pathname.endsWith(":exchangeDebugToken")) {
      requests.exchanges++;
      expect(route.request().postDataJSON().debug_token).toBe(debugToken);
      return route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: 403, message: "Unregistered test debug token" },
        }),
      });
    }
    if (url.pathname.endsWith(":signInWithPassword")) {
      requests.signIns++;
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: 400, message: "INVALID_LOGIN_CREDENTIALS" },
        }),
      });
    }
    return route.abort();
  });
  return requests;
}

async function expectSignInAvailable(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText(
      /Your sign-in has not been changed|Configure VITE_APPCHECK_SITE_KEY/,
    ),
  ).toHaveCount(0);
}

for (const hostname of [
  "localhost",
  "127.0.0.1",
  "rufus.vercel.app",
  "store.example.com",
]) {
  test(`missing key keeps admin accessible on ${hostname}`, async ({
    page,
  }) => {
    const requests = await intercept(page);
    await page.goto(`http://${hostname}:5175/admin`);
    await expectSignInAvailable(page);
    const token = await page.evaluate(
      () =>
        (self as typeof self & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string })
          .FIREBASE_APPCHECK_DEBUG_TOKEN,
    );
    expect(token).toBe(hostname === "localhost" ? debugToken : undefined);
    expect(requests.exchanges).toBe(0);
    await page.getByLabel("Email", { exact: true }).fill("admin@example.com");
    await page.getByLabel("Password", { exact: true }).fill("test-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect.poll(() => requests.signIns).toBe(1);
  });
}

for (const options of [{ production: true }, { debugToken: "" }]) {
  test(`localhost requires an explicit token and development build: ${JSON.stringify(options)}`, async ({
    page,
  }) => {
    await intercept(page, options);
    await page.goto("http://localhost:5175/admin");
    await expectSignInAvailable(page);
    expect(
      await page.evaluate(
        () =>
          (self as typeof self & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string })
            .FIREBASE_APPCHECK_DEBUG_TOKEN,
      ),
    ).toBeUndefined();
  });
}

test("initialization failure keeps admin sign-in available", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const requests = await intercept(page, {
    siteKey: "test-enterprise-site-key",
    initializationFailure: true,
  });
  await page.goto("http://localhost:5175/admin");
  await expectSignInAvailable(page);
  await page.getByLabel("Email", { exact: true }).fill("admin@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect.poll(() => requests.signIns).toBe(1);
  expect(errors).toEqual([]);
});

test("rejected debug exchange does not block admin rendering", async ({
  page,
}) => {
  const requests = await intercept(page, {
    siteKey: "test-enterprise-site-key",
  });
  await page.goto("http://localhost:5175/admin");
  await expectSignInAvailable(page);
  await expect.poll(() => requests.exchanges).toBeGreaterThan(0);
  await expectSignInAvailable(page);
});

for (const enabled of ["", "false"]) {
  test(`App Check opt-out sends no attestation requests (${enabled || "unset"})`, async ({
    page,
  }) => {
    const requests = await intercept(page, {
      enabled,
      siteKey: "mismatched-enterprise-site-key",
    });
    await page.goto("http://rufus.vercel.app:5175/admin");
    await expectSignInAvailable(page);
    await page.getByLabel("Email", { exact: true }).fill("admin@example.com");
    await page.getByLabel("Password", { exact: true }).fill("test-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect.poll(() => requests.signIns).toBe(1);
    expect(requests.attestation).toBe(0);
  });
}
