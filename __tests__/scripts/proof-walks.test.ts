/**
 * The UX checker's proof walks (scripts/walkers/plants.ts, check-signals.ts): which
 * behaviours each plants, the truth it keeps, and what it stores. The measures they prove
 * are tested in features/ux-signals/tests.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { agrees } from "@features/ux-signals/logic/proof";
import { SIGNALS, type UxEvent } from "@features/ux-signals/logic/signals";

import { MIN_EVENTS, rowsIn, storable, tonight } from "../../scripts/walkers/check-signals";
import {
  draw,
  emptyLog,
  plantsFor,
  proofWalksFor,
  scrubEvent,
  truthOf,
  type WalkLog,
} from "../../scripts/walkers/plants";

describe("what a proof walk plants", () => {
  it("is the same for the same night and walk, and different for another", () => {
    expect(plantsFor("2026-10-01|a--b", { phone: false })).toEqual(
      plantsFor("2026-10-01|a--b", { phone: false })
    );
    expect(draw("x", "faq")).not.toBe(draw("y", "faq"));
  });

  it("plants each behaviour on about half the walks, so both sides get tested", () => {
    const all = Array.from({ length: 400 }, (_, i) => plantsFor(`n${i}`, { phone: i % 2 === 0 }));
    const share = (f: (p: (typeof all)[number]) => boolean) => all.filter(f).length / all.length;
    for (const [name, f] of [
      ["faq", (p) => p.faq],
      ["backs", (p) => p.backs > 0],
      ["dead Next", (p) => p.deadNextAt > 0],
      ["form error", (p) => p.formError],
      ["hesitation", (p) => p.hesitateAt.length > 0],
      ["rage", (p) => p.rage],
      ["chapters", (p) => p.chapters],
      ["escape", (p) => p.escape !== "none"],
      ["reviews", (p) => p.reviews],
    ] as Array<[string, (p: (typeof all)[number]) => boolean]>) {
      expect(share(f), name).toBeGreaterThan(0.35);
      expect(share(f), name).toBeLessThan(0.65);
    }
    expect(new Set(all.map((p) => p.pace))).toEqual(new Set(["steady", "slowing", "speeding up"]));
  });

  it("only uses Back on a phone and a tap outside on a desktop", () => {
    const escapes = (phone: boolean) =>
      new Set(Array.from({ length: 300 }, (_, i) => plantsFor(`e${i}`, { phone }).escape));
    expect(escapes(true)).toEqual(new Set(["none", "close_button", "escape", "browser_back"]));
    expect(escapes(false)).toEqual(new Set(["none", "close_button", "escape", "backdrop"]));
  });

  it("keeps its survey plants where the survey has room for them", () => {
    for (let i = 0; i < 300; i++) {
      const p = plantsFor(`r${i}`, { phone: false, quit: "survey" });
      // A backtrack needs questions behind it; a quit needs a started survey.
      expect(p.backsAt).toBeGreaterThanOrEqual(6);
      expect(p.quitAt).toBeGreaterThanOrEqual(3);
      expect(p.quitAt).toBeLessThanOrEqual(40);
      for (const h of p.hesitateAt) expect(h).toBeGreaterThanOrEqual(8);
    }
  });

  it("walks two phones and two desktops a night, one of them leaving early, a different way each day", () => {
    const day = (d: number) => proofWalksFor(new Date(Date.UTC(2026, 9, 1 + d, 2, 41)));
    const tonight = day(0);
    expect(tonight.filter((w) => w.device === "iPhone 15 Pro")).toHaveLength(2);
    expect(tonight.filter((w) => w.device === "Desktop Chrome")).toHaveLength(2);
    expect(tonight.filter((w) => w.quit)).toHaveLength(1);
    const quits = new Set([0, 1, 2, 3].map((d) => day(d).find((w) => w.quit)!.quit));
    expect(quits).toEqual(new Set(["survey", "report", "paywall", "checkout"]));
    // Every way of leaving meets both devices within eight nights.
    const seen = new Set(
      [0, 1, 2, 3, 4, 5, 6, 7].map((d) => {
        const w = day(d).find((x) => x.quit)!;
        return `${w.quit} on ${w.device}`;
      })
    );
    expect(seen.size).toBe(8);
  });
});

/**
 * The events perfect instrumentation would send for what the log says the walk did. The
 * proof compares the measures with the truth on the site's REAL events; here the events are
 * made to be right, so a disagreement can only be a truth rule and a measure that do not
 * mean the same thing, which would make every real proof wrong in the same direction.
 */
function perfectEvents(log: WalkLog): UxEvent[] {
  const out: UxEvent[] = [];
  const e = (t: number, event: string, props: Record<string, unknown> = {}) =>
    out.push({ t, event, props });
  if (log.landingShownAt !== undefined) e(log.landingShownAt, "landing_page_view");
  if (log.ctaPressedAt !== undefined) e(log.ctaPressedAt, "cta_click", { cta: "start_survey" });
  e(1_000_000, "survey_started");
  // survey_progress names the index moved TO: the left question's place, counted from 1.
  for (const c of log.commits) {
    e(c.at, "survey_answer", { question_id: c.questionId });
    e(c.at, "survey_progress", {
      question_index: c.position,
      progress_pct: Math.round((100 * c.position) / 60),
    });
  }
  if (log.completedSurvey) e(3_000_000, "survey_completed");
  for (let i = 0; i < log.formErrors; i++) e(1_500_000, "survey_form_error");
  for (const d of log.deadTaps) e(1_600_000, "dead_click", { reason: d });
  for (let i = 0; i < log.rageBursts; i++) e(1_600_001, "rage_click");
  for (let i = 0; i < log.trustActions; i++) e(1_600_002, "faq_expanded");
  if (log.reportShown) {
    e(4_000_000, "report_viewed");
    if (log.reportHasLockedCards) e(4_000_001, "locked_card_price_shown");
    if (log.lockedCtaSeen) e(4_000_002, "cta_seen", { cta: "locked_chapter" });
    for (let i = 0; i < log.chapterMoves; i++) e(4_000_003, "section_navigated");
    for (const b of [25, 50, 75, 100]) {
      if ((log.scrollBeforePaywallPct ?? log.reportScrollPct) >= b) {
        e(4_000_010 + b, `scroll_depth_${b}`, { pathname: "/report/x" });
      }
    }
  }
  if (log.pricesShown) {
    e(5_000_000, "price_shown");
    if (log.firstClose) {
      e(5_000_000 + log.firstClose.afterMs, "paywall_dismissed", {
        source: log.firstClose.how,
        view_duration_ms: log.firstClose.afterMs,
      });
    }
  }
  for (const b of [25, 50, 75, 100]) {
    if (log.reportShown && log.reportScrollPct >= b && (log.scrollBeforePaywallPct ?? 0) < b) {
      e(5_500_000 + b, `scroll_depth_${b}`, { pathname: "/report/x" });
    }
  }
  if (log.checkoutPlan) {
    e(6_000_000 + (log.planPressedAfterMs ?? 0), "begin_checkout", { plan: log.checkoutPlan });
    if (log.planPressedAfterMs !== undefined) {
      out.push({ t: 6_000_000, event: "paywall_initiated", props: {} });
    }
  }
  if (log.paid) e(7_000_000, "checkout_return_viewed", { status: "success" });
  if (log.bounced) e(4_000_000 + 8_000, "tab_hidden", { pathname: "/report/x" });
  return out.sort((a, b) => a.t - b.t);
}

/** Commits at these gaps (seconds), one question each; `back` repeats places as a backtrack does. */
const commits = (gapsS: number[], back?: { at: number; steps: number }) => {
  let at = 1_000_000;
  const places: number[] = [];
  for (let p = 1; places.length < gapsS.length; p++) {
    places.push(p);
    if (back && p === back.at)
      for (let b = back.steps; b > 0 && places.length < gapsS.length; b--) places.push(p - b + 1);
  }
  return gapsS.map((g, i) => ({
    at: (at += g * 1000),
    questionId: `0${1000 + places[i]!}`,
    position: places[i]!,
  }));
};

describe("the truth a proof walk keeps", () => {
  const paying: WalkLog = {
    ...emptyLog(),
    landingShownAt: 100,
    ctaPressedAt: 4_100,
    commits: commits([3, 3, 4, 3, 18, 3, 4, 3, 3, 4, 3, 3, 3, 4, 3], { at: 7, steps: 1 }),
    backs: 1,
    deadTaps: ["disabled_control", "non_interactive"],
    rageBursts: 1,
    formErrors: 1,
    completedSurvey: true,
    reportShown: true,
    reportScrollPct: 88,
    scrollBeforePaywallPct: 40,
    reportHasLockedCards: true,
    lockedCtaSeen: true,
    chapterMoves: 2,
    pricesShown: true,
    firstClose: { how: "escape", afterMs: 4_400 },
    trustActions: 2,
    planPressedAfterMs: 6_200,
    checkoutPlan: "core",
    paid: true,
  };

  it("knows a paying walk's every signal", () => {
    expect(truthOf(paying)).toMatchObject({
      "Time to first action": 4_000,
      "Drop-off / exit point": "paid",
      Backtracking: 1,
      "Dead clicks": "disabled_control",
      "Rage clicks / repeated taps": 1,
      "Scroll behavior": 75,
      "CTA visibility": "seen",
      "CTA hesitation": 6_200,
      "Answer hesitation": "01005",
      "Skipped / abandoned questions": "completed",
      "Form errors": 1,
      "Progress sensitivity": 100,
      "Expectation mismatch": "stayed",
      "Report curiosity": 2,
      "Value discovery before paywall": 25,
      "Paywall dwell time": 4_400,
      "Price interaction": "core",
      "Paywall escape behavior": "escape",
      "Trust seeking": 2,
      "Conversion blockers": "paid",
    });
  });

  it("calls a pause long by the same floor as the measure, and knows no exit it did not make", () => {
    const t = truthOf({
      ...emptyLog(),
      commits: commits([1, 1, 1, 1, 1, 1, 4, 1]),
      completedSurvey: true,
    });
    // Four seconds is four times this walk's usual, and still under the eight-second floor.
    expect(t["Answer hesitation"]).toBe("none");
    // Finished without paying and without leaving early (--no-pay): no exit to claim.
    expect(t).not.toHaveProperty("Drop-off / exit point");
  });

  it("knows where a quitter left, and claims nothing it did not reach", () => {
    const t = truthOf({
      ...emptyLog(),
      commits: commits([3, 3, 3]),
      quitOn: { question: 4, progressPct: 6 },
      exit: "survey",
    });
    expect(t["Drop-off / exit point"]).toBe("survey");
    expect(t["Skipped / abandoned questions"]).toBe("Q4");
    expect(t["Progress sensitivity"]).toBe(0);
    for (const later of ["Scroll behavior", "Paywall dwell time", "Conversion blockers"]) {
      expect(t, later).not.toHaveProperty(later);
    }
  });

  it("means by each signal exactly what its measure means, on events that are right", () => {
    const logs: WalkLog[] = [
      paying,
      {
        ...paying,
        commits: commits([3, 3, 4, 3, 18, 3, 4, 3, 3, 4, 3, 3, 3, 4, 3]),
        backs: 0,
        deadTaps: [],
        rageBursts: 0,
        formErrors: 0,
        firstClose: undefined,
      },
      {
        ...emptyLog(),
        commits: commits([4, 4, 4, 4, 4, 4, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9]),
        reportShown: true,
        bounced: true,
        completedSurvey: true,
        exit: "report",
      },
    ];
    for (const log of logs) {
      const truth = truthOf(log);
      const events = perfectEvents(log);
      for (const def of SIGNALS) {
        if (!(def.name in truth) || !def.measure) continue;
        expect(
          agrees(def, truth[def.name]!, def.measure(events)),
          `${def.name}: truth ${JSON.stringify(truth[def.name])}, measure ${JSON.stringify(def.measure(events))}`
        ).toBe(true);
      }
    }
  });

  it("takes report tokens and Stripe sessions out of what it stores", () => {
    expect(
      scrubEvent({
        t: 1,
        event: "scroll_depth_25",
        props: { pathname: "/report/rpt_abc123?v4=1", n: 3, url: "https://x/c/pay/cs_test_a1B2" },
      }).props
    ).toEqual({ pathname: "/report/<token>?v4=1", n: 3, url: "https://x/c/pay/cs_<session>" });
  });
});

describe("storing the proof walks", () => {
  it("stores only walks that finished and know their truth, with what they planted", () => {
    const dir = mkdtempSync(join(tmpdir(), "proof-"));
    try {
      const walk = (name: string, files: Record<string, unknown>) => {
        mkdirSync(join(dir, name));
        for (const [f, v] of Object.entries(files)) {
          writeFileSync(join(dir, name, f), JSON.stringify(v));
        }
      };
      walk("done--desktop-chrome", {
        "walk.json": {
          startedAt: "2026-10-01T02:41:00Z",
          origin: "https://loveiq-staging-git-main-loveiq.vercel.app",
          planted: ["tapped a report heading four times in under a second"],
          plantFailures: ["closing the paywall with backdrop left it open"],
        },
        "events.json": [{ t: 1, event: "rage_click", props: {} }],
        "truth.json": { "Rage clicks / repeated taps": 1 },
      });
      walk("stopped--iphone-15-pro", { "walk.json": { startedAt: "x", origin: "y" } });
      // A walk run by hand gets a key from its start, so storing it twice adds it once.
      expect(rowsIn(dir, null)[0]!.run_id).toBe("hand:2026-10-01T02:41:00Z");
      const rows = rowsIn(dir, "123");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        walk: "done--desktop-chrome",
        run_id: "123",
        truth: { "Rage clicks / repeated taps": 1 },
        planted: [
          "tapped a report heading four times in under a second",
          "NOT DONE: closing the paywall with backdrop left it open",
        ],
      });
      expect(tonight(rows)).toContain("Rage clicks / repeated taps: right on 1 of 1");
      expect(tonight(rows)).toContain("Backtracking: no walk tonight knew it");
      // One event is a deaf walk, not a quiet one: kept out of the proofs, and said.
      expect(storable(rows)).toEqual({ rows: [], deaf: rows });
      const loud = { ...rows[0]!, events: Array(MIN_EVENTS).fill(rows[0]!.events[0]) };
      expect(storable([loud]).rows).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
