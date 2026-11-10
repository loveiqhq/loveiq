import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * /api/survey may start a utm_tracker holding only the first page (landing_path) for a visitor
 * with no campaign tags (#704). The funnel digest's per-channel sparklines count a finish and a
 * purchase only when a tracker exists, a start by its draft's tracker, which never has one, so
 * those finishes would join 'direct' without their starts. The latest definition of
 * get_channel_sparklines must read a landing_path-only tracker as none, in all three counts.
 */
const DIR = join(process.cwd(), "supabase/migrations");

function latestDefinition(): { file: string; sql: string } {
  const file = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) =>
      /FUNCTION\s+(public\.)?get_channel_sparklines\s*\(/.test(readFileSync(join(DIR, f), "utf8"))
    )
    .sort()
    .at(-1)!;
  return { file, sql: readFileSync(join(DIR, file), "utf8") };
}

/** One CTE's text: from `<name> AS (` to the next top-level CTE. */
function cte(sql: string, name: string, next: string): string {
  const start = sql.indexOf(`${name} AS (`);
  const end = sql.indexOf(`${next} AS (`, start);
  expect(start, `${name} CTE`).toBeGreaterThan(-1);
  expect(end, `${next} CTE after ${name}`).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe("get_channel_sparklines and a tracker holding only the first page", () => {
  it.each([
    ["subs", "starts", "ss"],
    ["starts", "completions", "sps"],
    ["purch", "per_source_day", "ss"],
  ])("reads it as no tracker in %s", (name, next, alias) => {
    const { sql } = latestDefinition();
    expect(cte(sql, name, next)).toContain(
      `AND (${alias}.utm_tracker::jsonb - 'landing_path') <> '{}'::jsonb`
    );
  });

  it("is the definition this rule shipped in, or a later one", () => {
    expect(latestDefinition().file >= "20261105120000").toBe(true);
  });
});
