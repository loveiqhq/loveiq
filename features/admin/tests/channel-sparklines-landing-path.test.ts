import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { LANDING_PATH_TRACKER_KEY } from "@features/attribution/server/traffic";
import { JOURNEY_TRACKER_KEY } from "@features/pay-to-start/logic/journey";
import { EMAIL_QUESTION_ARM_KEY } from "@shared/experiments/emailQuestionArm";
import { GATE_REVEAL_ARM_KEY } from "@shared/experiments/gateRevealArm";
import { QUESTION_ORDER_ARM_KEY } from "@shared/experiments/questionOrderArm";

/**
 * Every key /api/survey stamps on its own (app/api/survey/route.ts): the first page, the
 * journey label and the experiment arms. Since #772 the first page starts the tracker before the
 * arms join it, so a tracker holding only these is still no attribution.
 */
const SERVER_STAMPS = [
  LANDING_PATH_TRACKER_KEY,
  JOURNEY_TRACKER_KEY,
  QUESTION_ORDER_ARM_KEY,
  EMAIL_QUESTION_ARM_KEY,
  GATE_REVEAL_ARM_KEY,
];

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
      `AND (${alias}.utm_tracker::jsonb - ARRAY[${SERVER_STAMPS.map((k) => `'${k}'`).join(", ")}]) <> '{}'::jsonb`
    );
  });

  it("is the definition this rule shipped in, or a later one", () => {
    expect(latestDefinition().file >= "20261105120000").toBe(true);
  });
});
