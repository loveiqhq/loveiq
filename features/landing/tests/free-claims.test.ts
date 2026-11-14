import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { faqs } from "@/data/faqs";
import { GET as llmsTxt } from "@/app/llms.txt/route";
import { ENTRY_PRICE, SURVEY_FREE_LINE } from "@features/landing/logic/freeClaims";

/**
 * GEO/SEO phase 1, card 2 (promised at the 29 Oct sync): the site told Google and AI
 * assistants the result costs nothing, while nothing personal opens before EUR 1.99. Marcus,
 * 13 Nov: "The survey is free and your initial result. Deeper reports start at €1.99",
 * adapted to context, and "we shouldn't make claims we can't deliver on". Until Mark's new
 * EUR 1.99 page (which shows the archetype) wins its 50/50, only half the finishers get an
 * initial result for free, so the line stops at what is true for everyone.
 */
const page = readFileSync(join(process.cwd(), "app/page.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ");
const answer = (question: string) => faqs.find((f) => f.question === question)?.answer;

describe("what the site says is free", () => {
  it("says the survey is free and reports start at the EUR 1.99 entry price", () => {
    expect(ENTRY_PRICE).toBe("€1.99");
    expect(SURVEY_FREE_LINE).toBe("The survey is free. Deeper reports start at €1.99.");
  });

  it("no longer tells search engines the result is free", () => {
    expect(page).not.toMatch(/price:\s*"0"/);
    expect(page).not.toMatch(/Free introductory assessment/i);
    expect(page).not.toMatch(/A free psychological self-assessment/i);
    expect(page).toContain("SURVEY_FREE_LINE");
  });

  // Both answers passed Jarvis's copy gate (check_copy, 14 Nov): reading grade 5.8.
  it("answers 'Is it free?' with the same line", () => {
    expect(answer("Is it free?")).toBe(`${SURVEY_FREE_LINE.slice(0, -1)}, paid once.`);
  });

  it("promises no coach or paid session that does not exist", () => {
    for (const f of faqs) expect(`${f.question} ${f.answer}`).not.toMatch(/coach|sessions/i);
  });

  it("claims no machine learning: scoring follows fixed rules", () => {
    for (const f of faqs) expect(f.answer).not.toMatch(/machine.learning/i);
    expect(answer("Is it based on science?")).toMatch(/fixed rules across 21 measured dimensions/);
  });

  it("tells AI assistants about the EUR 1.99 step too (llms.txt)", async () => {
    const text = await (await llmsTxt()).text();
    expect(text).toContain(SURVEY_FREE_LINE);
  });
});
