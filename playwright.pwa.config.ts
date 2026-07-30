import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-pwa",
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:1421",
    serviceWorkers: "allow",
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 1421",
    url: "http://127.0.0.1:1421",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
