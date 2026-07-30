import { defineConfig, devices } from "@playwright/test";

const requestedBase = process.env.VITE_BASE_PATH ?? "/";
const base = requestedBase === "/" ? "/" : `/${requestedBase.replace(/^\/+|\/+$/g, "")}/`;
const origin = "http://127.0.0.1:1421";

export default defineConfig({
  testDir: "./e2e-pwa",
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `${origin}${base}`,
    serviceWorkers: "allow",
  },
  webServer: {
    command: `VITE_BASE_PATH=${base} npm run preview -- --host 127.0.0.1 --port 1421`,
    url: `${origin}${base}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
