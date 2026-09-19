import { describe, expect, it } from "vitest";

import { sampleForDay, tabsPresentInText } from "@/app/api/cron/brain-reconcile/route";

/**
 * The check that would have caught the 2026-09-19 spreadsheet bug, in which a file was
 * indexed, counted, and reconciled to the exact document while holding one tab of two.
 * Every other reconciler check compares two numbers we already hold; this is the only
 * one that compares the corpus against the source, so its comparison must be exact.
 */
describe("tabsPresentInText", () => {
  const body = "Business Case\n## Costs\nSlack, 41.25\n## Core_KPI\nPaid Reports, 600";

  it("counts a tab that is really there", () => {
    expect(tabsPresentInText(body, ["Costs", "Core_KPI"])).toBe(2);
  });

  it("does NOT count a tab that is missing — the whole point", () => {
    expect(tabsPresentInText("Business Case\n## Costs\nSlack, 41.25", ["Costs", "Core_KPI"])).toBe(
      1
    );
  });

  it("requires the heading, not a passing mention of the word", () => {
    // A sheet whose cells happen to say "Core_KPI" has not had that tab indexed.
    const mentions = "Business Case\n## Costs\nsee the Core_KPI tab for detail";
    expect(tabsPresentInText(mentions, ["Costs", "Core_KPI"])).toBe(1);
  });

  it("handles a tab name with spaces and punctuation", () => {
    expect(tabsPresentInText("## Q4 Plan (draft)\nrows", ["Q4 Plan (draft)"])).toBe(1);
  });

  it("is zero for an empty corpus body, not an error", () => {
    expect(tabsPresentInText("", ["Costs"])).toBe(0);
  });
});

describe("sampleForDay", () => {
  const all = Array.from({ length: 40 }, (_, i) => `doc${i}`);

  it("checks a different set each day", () => {
    expect(sampleForDay(all, 0, 3)).not.toEqual(sampleForDay(all, 1, 3));
  });

  it("eventually covers EVERY document — the whole point", () => {
    // `sort().slice(0, 3)` checked the same three forever and left 37 unverified.
    const seen = new Set<string>();
    for (let d = 0; d < 40; d++) for (const x of sampleForDay(all, d, 3)) seen.add(x);
    expect(seen.size).toBe(all.length);
  });

  it("returns everything when there is less than a sample's worth", () => {
    expect(sampleForDay(["a", "b"], 5, 3)).toEqual(["a", "b"]);
  });

  it("never returns fewer than asked for, or a hole", () => {
    for (let d = 0; d < 45; d++) {
      const s = sampleForDay(all, d, 3);
      expect(s).toHaveLength(3);
      expect(s.every((x) => typeof x === "string")).toBe(true);
    }
  });

  it("handles a negative day index rather than producing nothing", () => {
    expect(sampleForDay(all, -1, 3)).toHaveLength(3);
  });
});
