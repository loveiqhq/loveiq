import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["__tests__/setup.ts"],
    // Integration tests live in __tests__/integration/ and need real external
    // services (Supabase test branch, etc.). They are excluded from default
    // `npm test` and run via `npm run test:integration` only.
    exclude: ["node_modules", "e2e", ".next", "__tests__/integration/**"],
    // 15s is enough for the heaviest report-section render under parallel load
    // (measured: 99th-percentile ~6s on CI). 60s previously masked perf regressions.
    // Per-test override via `it("…", { timeout: 30_000 }, …)` if you genuinely need it.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "app/api/**/*.ts", "proxy.ts"],
      // What we deliberately exclude from coverage gating:
      //  - admin/**       internal operator tooling (100+ analytical endpoints).
      //                   Every mutating admin route now has shallow auth-gate
      //                   tests (CSRF/RBAC/rate-limit/Zod) — those still run +
      //                   prevent regressions; they're just not gated by the %
      //                   thresholds. Including admin in scope would push the
      //                   denominator way past current test depth and silently
      //                   undermine the customer-facing gate.
      //  - cron/**        scheduled glue that hits external services (Resend, Stripe)
      //  - scoring/index, scoring/types  re-exports + type-only files
      //  - emails/admin-magic-link, emails/invite, emails/report-all,
      //    emails/report-essentials, emails/report-full, emails/survey-complete,
      //    emails/survey-paused — A-side templates of the A/B email pairs
      //    where the B variant carries identical structural test coverage
      // The thresholds gate the customer-facing flow: waitlist, contact, survey,
      // scoring, checkout, report rendering, share verification, ratelimit,
      // CSRF, html-escape, and the request-side proxy.
      exclude: [
        "node_modules",
        ".next",
        "__tests__",
        "data/glossary-data.ts",
        "app/api/admin/**",
        "app/api/cron/**",
        "lib/admin/**",
        "lib/scoring/index.ts",
        "lib/scoring/types.ts",
        "lib/emails/admin-magic-link.ts",
        "lib/emails/invite.ts",
        "lib/emails/report-all.ts",
        "lib/emails/report-essentials.ts",
        "lib/emails/report-full.ts",
        "lib/emails/survey-complete.ts",
        "lib/emails/survey-paused.ts",
      ],
      thresholds: {
        // Reflective thresholds: matches current coverage of the customer-facing
        // surface with ~5-point downside slack so unrelated refactors don't
        // tank CI. Raise these as new tests land; do not lower without review.
        lines: 60,
        statements: 60,
        functions: 65,
        branches: 50,
      },
      reporter: ["text", "lcov"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
