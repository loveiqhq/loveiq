import { describe, expect, it } from "vitest";
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

  it("asks before recording a decision, never records one on its own", () => {
    const r = renderPrompt("record_decision", { decision: "Ship the paywall blur" });
    expect("text" in r && r.text).toMatch(/wait for my OK before recording/);
  });
});
