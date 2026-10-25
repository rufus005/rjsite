import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./appcheck-tests",
  workers: 1,
  timeout: 60000,
  expect: { timeout: 20000 },
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    baseURL: "http://127.0.0.1:5175",
    launchOptions: {
      executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
  webServer: {
    command: "npm run dev -- --port 5175 --strictPort",
    // Wait for the dynamically imported app to compile, not just the HTML shell.
    url: "http://127.0.0.1:5175/src/main.tsx",
    env: {
      VITE_APPCHECK_DEBUG_TOKEN: "11111111-2222-4333-8444-555555555555",
      VITE_USE_EMULATORS: "false",
      VITE_APPCHECK_SITE_KEY: "",
    },
    timeout: 120000,
  },
});
