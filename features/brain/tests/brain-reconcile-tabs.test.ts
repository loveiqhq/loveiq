import { describe, expect, it } from "vitest";

import { tabsPresentInText } from "@/app/api/cron/brain-reconcile/route";

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
