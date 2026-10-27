import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WIZARD_CHAPTER_COUNT } from "@features/survey/ui/wizard/wizardContent";

/**
 * Eman, 27.10: the site says what the survey and the report are. The landing page and the
 * survey-link email said "9 minutes" beside pay to start's 15 (the survey's own estimate;
 * October's median finish was 15.5), and the report was sold as "50+ pages" where the
 * slimmed report counts 17 chapters ("6 Parts, 17 Chapters" on the pre-report map, its nav).
 * Comments may tell that history; the copy may not.
 */
const SURVEY_MINUTES = 15;
const ROOTS = [
  "features/landing/ui",
  "features/pay-to-start/ui",
  "features/survey/server/emails/test-link.ts",
  "features/report/ui/ReportPricingModal.tsx",
  "app/sexual-archetype",
];

function sourceFiles(target: string): string[] {
  if (!statSync(target).isDirectory()) return [target];
  return readdirSync(target).flatMap((name) => {
    const full = path.join(target, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

/** The code without its comments: block comments, then `//` to the end of a line. */
const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const copy = ROOTS.flatMap((root) => sourceFiles(path.join(process.cwd(), root)))
  .map((file) => withoutComments(readFileSync(file, "utf8")))
  .join("\n");

const all = (pattern: RegExp) => [...copy.matchAll(pattern)].map((match) => Number(match[1]));

describe("the site says what the survey and the report are", () => {
  it("times the survey as the survey does", () => {
    const minutes = [...all(/(\d+)\s*minutes?\b/gi), ...all(/[~≈]\s*(\d+)\s*min\b/gi)];
    expect(minutes.length).toBeGreaterThan(8);
    expect(new Set(minutes)).toEqual(new Set([SURVEY_MINUTES]));
  });

  it("sizes the report in chapters, as many as the report has", () => {
    expect(copy).not.toMatch(/\d+\+?\s*-?\s*pages?\b/i);
    expect(copy).not.toMatch(/\+\s*\d+\s*page/i);
    const chapters = all(/(\d+)[\s-]chapters?\b/gi);
    expect(chapters.length).toBeGreaterThan(6);
    expect(new Set(chapters)).toEqual(new Set([WIZARD_CHAPTER_COUNT]));
  });
});
