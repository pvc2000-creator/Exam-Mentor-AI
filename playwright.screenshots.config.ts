import base from "./playwright.config";
import { defineConfig } from "@playwright/test";

// Same journey, with SCREENSHOTS=1 so the specs save real screenshots into docs/screenshots.
process.env.SCREENSHOTS = "1";
export default defineConfig({ ...base });
