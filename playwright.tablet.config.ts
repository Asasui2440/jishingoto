import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  grep: /MainのStreet View体験/,
  outputDir: "test-results/tablet-game",
  projects: [
    { name: "tablet-portrait", use: { viewport: { width: 768, height: 1024 } } },
    { name: "tablet-landscape", use: { viewport: { width: 1024, height: 768 } } },
  ],
});
