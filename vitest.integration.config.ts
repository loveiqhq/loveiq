import { defineConfig } from "vitest/config";
import path from "path";

// Integration test config — runs tests in __tests__/integration/ that hit real
// external services (Supabase test branch, etc.). Excluded from default `npm test`
// via vitest.config.ts. Run via `npm run test:integration`.
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
    },
  },
});
