import { describe, expect, it, vi } from "vitest";
import { PROMPTS, renderPrompt } from "@features/brain/server/prompts";

describe("renderPrompt", () => {
  it("fills optional arguments with a sensible default rather than a blank", () => {
    const r = renderPrompt("catch_me_up", {});
    expect("text" in r && r.text).toContain("since seven days ago");
  });

  it("asks what shipped through what_shipped when catching someone up", () => {
    const r = renderPrompt("catch_me_up", { since: "2026-09-16" });
    expect("text" in r && r.text).toContain("What shipped: what_shipped for the period");
  });

  it("puts the period into the KPI check, and paywall conversion first", () => {
    const r = renderPrompt("kpi_check", { since: "2026-09-01", until: "2026-09-22" });
    expect("text" in r && r.text).toContain("since 2026-09-01, until 2026-09-22");
    expect("text" in r && r.text).toMatch(/Paywall conversion first/);
  });

  it("catches someone up on decisions that still wait to be settled", () => {
    const r = renderPrompt("catch_me_up", { since: "2026-09-16" });
    expect("text" in r && r.text).toContain("Then decision_conflicts: name any pair still waiting");
  });

  it("asks for the person's own comment asks in what needs them", () => {
    const r = renderPrompt("what_needs_me", { person: "Mark" });
    expect("text" in r && r.text).toContain('comment_asks with person "Mark"');
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

  /**
   * The chapter pipeline in one prompt: a narrow pack, the checker until clean, a person's OK,
   * and the draft keeps its own provenance (Marcus: store the prompt with the chapter).
   */
  it("drafts a chapter from its pack, checks it, waits for an OK and records how it was made", () => {
    const r = renderPrompt("draft_chapter", { chapter: "beliefs", archetype: "Spark Seeker" });
    const text = "text" in r ? r.text : "";
    expect(text).toContain('get_context_pack with chapter "beliefs" and archetype "Spark Seeker"');
    expect(text).toContain('Run check_copy on the draft with chapter "beliefs"');
    expect(text).toMatch(/wait for my OK/);
    expect(text).toContain('"How this was made"');
    expect(text.indexOf("get_context_pack")).toBeLessThan(text.indexOf("check_copy"));
    expect(renderPrompt("draft_chapter", { chapter: "beliefs" })).toEqual({
      error: expect.stringMatching(/needs `archetype`/),
    });
  });

  it("reviews a month from its first day to its last, and last month by default", () => {
    const r = renderPrompt("monthly_review", { month: "2028-02" });
    const text = "text" in r ? r.text : "";
    expect(text).toContain("Write the monthly review of February 2028 (2028-02-01 to 2028-02-29)");
    expect(text).toContain(
      'get_business_numbers with since 2028-02-01, until 2028-02-29 and compare_to "previous"'
    );
    expect(text).toContain("user_totals with since 2028-02-01 and until 2028-02-29");
    expect(text).toMatch(/Lead with paywall conversion/);
    expect(text).toContain("cost_watch");
    // A month of changes runs past one answer's ceiling (August 2026 was cut at the 23rd).
    expect(text).toContain("what_shipped from 2028-02-01 to 2028-02-29 a week at a time");
    expect(text).toMatch(/after my OK put it in a Google Doc/);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
    try {
      const d = renderPrompt("monthly_review", {});
      expect("text" in d && d.text).toContain("December 2025 (2025-12-01 to 2025-12-31)");
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves a month it cannot read as dates for the model to work out, rather than guessing", () => {
    const r = renderPrompt("monthly_review", { month: "August" });
    const text = "text" in r ? r.text : "";
    expect(text).toContain("Write the monthly review of August for the team.");
    expect(text).toContain("since the month's first day, until its last day");
    expect(renderPrompt("monthly_review", { month: "2026-13" })).toMatchObject({
      text: expect.stringContaining("review of 2026-13 for the team"),
    });
  });

  it("onboards from their own page when there is one, and in our shape when there is not", () => {
    const r = renderPrompt("onboard", { person: "Fatih Hadžić", role: "engineering" });
    const text = "text" in r ? r.text : "";
    expect(text).toContain(
      'search_company_context for "Onboarding Fatih Hadžić" with sources ["notion"]'
    );
    expect(text).toContain("If one exists, do not write another");
    expect(text).toMatch(
      /access first, reading second, workstreams third, and a dated first deliverable/
    );
    expect(text).toContain('titled "Onboarding — Fatih Hadžić"');
    // write_to_notion takes a bare page id; the brain's ids carry a "notion/page:" prefix.
    expect(text).toContain('the part of its id after "notion/page:"');
    expect(text).toMatch(/wait for my OK/);
    expect(text.indexOf("search_company_context")).toBeLessThan(text.indexOf("write_to_notion"));
    expect(renderPrompt("onboard", {})).toEqual({ error: expect.stringMatching(/needs `person`/) });
  });

  it("asks before recording a decision, never records one on its own", () => {
    const r = renderPrompt("record_decision", { decision: "Ship the paywall blur" });
    expect("text" in r && r.text).toMatch(/wait for my OK before recording/);
  });
});
