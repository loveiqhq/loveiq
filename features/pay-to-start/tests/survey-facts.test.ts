import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SURVEY_TOTAL_QUESTIONS } from "@features/survey/server/utils";

/**
 * The pay-to-start pages describe the survey as it is (sync 26.10: Marcus handed the copy
 * calls to Fatih). They kept Figma's "57 questions" and said "~9 min" beside "~15 minutes".
 * The survey asks SURVEY_TOTAL_QUESTIONS ("Question X of 62") and estimates its own length
 * at 15 minutes (SurveyProgress's TOTAL_MINUTES, "For ~15 min" on its intro); October's
 * median finish was 15.5 minutes. A page that promised less would be the first thing a
 * paying visitor found untrue.
 */
const SURVEY_MINUTES = 15;
const ROOTS = ["features/pay-to-start/ui", "app/sexual-archetype"];
const QUESTIONS = /(\d+)\s+questions/gi;
const MINUTES = /(\d+)\s*(?:min\b|minutes?\b)/gi;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

function numbers(source: string, pattern: RegExp): number[] {
  return [...source.matchAll(pattern)].map((match) => Number(match[1]));
}

describe("pay-to-start says what the survey is", () => {
  const files = ROOTS.flatMap((root) => sourceFiles(path.join(process.cwd(), root)));
  const all = files.map((file) => readFileSync(file, "utf8")).join("\n");

  it("finds the counts it guards", () => {
    expect(numbers(all, QUESTIONS).length).toBeGreaterThan(5);
    expect(numbers(all, MINUTES).length).toBeGreaterThan(5);
  });

  it("counts the survey's questions as the survey does", () => {
    expect(new Set(numbers(all, QUESTIONS))).toEqual(new Set([SURVEY_TOTAL_QUESTIONS]));
  });

  it("times the survey as the survey does", () => {
    expect(new Set(numbers(all, MINUTES))).toEqual(new Set([SURVEY_MINUTES]));
  });
});
