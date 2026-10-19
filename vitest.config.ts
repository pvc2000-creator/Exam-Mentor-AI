import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests: pure functions, no database.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { environment: "node", include: ["tests/unit/**/*.test.ts"] },
});
