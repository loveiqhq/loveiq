import { describe, it, expect } from "vitest";
import { classifyRevisited } from "@features/admin/server/digest-recommendation-compare";
import type { Recommendation } from "@features/admin/server/digest-recommendations";
import type { HistoricalRecommendation } from "@features/admin/server/digest-recommendation-history";

function h(
  weekKey: string,
  rule: string,
  fp: Record<string, number | string> = {},
  message = `${rule} firing`
): HistoricalRecommendation {
  return {
    weekKey,
    rule,
    severity: "med",
    message,
    evidence: "stub",
    fingerprint: fp,
    createdAt: `${weekKey}-T00:00:00Z`,
  };
}

function r(
  rule: string,
  fp: Record<string, number | string> = {},
  message = `${rule} current`
): Recommendation {
  return {
    severity: "med",
    rule,
    message,
    evidence: "stub",
    fingerprint: fp,
  };
}

describe("classifyRevisited", () => {
  it("returns [] when history is empty", () => {
    expect(classifyRevisited([], [r("wizard_slide_drop_4_5")])).toEqual([]);
  });

  it("classifies a rule in history but not in current as resolved", () => {
    const history = [h("2026-W21", "wizard_slide_drop_4_5", { kept_pct: 65 })];
    const current: Recommendation[] = [];
    const out = classifyRevisited(history, current);
    expect(out).toHaveLength(1);
    expect(out[0]!.status).toBe("resolved");
    expect(out[0]!.currentMessage).toBeUndefined();
  });

  it("classifies a rule in both as ongoing with delta when fingerprint matches", () => {
    const history = [h("2026-W21", "wizard_slide_drop_4_5", { kept_pct: 65 })];
    const current = [r("wizard_slide_drop_4_5", { kept_pct: 70 })];
    const out = classifyRevisited(history, current);
    expect(out[0]!.status).toBe("ongoing");
    expect(out[0]!.deltaSummary).toContain("65%");
    expect(out[0]!.deltaSummary).toContain("70%");
    expect(out[0]!.deltaSummary).toContain("+5pp");
  });

  it("classifies as worsened when fingerprint metric moves the wrong direction", () => {
    // wizard kept_pct decreased = worsened
    const history = [h("2026-W21", "wizard_slide_drop_4_5", { kept_pct: 78 })];
    const current = [r("wizard_slide_drop_4_5", { kept_pct: 62 })];
    const out = classifyRevisited(history, current);
    expect(out[0]!.status).toBe("worsened");
    expect(out[0]!.deltaSummary).toContain("-16pp");
  });

  it("handles dropoff_revenue_loss (lower is better)", () => {
    const history = [h("2026-W21", "dropoff_revenue_loss", { est_lost_revenue: 500 })];
    const current = [r("dropoff_revenue_loss", { est_lost_revenue: 300 })];
    const out = classifyRevisited(history, current);
    expect(out[0]!.status).toBe("ongoing"); // improvement → not worsened
    expect(out[0]!.deltaSummary).toContain("€500");
    expect(out[0]!.deltaSummary).toContain("€300");
  });

  it("handles channel_efficiency_low (dynamic key, paid_rate higher is better)", () => {
    const history = [h("2026-W21", "channel_efficiency_low_google", { paid_rate: 0 })];
    const current = [r("channel_efficiency_low_google", { paid_rate: 4.2 })];
    const out = classifyRevisited(history, current);
    expect(out[0]!.status).toBe("ongoing"); // improvement, not worsened
    expect(out[0]!.deltaSummary).toContain("4.2%");
  });

  it("counts consecutive weeks when same rule appears in multiple historical weeks", () => {
    const history = [
      h("2026-W21", "channel_efficiency_low_google", { paid_rate: 0 }),
      h("2026-W20", "channel_efficiency_low_google", { paid_rate: 0 }),
      h("2026-W19", "channel_efficiency_low_google", { paid_rate: 0 }),
    ];
    const current = [r("channel_efficiency_low_google", { paid_rate: 0 })];
    const out = classifyRevisited(history, current, "2026-W22");
    expect(out[0]!.consecutiveWeeks).toBe(4); // W19 + W20 + W21 + W22
  });

  it("skips a rule with an unknown family (defensive against renames)", () => {
    const history = [h("2026-W21", "totally_new_rule_no_one_added_to_registry")];
    const current = [r("totally_new_rule_no_one_added_to_registry")];
    const out = classifyRevisited(history, current);
    // Still emits the entry as ongoing — just without a delta line (can't
    // compare without a direction registry entry).
    expect(out[0]!.status).toBe("ongoing");
    expect(out[0]!.deltaSummary).toBeUndefined();
  });

  it("treats missing/non-numeric fingerprint values gracefully", () => {
    const history = [h("2026-W21", "wizard_slide_drop_4_5", { kept_pct: "not_a_number" })];
    const current = [r("wizard_slide_drop_4_5", { kept_pct: 70 })];
    const out = classifyRevisited(history, current);
    expect(out[0]!.status).toBe("ongoing");
    expect(out[0]!.deltaSummary).toBeUndefined(); // can't compute delta
  });

  it("only compares against the MOST RECENT history week (older rules don't pollute)", () => {
    const history = [
      h("2026-W21", "wizard_slide_drop_4_5", { kept_pct: 78 }), // last week
      h("2026-W18", "answer_lift_positive", { lift_pct: 200 }), // old, stale
    ];
    const current = [r("wizard_slide_drop_4_5", { kept_pct: 80 })];
    const out = classifyRevisited(history, current);
    // Only the W21 rule shows up; W18 rule is older than "last week" so skipped.
    expect(out).toHaveLength(1);
    expect(out[0]!.rule).toBe("wizard_slide_drop_4_5");
  });

  it("sorts worsened before resolved before ongoing", () => {
    const history = [
      h("2026-W21", "wizard_slide_drop_4_5", { kept_pct: 78 }),
      h("2026-W21", "channel_efficiency_low_google", { paid_rate: 0 }),
      h("2026-W21", "dropoff_revenue_loss", { est_lost_revenue: 500 }),
    ];
    const current = [
      r("wizard_slide_drop_4_5", { kept_pct: 62 }), // worsened
      // channel rule absent → resolved
      r("dropoff_revenue_loss", { est_lost_revenue: 400 }), // ongoing improvement
    ];
    const out = classifyRevisited(history, current);
    expect(out.map((e) => e.status)).toEqual(["worsened", "resolved", "ongoing"]);
  });

  it("drops same-week history rows so a Monday cron retry does not self-compare", () => {
    // History has BOTH last week (W21) AND this week (W22, persisted on first
    // run of this Monday). Without the currentWeekKey filter, classifyRevisited
    // would compare each current rule against its OWN persisted snapshot →
    // every entry would show as ongoing with delta=0.
    const history = [
      h("2026-W22", "wizard_slide_drop_4_5", { kept_pct: 62 }), // same-week, must be dropped
      h("2026-W21", "wizard_slide_drop_4_5", { kept_pct: 78 }), // real last-week reference
    ];
    const current = [r("wizard_slide_drop_4_5", { kept_pct: 62 })];
    const out = classifyRevisited(history, current, "2026-W22");
    // Should compare against W21 (kept_pct 78), not W22 (62), so the delta
    // shows the actual week-over-week movement.
    expect(out[0]!.status).toBe("worsened");
    expect(out[0]!.deltaSummary).toContain("78%");
    expect(out[0]!.deltaSummary).toContain("62%");
  });

  it("uses CURRENT week's severity (not historical) for an ongoing rule", () => {
    // Last week was med, this week is high (escalated)
    const history = [
      { ...h("2026-W21", "wizard_slide_drop_4_5", { kept_pct: 78 }), severity: "med" as const },
    ];
    const current: Recommendation[] = [
      {
        severity: "high",
        rule: "wizard_slide_drop_4_5",
        message: "...",
        evidence: "...",
        fingerprint: { kept_pct: 60 },
      },
    ];
    const out = classifyRevisited(history, current);
    expect(out[0]!.severity).toBe("high"); // current wins
  });
});
