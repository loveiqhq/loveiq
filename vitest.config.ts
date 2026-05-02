import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["__tests__/setup.ts"],
    exclude: ["node_modules", "e2e", ".next"],
    // Heavy report sections render multi-hundred-KB data files; under full-suite
    // parallel load these can exceed the 5s default. 60s gives flake headroom.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "app/api/**/*.ts", "proxy.ts"],
      // What we deliberately exclude from coverage gating:
      //  - admin/**       internal operator tooling (100+ analytical endpoints)
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
