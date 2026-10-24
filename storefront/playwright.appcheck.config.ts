import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./appcheck-tests",
  workers: 1,
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
    url: "http://127.0.0.1:5175",
    env: {
      VITE_APPCHECK_DEBUG: "true",
      VITE_USE_EMULATORS: "false",
      VITE_APPCHECK_SITE_KEY: "",
    },
    timeout: 120000,
  },
});
