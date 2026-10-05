import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE ANALYSIS FUNCTION MUST MEASURE THE STAGES THE CRON ACTUALLY SENDS.
 *
 * `get_nurture_performance` hardcodes its stage list in SQL; the cron declares its
 * stages as a TypeScript type. Nothing tied the two together, so when pricing 2.0 cut
 * the sequence to `72h_no_unlock` on 2026-08-03 the function kept measuring the five
 * retired stages for seven weeks — reporting 3,763 phantom sends in the last 30 days
 * and no row at all for the 403 real ones.
 *
 * Reads the LATEST migration that defines the function, because that is the body the
 * repo would deploy; the live body is checked against migrations by the drift job.
 */
const MIGRATIONS = "supabase/migrations";
const CRON = "app/api/cron/nurture-sequence/route.ts";

function latestDefinition(): { file: string; sql: string } {
  const files = fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files.reverse()) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, file), "utf8");
    if (
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?get_nurture_performance"?\s*\(/i.test(
        sql
      )
    ) {
      return { file, sql };
    }
  }
  throw new Error("no migration defines get_nurture_performance");
}

function arrayLiteral(sql: string, name: string): string[] {
  const m = new RegExp(`\\b${name}\\s+TEXT\\[\\]\\s*:=\\s*ARRAY\\[([^\\]]*)\\]`, "i").exec(sql);
  if (!m) throw new Error(`no ${name} TEXT[] := ARRAY[...] in the function`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

function cronStages(): string[] {
  const src = fs.readFileSync(CRON, "utf8");
  const m = /\btype Stage\s*=\s*([^;]+);/.exec(src);
  if (!m) throw new Error("no `type Stage = ...;` in the nurture cron");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

describe("get_nurture_performance ↔ nurture-sequence cron", () => {
  const { file, sql } = latestDefinition();
  const live = cronStages();

  it("reads a real stage list from both sides", () => {
    // Guards the parsers: an empty list on either side would make the checks below
    // vacuously true.
    expect(live.length).toBeGreaterThan(0);
    expect(arrayLiteral(sql, "stages").length).toBeGreaterThan(0);
  });

  it(`measures every stage the cron sends (${file})`, () => {
    const measured = arrayLiteral(sql, "stages");
    for (const stage of live)
      expect(measured, `stage "${stage}" is sent but not measured`).toContain(stage);
  });

  it("marks exactly the cron's stages as live, and lists them first", () => {
    const measured = arrayLiteral(sql, "stages");
    expect([...arrayLiteral(sql, "live_stages")].sort()).toEqual([...live].sort());
    expect(measured.slice(0, live.length).sort()).toEqual([...live].sort());
  });

  it("dates a send by the promo code, not by when the row last changed", () => {
    // `updated_date_time` was bumped on every unpurchased quote by a 2026-08-31
    // migration, which is how retired stages came to show 1,000+ recent sends.
    expect(sql).not.toMatch(/rpq\.updated_date_time/);
    expect(sql).toMatch(/'expiresAt'/);
  });
});
