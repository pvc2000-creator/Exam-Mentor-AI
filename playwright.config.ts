import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run the production build against a dedicated database (E2E_DATABASE_URL, default
// exammentor_e2e), which tests/e2e/global-setup.ts empties and seeds. Run `npm run build` first.
export const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://postgres@localhost:5432/exammentor_e2e?schema=public";
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", viewport: { width: 1360, height: 900 } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 } } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: E2E_DB, AI_PROVIDER: "none", SECURE_COOKIES: "false", NODE_ENV: "production" },
  },
});
