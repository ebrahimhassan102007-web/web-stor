import { defineConfig, devices } from "@playwright/test";

/**
 * Browser proof for P0-1/P0-2. Run with `npm run test:e2e` (needs a local
 * DATABASE_URL + migrated schema, same as `npm test`). Never point
 * PW_BASE_URL at anything but a local instance you started yourself.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: process.env.PW_BASE_URL ?? "http://localhost:3100" },
  webServer: process.env.PW_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run start -- --port 3100",
        url: "http://localhost:3100",
        reuseExistingServer: false,
        timeout: 300_000,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
