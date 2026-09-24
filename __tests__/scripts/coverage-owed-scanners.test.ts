import { describe, expect, it } from "vitest";

import { owedScanners, scannersByTrigger } from "@/scripts/lib/scanners-by-trigger.mjs";

/**
 * "Opened by some scanner" is not "opened by the one that should have looked".
 * Until 2026-09-24 a reader counted as covered once ANY scanner opened them, so
 * 40 finishers in 14 days, one with 65 dead taps, were never sent back to the
 * survey and report scanners that had skipped them.
 */
describe("which scanners still owe a finished reader a look", () => {
  const TRIGGERS = ["survey_started", "report_viewed", "dead_click", "rage_click"];
  const sc = (id: string, trigger: string, sampling_mode: string) => ({
    id,
    name: id,
    sampling_mode,
    query: { events: [{ id: trigger }] },
  });
  const byTrigger = scannersByTrigger([
    sc("survey", "survey_started", "comprehensive"),
    sc("report", "report_viewed", "comprehensive"),
    sc("dead", "dead_click", "focused"),
    sc("rage", "rage_click", "comprehensive"),
  ]);
  const owed = (counts: number[], seen: string[]) =>
    owedScanners(counts, TRIGGERS, byTrigger, new Set(seen))
      .map((s: { id: string }) => s.id)
      .sort();

  it("owes a comprehensive scanner every session its trigger matched", () => {
    // Submission 2183: opened by the rage-click scanner alone.
    expect(owed([1, 1, 65, 1], ["rage"])).toEqual(["report", "survey"]);
  });

  it("owes nothing to a scanner that already looked, or whose trigger never fired", () => {
    expect(owed([1, 1, 0, 0], ["survey", "report"])).toEqual([]);
    expect(owed([1, 0, 0, 0], ["survey"])).toEqual([]);
  });

  it("owes a focused scanner only a reader nothing else opened", () => {
    // Focused skips by design; that is a spend decision, not a miss.
    expect(owed([1, 0, 3, 0], ["survey"])).toEqual([]);
    expect(owed([1, 0, 3, 0], [])).toEqual(["dead", "survey"]);
  });

  it("names a scanner once even when two of its triggers fired", () => {
    const both = scannersByTrigger([
      {
        id: "x",
        name: "x",
        sampling_mode: "comprehensive",
        query: { events: [{ id: "survey_started" }, { id: "report_viewed" }] },
      },
    ]);
    expect(owedScanners([1, 1, 0, 0], TRIGGERS, both, new Set()).length).toBe(1);
  });
});
