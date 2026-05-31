import { defineConfig } from "vitest/config";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Integration test config — runs tests in __tests__/integration/ that hit real
// external services (Supabase test branch, etc.). Excluded from default `npm test`
// via vitest.config.ts.
//
// Loads .env.local on startup so contributors don't need to pass env vars on
// the CLI. Mirrors what Next.js does for `npm run dev`. Inline parser to avoid
// adding the dotenv dep just for one config file.

function loadEnvLocal(): void {
  const envPath = path.resolve(__dirname, ".env.local");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes (matching dotenv behaviour).
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/integration/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", "e2e", ".next"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@features": path.resolve(__dirname, "features"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
});
