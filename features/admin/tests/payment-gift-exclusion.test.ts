import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * E07's day-1 gift is never a sale (Pre-unlock; app/api/cron/initial-unlock-gift).
 *
 * The gift is a EUR 0 `initial` payment marked `metadata.gifted` = "e07", written
 * automatically for 80% of the readers the EUR 1.99 gate stopped who had not paid by day
 * 4. Most admin readers counted any succeeded row as a paid report, so with the gift on,
 * "paid reports", survey-to-paid conversion and the weekly "Purchases" would have grown by
 * every gifted reader. Audited 2026-10-20 (Pre-unlock, Task 15).
 *
 * Only the gift is taken out. A EUR 0 coupon redemption by a real visitor keeps whatever
 * each reader already does with it: counted on the digest RPCs (decided 2026-09-15, see
 * payment-test-exclusion.test.ts), "unlocked free, not counted" on the KPI page and the
 * conversion digest (decided 2026-09-19). That split is a product call of its own.
 */
const REPO = process.cwd();

/** Readers that must keep seeing the gift, each for its own reason. */
const SEES_THE_GIFT: Array<[string, string]> = [
  ["features/admin/server/data-subject.ts", "a DSAR must return ALL of a person's data"],
  ["features/admin/server/health.ts", "liveness probe, not a business metric"],
];

/**
 * Every admin file that queries the payment table, found live rather than hardcoded (a
 * walk in Node rather than a shell grep, which cmd.exe mangles on Windows).
 */
function adminPaymentQueryFiles(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  return ["app/api/admin", "features/admin/server"]
    .flatMap((dir) => walk(join(REPO, dir)))
    .filter((file) => file.endsWith(".ts"))
    .filter((file) => readFileSync(file, "utf8").includes("rest/v1/payment?"))
    .map((file) => relative(REPO, file).split(sep).join("/"))
    .sort();
}

const excludesTheGift = (query: string) =>
  query.includes("metadata->>gifted=is.null") || query.includes("amount=gt.0");

describe("the day-1 gift is never counted as a sale", () => {
  it("finds the admin payment query sites at all", () => {
    expect(adminPaymentQueryFiles().length).toBeGreaterThan(10);
  });

  it("leaves the gift out of every admin payment query", () => {
    const exempt = SEES_THE_GIFT.map(([file]) => file);
    const offenders: string[] = [];
    for (const file of adminPaymentQueryFiles()) {
      if (exempt.includes(file)) continue;
      const src = readFileSync(join(REPO, file), "utf8");
      for (const q of src.match(/rest\/v1\/payment\?[^`"']*/g) ?? []) {
        if (!excludesTheGift(q)) offenders.push(`${file} :: ${q.slice(0, 80)}`);
      }
    }
    expect(
      offenders,
      `these payment queries would count E07's gift as a sale:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it.each(SEES_THE_GIFT)("lets %s see the gift: %s", (file) => {
    const src = readFileSync(join(REPO, file), "utf8");
    for (const q of src.match(/rest\/v1\/payment\?[^`"']*/g) ?? []) {
      expect(q).not.toContain("metadata->>gifted=is.null");
    }
  });

  it("leaves both free unlocks out of the two RPCs that counted every payment", () => {
    // get_dropoff_everywhere feeds the conversion digest's funnel; get_conversion_pipeline the
    // admin strategy. A coupon's EUR 0 redemption still counts (20260915110402).
    const sql = readFileSync(
      join(REPO, "supabase/migrations/20261023010000_free_unlocks_are_not_purchases.sql"),
      "utf8"
    );
    for (const fn of ["get_conversion_pipeline", "get_dropoff_everywhere"]) {
      expect(sql).toContain(`'${fn}'`);
    }
    expect(sql).toContain("metadata->>''gifted'' IS NULL");
    expect(sql).toContain("<> ''unlock_feedback''");
    expect(sql).toMatch(/expected exactly 1/);
    expect(sql).toContain("CONTINUE WHEN");
    const down = readFileSync(
      join(REPO, "supabase/rollbacks/20261023010000_free_unlocks_are_not_purchases_down.sql"),
      "utf8"
    );
    expect(down).toContain("'get_conversion_pipeline'");
    expect(down).toContain("'get_dropoff_everywhere'");
  });

  it("keeps the weekly invite reminders' 200 rows for the plans they remind", () => {
    // Gifts and EUR 1.99 rows are skipped after the read; read first, they would take the
    // slots of the full-report buyers the reminders are for.
    const src = readFileSync(join(REPO, "app/api/cron/invite-reminders/route.ts"), "utf8");
    expect(src).toContain("metadata->>plan=in.(full_report,all_reports)");
  });
});
