import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Test purchases must never be counted as revenue — and the split of which query
 * sites filter them is deliberate, not incidental.
 *
 * Found 2026-08-28: reported revenue was EUR 1,099.29 while the real Stripe balance
 * was 500-600. Reconciling against live Stripe showed the figure was two Stripe
 * accounts added together — 39 real payments totalling EUR 634.91 on the current
 * account (matching Stripe to the cent, 36 distinct customers), plus 12 payments
 * totalling EUR 464.38 on a retired account from only THREE email addresses, one of
 * them a developer's personal address with 9 purchases in 19 days. Staff testing,
 * not customers. Coupons were the obvious suspect and were NOT the cause: coupon
 * use is real and already inside the 634.91.
 */
const REPO = process.cwd();

/**
 * Query sites that must KEEP seeing test payments, each for a different reason.
 * Adding the revenue filter to any of these would be a bug, not tidiness.
 */
const MUST_NOT_FILTER: Array<[string, string]> = [
  ["features/report/server/planAccess.ts", "resolves which access plan a report has"],
  ["features/report/server/personalReport.ts", "resolves report access + purchase metadata"],
  ["features/checkout/server/fulfillment.ts", "fulfilment and its idempotency checks"],
  ["features/admin/server/data-subject.ts", "a DSAR must return ALL of a person's data"],
  ["features/admin/server/health.ts", "liveness probe, not a business metric"],
];

/** Every file that queries the payment table, found live rather than hardcoded. */
function paymentQueryFiles(): string[] {
  const out = execSync(
    "grep -rl 'rest/v1/payment?' --include='*.ts' app/ features/ shared/ || true",
    { cwd: REPO, encoding: "utf8" }
  );
  return out.split("\n").filter(Boolean).sort();
}

describe("test payments are excluded from revenue", () => {
  it("finds the payment query sites at all", () => {
    expect(paymentQueryFiles().length).toBeGreaterThan(5);
  });

  it("filters is_test on every business-metric query", () => {
    /**
     * The guard with teeth: a NEW admin route that sums payment.amount without the
     * filter would silently reintroduce EUR 464.38 of staff testing into revenue.
     * The list is discovered by grep, so a new file is caught without editing this
     * test.
     */
    const exempt = MUST_NOT_FILTER.map(([f]) => f);
    const offenders: string[] = [];

    for (const file of paymentQueryFiles()) {
      if (exempt.includes(file)) continue;
      // Checkout tests exercise fulfilment, which legitimately sees test rows.
      if (file.startsWith("features/checkout/")) continue;
      // Test files quote the URL shape as data — including this file, whose own grep
      // pattern is a literal `rest/v1/payment?` and matched itself on first run.
      if (file.includes("/tests/") || file.endsWith(".test.ts")) continue;

      const src = readFileSync(join(REPO, file), "utf8");
      for (const q of src.match(/rest\/v1\/payment\?[^`"']*/g) ?? []) {
        if (!q.includes("is_test=is.false")) offenders.push(`${file} :: ${q.slice(0, 70)}`);
      }
    }

    expect(
      offenders,
      `these payment queries would count staff test purchases as revenue:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it.each(MUST_NOT_FILTER)("leaves %s unfiltered — %s", (file, _why) => {
    const src = readFileSync(join(REPO, file), "utf8");
    for (const q of src.match(/rest\/v1\/payment\?[^`"']*/g) ?? []) {
      expect(q, `${file} must NOT filter test payments: ${_why}`).not.toContain("is_test=is.false");
    }
  });

  it("keeps the exclusion off `status`, which report access depends on", () => {
    /**
     * The tempting one-line fix was to rewrite these rows' status so every existing
     * revenue query dropped them for free. It would also have revoked the reports,
     * because status = 'succeeded' is what planAccess reads.
     */
    const access = readFileSync(join(REPO, "features/report/server/planAccess.ts"), "utf8");
    expect(access).toContain("status=eq.succeeded");
  });

  it("ships the migration that defines and backfills the flag", () => {
    const sql = readFileSync(
      join(REPO, "supabase/migrations/20260828173515_payment_is_test_flag.sql"),
      "utf8"
    );
    expect(sql).toContain("add column if not exists is_test");
    expect(sql).toContain("EOOls8qn9F");
    // The reason must travel with the migration; the account suffix alone is a riddle.
    expect(sql.toLowerCase()).toContain("staff testing");
  });
});
