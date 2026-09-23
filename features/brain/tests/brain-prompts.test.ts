import { describe, expect, it } from "vitest";
import { PROMPTS, renderPrompt } from "@features/brain/server/prompts";

describe("renderPrompt", () => {
  it("fills optional arguments with a sensible default rather than a blank", () => {
    const r = renderPrompt("catch_me_up", {});
    expect("text" in r && r.text).toContain("since seven days ago");
  });

  it("puts the period into the KPI check, and paywall conversion first", () => {
    const r = renderPrompt("kpi_check", { since: "2026-09-01", until: "2026-09-22" });
    expect("text" in r && r.text).toContain("since 2026-09-01, until 2026-09-22");
    expect("text" in r && r.text).toMatch(/Paywall conversion first/);
  });

  it("trims arguments and treats whitespace as missing", () => {
    const r = renderPrompt("record_decision", { decision: "   " });
    expect(r).toEqual({ error: expect.stringMatching(/needs `decision`/) });
  });

  it("ignores a non-string argument instead of printing [object Object]", () => {
    const r = renderPrompt("what_needs_me", { person: { name: "Mark" } });
    expect("error" in r).toBe(true);
  });

  /** Every prompt answers in the house style: short, plain, every fact linked. */
  it("carries the house rules on every prompt that produces an answer", () => {
    for (const p of PROMPTS.filter((x) => x.name !== "record_decision")) {
      const args = Object.fromEntries(p.arguments.map((a) => [a.name, "x"]));
      const r = renderPrompt(p.name, args);
      expect("text" in r && r.text, p.name).toMatch(/Put a link or id beside every fact/);
    }
  });

  it("asks before recording a decision, never records one on its own", () => {
    const r = renderPrompt("record_decision", { decision: "Ship the paywall blur" });
    expect("text" in r && r.text).toMatch(/wait for my OK before recording/);
  });
});
