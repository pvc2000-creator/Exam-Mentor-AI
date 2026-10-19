import path from "node:path";
import { defineConfig } from "vitest/config";

// Integration tests run against a separate database (TEST_DATABASE_URL, default exammentor_test),
// migrated and seeded once in globalSetup. Files run one at a time because they share that database.
const testDb = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/exammentor_test?schema=public";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    env: { DATABASE_URL: testDb, AI_PROVIDER: "none", ALLOW_PROVISIONAL_QUESTIONS: "true" },
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 300_000,
  },
});
