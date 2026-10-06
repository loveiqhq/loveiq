import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  answerGaps,
  bucketOf,
  measureVisit,
  num,
  pageOf,
  paid,
  SIGNAL_EVENTS,
  SIGNAL_PROPS,
  SIGNALS,
  type UxEvent,
  type UxVisit,
} from "@features/ux-signals/logic/signals";
import { summarize } from "@features/ux-signals/logic/summary";

const S = 1000;
const ev = (t: number, event: string, props: Record<string, unknown> = {}): UxEvent => ({
  t,
  event,
  props,
});
const measure = (name: string, v: UxVisit) => {
  const def = SIGNALS.find((s) => s.name === name);
  if (!def?.measure) throw new Error(`no measure for ${name}`);
  return def.measure(v);
};

/** A survey answered at the given gaps (seconds), question ids Q1, Q2, … */
function survey(gapsS: number[], start = 0): UxEvent[] {
  const out: UxEvent[] = [ev(start, "survey_started")];
  let t = start;
  gapsS.forEach((g, i) => {
    t += g * S;
    out.push(ev(t, "survey_answer", { question_id: `Q${i + 1}` }));
    out.push(ev(t, "survey_progress", { question_index: i + 1, progress_pct: i + 1 }));
  });
  return out;
}

describe("the 22", () => {
  it("are Marcus's, by the names the walks' judge uses", async () => {
    // Not imported: judge.ts pulls in the Claude CLI and Supabase at module load.
    const judge = readFileSync("scripts/walkers/judge.ts", "utf8");
    const at = judge.indexOf("export const SIGNALS");
    const block = judge.slice(at, judge.indexOf("];", at));
    const names = [...block.matchAll(/\[\s*"([^"]+)",/g)].map((m) => m[1]);
    expect(names).toHaveLength(22);
    expect(SIGNALS.map((s) => s.name)).toEqual(names);
    expect(SIGNALS).toHaveLength(22);
  });

  it("each measures something, or says what it would need", () => {
    for (const s of SIGNALS) expect(Boolean(s.measure) !== Boolean(s.missing), s.name).toBe(true);
  });

  it("fetch every event and property a measure reads, or it reads nothing and says so quietly", () => {
    const src = readFileSync("features/ux-signals/logic/signals.ts", "utf8");
    const code = src.slice(src.indexOf("// ── The 22"));
    const events = new Set([
      ...[...code.matchAll(/e\.event === "([a-z0-9_]+)"/g)].map((m) => m[1]!),
      ...[...code.matchAll(/is\(([^)]*)\)/g)].flatMap((m) =>
        [...m[1]!.matchAll(/"([a-z0-9_]+)"/g)].map((n) => n[1]!)
      ),
    ]);
    // The helpers above "The 22" read events too.
    const helpers = src.slice(0, src.indexOf("// ── The 22"));
    for (const m of helpers.matchAll(/e\.event === "([a-z0-9_]+)"/g)) events.add(m[1]!);
    for (const m of helpers.matchAll(/is\(([^)]*)\)/g))
      for (const n of m[1]!.matchAll(/"([a-z0-9_]+)"/g)) events.add(n[1]!);
    expect([...events].filter((e) => !SIGNAL_EVENTS.includes(e))).toEqual([]);
    const props = new Set([...src.matchAll(/props\.([a-z_]+)/g)].map((m) => m[1]!));
    expect([...props].filter((p) => !(SIGNAL_PROPS as readonly string[]).includes(p))).toEqual([]);
    // And nothing fetched that no measure reads.
    expect(SIGNAL_PROPS.filter((p) => !props.has(p))).toEqual([]);
  });
});

describe("reading events", () => {
  it("takes numbers as PostHog returns them, as text", () => {
    expect(num("12")).toBe(12);
    expect(num(12)).toBe(12);
    expect(num("")).toBeNull();
    expect(num("x")).toBeNull();
    expect(num(undefined)).toBeNull();
  });

  it("names pages without keeping their tokens", () => {
    expect(pageOf("/")).toBe("landing");
    expect(pageOf("/?utm_source=x")).toBe("landing");
    expect(pageOf("/survey")).toBe("survey");
    expect(pageOf("/report/rpt_abc?v4=1")).toBe("report");
    expect(pageOf("/checkout/return")).toBe("checkout");
    expect(pageOf("/about")).toBeNull();
  });

  it("buckets as the scroll events fire", () => {
    expect([0, 24, 25, 74, 75, 99, 100].map(bucketOf)).toEqual([0, 0, 25, 50, 75, 75, 100]);
  });

  it("takes time with the tab hidden out of an answer's time", () => {
    const v = [
      ev(0, "survey_answer", { question_id: "Q1" }),
      ev(2 * S, "tab_hidden"),
      ev(62 * S, "tab_visible", { hidden_ms: 60 * S }),
      ev(65 * S, "survey_answer", { question_id: "Q2" }),
    ];
    expect(answerGaps(v)).toEqual([{ questionId: "Q2", ms: 5 * S }]);
  });

  it("knows a visit paid from the return page or the unlock, never from the checkout alone", () => {
    expect(paid([ev(0, "begin_checkout")])).toBe(false);
    expect(paid([ev(0, "checkout_return_viewed", { status: "pending" })])).toBe(false);
    expect(paid([ev(0, "checkout_return_viewed", { status: "success" })])).toBe(true);
    expect(paid([ev(0, "paywall_unlocked")])).toBe(true);
  });
});

describe("each measure", () => {
  it("time to first action: landing to the first call to action, or none", () => {
    expect(
      measure("Time to first action", [ev(0, "landing_page_view"), ev(3400, "cta_click")])
    ).toBe(3400);
    expect(measure("Time to first action", [ev(0, "landing_page_view")])).toBe("none");
    expect(measure("Time to first action", [ev(0, "survey_started")])).toBeNull();
  });

  it("step completion time: the median time per question, from five answers", () => {
    expect(measure("Step completion time", survey([9, 3, 4, 5, 6, 2]))).toBe(4000);
    expect(measure("Step completion time", survey([3, 4, 5]))).toBeNull();
  });

  it("exit point: the last stage reached, and paid over everything", () => {
    expect(measure("Drop-off / exit point", survey([3, 3]))).toBe("survey");
    expect(
      measure("Drop-off / exit point", [
        ev(0, "report_viewed"),
        ev(5, "scroll_depth_25", { pathname: "/report/x" }),
      ])
    ).toBe("report");
    // Closing the tab from an open paywall: the report page's tab_hidden does not move it.
    expect(
      measure("Drop-off / exit point", [
        ev(0, "report_viewed"),
        ev(5, "price_shown"),
        ev(9, "tab_hidden", { pathname: "/report/x" }),
      ])
    ).toBe("paywall");
    expect(
      measure("Drop-off / exit point", [
        ev(0, "begin_checkout"),
        ev(9, "checkout_return_viewed", { status: "success" }),
      ])
    ).toBe("paid");
    expect(measure("Drop-off / exit point", [])).toBeNull();
    // The paywall opening by itself as the reader leaves for Stripe: they left at checkout.
    expect(
      measure("Drop-off / exit point", [
        ev(0, "report_viewed"),
        ev(5, "sticky_unlock_clicked"),
        ev(6, "begin_checkout", { plan: "full_report" }),
        ev(7, "price_shown"),
        ev(7, "price_shown"),
      ])
    ).toBe("checkout");
    // Prices that appeared by themselves, and then the reader left: that is the paywall.
    expect(
      measure("Drop-off / exit point", [
        ev(0, "report_viewed"),
        ev(3, "scroll_depth_25", { pathname: "/report/x" }),
        ev(5, "price_shown"),
      ])
    ).toBe("paywall");
  });

  it("backtracking: coming on again to an index already reached, once per return", () => {
    const moves = (idx: number[]) =>
      idx.map((i, k) => ev(k, "survey_progress", { question_index: String(i) }));
    expect(measure("Backtracking", moves([1, 2, 3, 4]))).toBe(0);
    // Back once from Q4 to Q3, then on: index 3 again.
    expect(measure("Backtracking", moves([1, 2, 3, 3, 4]))).toBe(1);
    // Back twice, then on twice.
    expect(measure("Backtracking", moves([1, 2, 3, 4, 3, 4, 5]))).toBe(2);
    expect(measure("Backtracking", [])).toBeNull();
    const def = SIGNALS.find((s) => s.name === "Backtracking")!;
    expect(def.where!(moves([1, 2, 3, 3, 4, 5, 5]))).toEqual(["question 3", "question 5"]);
  });

  it("dead clicks: a disabled control outranks a tap on text, and none is none", () => {
    const dead = (reason?: string) =>
      ev(0, "dead_click", { reason, target_selector: "button.next" });
    expect(measure("Dead clicks", [dead("non_interactive"), dead("disabled_control")])).toBe(
      "disabled_control"
    );
    expect(measure("Dead clicks", [dead("non_interactive")])).toBe("non_interactive");
    // Staging's older detector sends no reason at all: never a disabled control.
    expect(measure("Dead clicks", [dead()])).toBe("non_interactive");
    expect(measure("Dead clicks", [])).toBe("none");
  });

  it("rage clicks: counts the bursts", () => {
    expect(measure("Rage clicks / repeated taps", [ev(0, "rage_click"), ev(9, "rage_click")])).toBe(
      2
    );
    expect(measure("Rage clicks / repeated taps", [])).toBe(0);
  });

  it("scroll: the deepest milestone on the report only", () => {
    const v = [
      ev(0, "report_viewed"),
      ev(1, "scroll_depth_25", { pathname: "/report/x" }),
      ev(2, "scroll_depth_50", { pathname: "/report/x" }),
      ev(3, "scroll_depth_100", { pathname: "/" }),
    ];
    expect(measure("Scroll behavior", v)).toBe(50);
    expect(measure("Scroll behavior", [ev(0, "report_viewed")])).toBe(0);
    expect(
      measure("Scroll behavior", [ev(0, "scroll_depth_50", { pathname: "/report/x" })])
    ).toBeNull();
  });

  it("CTA visibility: only on a report with locked chapters, and only when one was on screen", () => {
    expect(measure("CTA visibility", [ev(0, "report_viewed")])).toBeNull();
    expect(measure("CTA visibility", [ev(0, "locked_card_price_shown")])).toBe("not seen");
    // Report 3.0 shows no price, so it marks a locked report with locked_chapters_shown.
    expect(measure("CTA visibility", [ev(0, "locked_chapters_shown")])).toBe("not seen");
    expect(
      measure("CTA visibility", [
        ev(0, "locked_chapters_shown"),
        ev(1, "cta_seen", { cta: "locked_chapter" }),
      ])
    ).toBe("seen");
    expect(
      measure("CTA visibility", [
        ev(0, "locked_card_price_shown"),
        ev(9, "cta_seen", { cta: "locked_chapter" }),
      ])
    ).toBe("seen");
  });

  it("CTA hesitation: from the latest opening of the plans to the press", () => {
    const v = [
      ev(0, "price_shown"),
      ev(4 * S, "paywall_dismissed"),
      ev(30 * S, "paywall_initiated"),
      ev(36 * S, "begin_checkout", { plan: "core" }),
    ];
    expect(measure("CTA hesitation", v)).toBe(6 * S);
    // Straight from the sticky bar to Stripe: no plans were shown to weigh.
    expect(measure("CTA hesitation", [ev(0, "begin_checkout")])).toBeNull();
    // Closed, then pressed with no opening recorded since: the sticky bar, or a reopened
    // picker that sent nothing. Unknown, not the 36 s since the closed opening.
    const closed = [
      ev(0, "price_shown"),
      ev(4 * S, "paywall_dismissed"),
      ev(36 * S, "begin_checkout"),
    ];
    expect(measure("CTA hesitation", closed)).toBeNull();
    // A close after the press is not one before it.
    expect(
      measure("CTA hesitation", [
        ev(0, "price_shown"),
        ev(6 * S, "begin_checkout"),
        ev(9 * S, "paywall_dismissed"),
      ])
    ).toBe(6 * S);
  });

  it("answer hesitation: over three times the usual and over eight seconds", () => {
    expect(measure("Answer hesitation", survey([2, 3, 3, 16, 3, 3, 4]))).toBe("Q4");
    expect(measure("Answer hesitation", survey([2, 3, 3, 3, 3, 3]))).toBe("none");
    // Slow throughout: nine seconds each is this reader's usual, not a pause.
    expect(measure("Answer hesitation", survey([9, 9, 9, 9, 9, 9]))).toBe("none");
    // Fast throughout: four times a one-second usual is still not a pause under eight.
    expect(measure("Answer hesitation", survey([1, 1, 1, 1, 1, 1, 4]))).toBe("none");
    expect(measure("Answer hesitation", survey([3, 3]))).toBeNull();
  });

  it("abandoned questions: the question on screen, counted from one", () => {
    expect(measure("Skipped / abandoned questions", survey([3, 3, 3]))).toBe("Q4");
    expect(measure("Skipped / abandoned questions", [ev(0, "survey_started")])).toBe("Q1");
    expect(
      measure("Skipped / abandoned questions", [...survey([3]), ev(9 * S, "survey_completed")])
    ).toBe("completed");
    expect(measure("Skipped / abandoned questions", [ev(0, "report_viewed")])).toBeNull();
  });

  it("form errors: every refusal counts, and only on a survey", () => {
    expect(
      measure("Form errors", [
        ev(0, "survey_started"),
        ev(1, "survey_form_error"),
        ev(2, "survey_form_error"),
      ])
    ).toBe(2);
    expect(measure("Form errors", [ev(0, "survey_started")])).toBe(0);
    expect(measure("Form errors", [ev(0, "report_viewed")])).toBeNull();
  });

  it("progress sensitivity: where the bar stood when the visit left", () => {
    const at = (pct: number) => [ev(0, "survey_progress", { progress_pct: String(pct) })];
    expect(measure("Progress sensitivity", at(38))).toBe(25);
    expect(measure("Progress sensitivity", at(12))).toBe(0);
    expect(measure("Progress sensitivity", [...at(98), ev(1, "survey_completed")])).toBe(100);
    expect(measure("Progress sensitivity", [])).toBeNull();
  });

  it("pace: slowing, speeding up or steady, from twelve answers", () => {
    const pace = (first: number, last: number) =>
      measure(
        "Engagement acceleration/deceleration",
        survey([...Array(6).fill(first), ...Array(6).fill(4), ...Array(6).fill(last)])
      );
    expect(pace(3, 8)).toBe("slowing");
    expect(pace(8, 3)).toBe("speeding up");
    expect(pace(4, 5)).toBe("steady");
    expect(measure("Engagement acceleration/deceleration", survey([3, 3, 3, 3, 3]))).toBeNull();
  });

  it("expectation mismatch: gone within 45 seconds having read nothing", () => {
    expect(
      measure("Expectation mismatch", [
        ev(0, "report_viewed"),
        ev(10 * S, "tab_hidden", { pathname: "/report/x" }),
      ])
    ).toBe("bounced");
    expect(
      measure("Expectation mismatch", [
        ev(0, "report_viewed"),
        ev(5 * S, "scroll_depth_50", { pathname: "/report/x" }),
        ev(10 * S, "tab_hidden"),
      ])
    ).toBe("stayed");
    expect(
      measure("Expectation mismatch", [ev(0, "report_viewed"), ev(90 * S, "tab_hidden")])
    ).toBe("stayed");
    expect(measure("Expectation mismatch", [])).toBeNull();
  });

  it("report curiosity: chapter-list opens and jumps", () => {
    expect(
      measure("Report curiosity", [
        ev(0, "report_viewed"),
        ev(1, "report_chapter_menu_opened"),
        ev(2, "section_navigated"),
      ])
    ).toBe(2);
    expect(measure("Report curiosity", [ev(0, "report_viewed")])).toBe(0);
    expect(measure("Report curiosity", [])).toBeNull();
  });

  it("value discovery: scrolled before the prices first appeared, not after", () => {
    const v = [
      ev(0, "report_viewed"),
      ev(1, "scroll_depth_25", { pathname: "/report/x" }),
      ev(2, "price_shown"),
      ev(3, "scroll_depth_75", { pathname: "/report/x" }),
    ];
    expect(measure("Value discovery before paywall", v)).toBe(25);
    expect(measure("Value discovery before paywall", [ev(0, "report_viewed")])).toBeNull();
  });

  it("paywall dwell: the first close's duration, or none", () => {
    expect(
      measure("Paywall dwell time", [
        ev(0, "price_shown"),
        ev(8, "paywall_dismissed", { view_duration_ms: "7412.6" }),
      ])
    ).toBe(7413);
    expect(measure("Paywall dwell time", [ev(0, "price_shown")])).toBe("none");
    expect(measure("Paywall dwell time", [ev(0, "report_viewed")])).toBeNull();
  });

  it("price interaction: the plan pressed, or none after seeing prices", () => {
    expect(measure("Price interaction", [ev(0, "begin_checkout", { plan: "all_reports" })])).toBe(
      "all_reports"
    );
    expect(measure("Price interaction", [ev(0, "price_shown")])).toBe("none");
    expect(measure("Price interaction", [])).toBeNull();
  });

  it("escape: the first close's way out, or not closed", () => {
    expect(
      measure("Paywall escape behavior", [
        ev(0, "price_shown"),
        ev(1, "paywall_dismissed", { source: "escape" }),
      ])
    ).toBe("escape");
    expect(measure("Paywall escape behavior", [ev(0, "price_shown")])).toBe("not closed");
    expect(measure("Paywall escape behavior", [])).toBeNull();
  });

  it("trust seeking: FAQ opens and moves through the reviews", () => {
    expect(
      measure("Trust seeking", [
        ev(0, "faq_expanded"),
        ev(1, "testimonial_interaction"),
        ev(2, "cta_click"),
      ])
    ).toBe(2);
    expect(measure("Trust seeking", [])).toBe(0);
  });

  it("conversion blockers: paid or stopped, only for visits that went to pay", () => {
    expect(measure("Conversion blockers", [ev(0, "begin_checkout")])).toBe("stopped");
    expect(
      measure("Conversion blockers", [ev(0, "begin_checkout"), ev(1, "paywall_unlocked")])
    ).toBe("paid");
    expect(measure("Conversion blockers", [ev(0, "price_shown")])).toBeNull();
  });

  it("measureVisit gives every signal a value or null", () => {
    const out = measureVisit(survey([3, 3, 3, 3, 3, 3]));
    expect(Object.keys(out)).toEqual(SIGNALS.map((s) => s.name));
    expect(out["Backtracking"]).toBe(0);
    expect(out["Paywall dwell time"]).toBeNull();
  });
});

describe("what production recorded", () => {
  it("leaves out real visits from before the site recorded what a measure reads", () => {
    const def = SIGNALS.find((x) => x.name === "CTA visibility")!;
    const at = Date.parse(def.recordedSince!);
    const locked = (t: number, seen: boolean): UxVisit => [
      ev(t, "locked_card_price_shown"),
      ...(seen ? [ev(t + S, "cta_seen", { cta: "locked_chapter" })] : []),
    ];
    // Before the release no visit could send cta_seen, so it would read "not seen". One
    // begun a minute before it is left out whole, even with events after it.
    const r = summarize(def, [
      locked(at - 86_400_000, false),
      [...locked(at - 60_000, false), ev(at + 60_000, "report_engagement_1min")],
      locked(at, true),
    ]);
    expect(r.n).toBe(1);
    expect(r.sentence).toBe(
      "Of 1 visits: seen 100%. Only visits from 2026-10-01 on, when the site began recording it."
    );
  });

  it("is declared only where a measure's events reached production inside the window", () => {
    // Every other signal's events and properties were recorded from 2026-08-28 (PostHog,
    // checked 2026-10-01), before any 28-day window can begin.
    expect(SIGNALS.filter((x) => x.recordedSince).map((x) => x.name)).toEqual(["CTA visibility"]);
  });
});
