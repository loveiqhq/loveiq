import { describe, expect, it } from "vitest";

import { agrees, prove, proveAll, type WalkRecord } from "@features/ux-signals/logic/proof";
import { SIGNALS, type SignalDef, type UxEvent } from "@features/ux-signals/logic/signals";

const def = (name: string): SignalDef => SIGNALS.find((s) => s.name === name)!;
const ev = (t: number, event: string, props: Record<string, unknown> = {}): UxEvent => ({
  t,
  event,
  props,
});
const walk = (n: number, events: UxEvent[], truth: WalkRecord["truth"]): WalkRecord => ({
  walk: `w${n}`,
  walkedAt: "2026-10-01T02:41:00Z",
  events,
  truth,
});

/** Rage walks: `hits` with a burst, `quiet` without, the truth as given. */
function rageWalks(spec: Array<{ burst: boolean; truth: number }>): WalkRecord[] {
  return spec.map((s, i) =>
    walk(i, s.burst ? [ev(0, "rage_click")] : [], { "Rage clicks / repeated taps": s.truth })
  );
}

describe("agreement", () => {
  it("allows a duration a second or a fifth either way, whichever is larger", () => {
    const d = def("Paywall dwell time");
    expect(agrees(d, 5000, 5900)).toBe(true);
    expect(agrees(d, 5000, 6100)).toBe(false);
    expect(agrees(d, 20_000, 23_900)).toBe(true);
    expect(agrees(d, 20_000, 24_100)).toBe(false);
    expect(agrees(d, "none", "none")).toBe(true);
    expect(agrees(d, "none", 5000)).toBe(false);
  });

  it("holds step time closer: a median of a few seconds", () => {
    const d = def("Step completion time");
    expect(agrees(d, 3000, 3450)).toBe(true);
    expect(agrees(d, 3000, 3500)).toBe(false);
  });

  it("never agrees with a measure that found nothing to measure", () => {
    expect(agrees(def("Backtracking"), 0, null)).toBe(false);
  });

  it("needs the exact value for everything else", () => {
    expect(agrees(def("Backtracking"), 1, 1)).toBe(true);
    expect(agrees(def("Backtracking"), 1, 2)).toBe(false);
    expect(agrees(def("Paywall escape behavior"), "escape", "close_button")).toBe(false);
  });
});

describe("proof", () => {
  it("proves a measure right on enough walks of both kinds", () => {
    const p = prove(
      def("Rage clicks / repeated taps"),
      rageWalks([
        ...Array(4).fill({ burst: true, truth: 1 }),
        ...Array(8).fill({ burst: false, truth: 0 }),
      ])
    );
    expect(p).toMatchObject({ proven: true, cases: 12, right: 12 });
    expect(p.why).toBe("Right on 12 of 12 walks (100%).");
  });

  it("refuses a measure that always says nothing, however right it is on quiet walks", () => {
    // The measure never sees the bursts, and is still right on 18 of 21: 86%.
    const p = prove(
      def("Rage clicks / repeated taps"),
      rageWalks([
        ...Array(3).fill({ burst: false, truth: 1 }),
        ...Array(18).fill({ burst: false, truth: 0 }),
      ])
    );
    expect(p.proven).toBe(false);
    expect(p.positives).toEqual({ cases: 3, right: 0 });
    expect(p.why).toMatch(/Right on 0% of the walks where it happened and 100% where it did not/);
    expect(p.misses[0]).toEqual({ walk: "w0", truth: 1, measured: 0 });
  });

  it("needs both sides before it judges at all", () => {
    const p = prove(
      def("Rage clicks / repeated taps"),
      rageWalks(Array(12).fill({ burst: false, truth: 0 }))
    );
    expect(p.proven).toBe(false);
    expect(p.why).toMatch(/has 0 and 12/);
  });

  it("needs ten walks", () => {
    const p = prove(
      def("Rage clicks / repeated taps"),
      rageWalks([
        ...Array(3).fill({ burst: true, truth: 1 }),
        ...Array(6).fill({ burst: false, truth: 0 }),
      ])
    );
    expect(p).toMatchObject({ proven: false, cases: 9 });
    expect(p.why).toBe("Tested on 9 walks so far; it needs 10.");
  });

  it("holds each side to 80%, not the total", () => {
    // 4 of 5 bursts seen (80%), 7 of 8 quiet ones right (87.5%): proven.
    const ok = prove(
      def("Rage clicks / repeated taps"),
      rageWalks([
        ...Array(4).fill({ burst: true, truth: 1 }),
        { burst: false, truth: 1 },
        ...Array(7).fill({ burst: false, truth: 0 }),
        { burst: true, truth: 0 },
      ])
    );
    expect(ok.proven).toBe(true);
    // 3 of 5 bursts seen: 60%, though 12 of 14 overall is 86%.
    const not = prove(
      def("Rage clicks / repeated taps"),
      rageWalks([
        ...Array(3).fill({ burst: true, truth: 1 }),
        ...Array(2).fill({ burst: false, truth: 1 }),
        ...Array(9).fill({ burst: false, truth: 0 }),
      ])
    );
    expect(not.proven).toBe(false);
  });

  it("does not call a measure proven that was only ever tried on one answer", () => {
    const scroll = (n: number) =>
      walk(n, [ev(0, "report_viewed"), ev(1, "scroll_depth_100", { pathname: "/report/x" })], {
        "Scroll behavior": 100,
      });
    const p = prove(
      def("Scroll behavior"),
      Array.from({ length: 12 }, (_, i) => scroll(i))
    );
    expect(p.proven).toBe(false);
    expect(p.variety).toBe(1);
  });

  it("counts only walks that know the truth of that signal", () => {
    const p = prove(def("Backtracking"), [walk(0, [], { "Scroll behavior": 0 })]);
    expect(p.cases).toBe(0);
  });

  it("judges the measure as it is now, on the walks' own events", () => {
    const moves = [1, 2, 3, 3, 4].map((i, k) => ev(k, "survey_progress", { question_index: i }));
    const records = [
      ...Array.from({ length: 5 }, (_, i) => walk(i, moves, { Backtracking: 1 })),
      ...Array.from({ length: 6 }, (_, i) =>
        walk(10 + i, [ev(0, "survey_progress", { question_index: 1 })], { Backtracking: 0 })
      ),
    ];
    expect(prove(def("Backtracking"), records).proven).toBe(true);
  });

  it("proves nothing for every signal with no walks, and says why for each", () => {
    const all = proveAll([]);
    expect(all).toHaveLength(22);
    for (const p of all) {
      expect(p.proven).toBe(false);
      expect(p.why).toBeTruthy();
    }
  });
});
