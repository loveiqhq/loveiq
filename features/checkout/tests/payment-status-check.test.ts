/**
 * Every status the Stripe webhook writes to payment.status must pass the table's CHECK.
 *
 * Until 25 Oct 2026 the CHECK had no 'disputed', so an opened chargeback's PATCH was refused
 * (400) and syncDisputeEvent threw before it re-locked the report or alerted ops.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = join(process.cwd(), "supabase/migrations");

/** The statuses in the newest migration that (re)defines payment_status_check. */
function allowedStatuses(): string[] {
  const latest = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .reverse()
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
    .find((sql) => /ADD CONSTRAINT payment_status_check CHECK/.test(sql));
  const check = /ADD CONSTRAINT payment_status_check CHECK \(([\s\S]*?)\);/.exec(latest ?? "");
  return [...(check?.[1] ?? "").matchAll(/'(\w+)'/g)].map((m) => m[1]!);
}

/** The statuses fulfillment writes, read from its own PaymentStatus type. */
function writtenStatuses(): string[] {
  const source = readFileSync(
    join(process.cwd(), "features/checkout/server/fulfillment.ts"),
    "utf8"
  );
  const union = /type PaymentStatus = ([^;]+);/.exec(source)?.[1] ?? "";
  return [...union.matchAll(/"(\w+)"/g)].map((m) => m[1]!);
}

describe("payment_status_check", () => {
  it("allows every status fulfillment writes, 'disputed' included", () => {
    const written = writtenStatuses();
    expect(written).toContain("disputed");
    expect(written.filter((s) => !allowedStatuses().includes(s))).toEqual([]);
  });
});
