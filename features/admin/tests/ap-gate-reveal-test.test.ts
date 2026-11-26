import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchAllRows = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(),
  fetchAllRows: (...args: unknown[]) => mockFetchAllRows(...args),
  countRows: vi.fn(),
  POSTGREST_MAX_ROWS: 1000,
}));

import type { SubFact } from "@features/admin/server/ap/facts";
import {
  buildGateTest,
  gateArmOf,
  GATE_TEST_NAME,
  readGateTestRows,
  type GateTestBlock,
  type GateTestRow,
} from "@features/admin/server/ap/gate-reveal-test";
import { FIELDS } from "@features/admin/ui/ap/fields";
import {
  assignGateRevealArm,
  GATE_REVEAL_START_AT,
  type GateRevealArm,
} from "@shared/experiments/gateRevealArm";

import { sub } from "./ap-fixtures";

const START = Date.parse(GATE_REVEAL_START_AT);
const DAY = "2026-11-17";
const TODAY = "2026-11-18";
const at = (ms: number) => new Date(ms).toISOString();

/** The nth session id the report's server deals `arm` (each drawn once, then kept). */
const pool: Record<GateRevealArm, string[]> = { control: [], reveal: [] };
let drawn = 0;
function sessionIn(arm: GateRevealArm, nth = 0): string {
  while (pool[arm].length <= nth) {
    const id = `00000000-0000-4000-8000-${String(drawn++).padStart(12, "0")}`;
    pool[assignGateRevealArm(id)].push(id);
  }
  return pool[arm][nth]!;
}

const EUR_199: [number, number, string] = [Math.floor(START / 1000) + 3600, 1.99, "initial"];

/** A finisher a minute per id after the switch-on, as the page's facts hold them. */
const finisher = (id: number, over: Partial<SubFact> = {}) =>
  sub({ id, day: DAY, at: at(START + id * 60_000), ...over });

/** The survey as the session read returns it, stamped with `arm` unless told otherwise. */
const row = (
  id: number,
  arm: GateRevealArm | null,
  over: Partial<GateTestRow> = {}
): GateTestRow => ({
  id,
  session_id: sessionIn(arm ?? "control", id),
  utm_tracker: JSON.stringify(arm ? { utm_source: "google", gate_reveal_arm: arm } : {}),
  ...over,
});

const build = (
  subs: SubFact[],
  rows: GateTestRow[] | null,
  over: Partial<Parameters<typeof buildGateTest>[0]> = {}
) =>
  buildGateTest({
    subs,
    rows,
    gateSeen: new Set<number>(),
    blocked: null,
    from: DAY,
    to: DAY,
    today: TODAY,
    ...over,
  });

const half = (b: GateTestBlock, arm: GateRevealArm) => b.arms.find((a) => a.arm === arm)!;

/** `n` finishers in `arm` from id `from`, the first `paid` of them having paid the EUR 1.99. */
function cohort(arm: GateRevealArm, from: number, n: number, paid: number) {
  const ids = Array.from({ length: n }, (_, i) => from + i);
  return {
    subs: ids.map((id, i) => finisher(id, i < paid ? { pays: [EUR_199] } : {})),
    rows: ids.map((id) => row(id, arm)),
  };
}

/** Two halves, today's page first. */
function test2(c: [n: number, paid: number], r: [n: number, paid: number]) {
  const a = cohort("control", 1, ...c);
  const b = cohort("reveal", 10_001, ...r);
  return build([...a.subs, ...b.subs], [...a.rows, ...b.rows]);
}

beforeEach(() => mockFetchAllRows.mockReset());

describe("AP Payment · #11, the €1.99 page test", () => {
  // 24 Nov 2026: the price test that replaced #11 stamps its own halves under the same key.
  // Its finishers are in neither of #11's halves, whatever their session's hash would say.
  it("leaves the price test's finishers out of both halves", () => {
    const subs = [finisher(1), finisher(2), finisher(3)];
    const rows = [
      row(1, "control"),
      { ...row(2, "reveal"), utm_tracker: JSON.stringify({ gate_reveal_arm: "choose" }) },
      { ...row(3, "control"), utm_tracker: JSON.stringify({ gate_reveal_arm: "fixed" }) },
    ];
    const b = build(subs, rows);
    expect(half(b, "control").finishers).toBe(1);
    expect(half(b, "reveal").finishers).toBe(0);
  });

  it("counts from the switch-on: a survey finished a second before it is left out", () => {
    const subs = [
      finisher(1, { at: at(START - 1000) }),
      finisher(2, { at: GATE_REVEAL_START_AT }),
      finisher(3),
    ];
    const b = build(subs, [row(1, "control"), row(2, "control"), row(3, "control")]);
    expect(half(b, "control").finishers).toBe(2);
    expect(GATE_REVEAL_START_AT).toBe("2026-11-17T09:01:50Z");
  });

  it("leaves out a survey bought before it was taken: by its claimed purchase, or the journey's label", () => {
    const subs = [finisher(1, { pts: true }), finisher(2), finisher(3)];
    const rows = [
      row(1, "reveal"),
      row(2, "reveal", {
        utm_tracker: JSON.stringify({ journey: "pay_to_start", utm_source: "google" }),
      }),
      row(3, "reveal"),
    ];
    expect(half(build(subs, rows), "reveal").finishers).toBe(1);
  });

  it("counts only the page's finishers: a team survey in the session read, left out of the facts, is not counted", () => {
    // ap_facts leaves the team out (ap_team_user), so its surveys never reach `subs`; the session
    // read is of every finished survey, the team's too.
    const b = build([finisher(1)], [row(1, "control"), row(99, "control"), row(98, "reveal")]);
    expect(b.arms.map((a) => a.finishers)).toEqual([1, 0]);
  });

  it("a survey without the stamp takes the half its session gives, as the report's server does", () => {
    const reveal = sessionIn("reveal", 3);
    const rows = [
      // No tracker at all, and a tracker without the key: the session decides.
      row(1, null, { session_id: reveal, utm_tracker: null }),
      row(2, null, { session_id: sessionIn("reveal", 4), utm_tracker: '{"utm_source":"x"}' }),
      // A tracker that isn't JSON: the session decides.
      row(3, null, { session_id: sessionIn("reveal", 5), utm_tracker: "not json" }),
      // No session id: today's page, as the report's server serves it.
      row(4, null, { session_id: null, utm_tracker: null }),
      row(5, "control"),
    ];
    const b = build(
      [1, 2, 3, 4, 5].map((id) => finisher(id)),
      rows
    );
    expect(half(b, "reveal").finishers).toBe(3);
    expect(half(b, "control").finishers).toBe(2);
    // The stamp is read first; the two agree on production by construction.
    expect(
      gateArmOf({ session_id: sessionIn("control"), utm_tracker: '{"gate_reveal_arm":"reveal"}' })
    ).toBe("reveal");
    expect(gateArmOf({ session_id: reveal, utm_tracker: '{"gate_reveal_arm":"bogus"}' })).toBe(
      "reveal"
    );
  });

  it("is too early to compare while a half has under 30 finishers, whatever the z-test says", () => {
    // 10 of 200 against 8 of 25: the z-test alone would call the new page well ahead.
    const b = test2([200, 10], [25, 8]);
    expect(b.verdict).toBe(
      "Too early to compare: New page: Core Archetype shown has only 25 finishers so far. Ignore the difference until that grows."
    );
    expect(b).toMatchObject({ lift: null, confidence: null, liftWhy: "Too early to compare" });
  });

  it("counts reached, paid, paid among those who reached, and full unlocks per half", () => {
    const subs = [
      finisher(1, { pays: [EUR_199] }),
      // E07's gift is a EUR 0 Initial row: no payment.
      finisher(2, { pays: [[EUR_199[0], 0, "initial"]] }),
      // A full unlock alone is no EUR 1.99, but it is a full report bought.
      finisher(3, { pays: [[EUR_199[0], 29.99, "full_report"]], full: true }),
      finisher(4, { pays: [EUR_199, [EUR_199[0] + 60, 19.99, "full_report"]], full: true }),
      finisher(5),
    ];
    const rows = [1, 2, 3, 4, 5].map((id) => row(id, "reveal"));
    const b = build(subs, rows, { gateSeen: new Set([1, 2, 3, 5, 77]) });
    expect(half(b, "reveal")).toEqual({
      arm: "reveal",
      name: "New page: Core Archetype shown",
      control: false,
      finishers: 5,
      reached: 4,
      paid: 2,
      paidReached: 1,
      full: 2,
    });
    expect(half(b, "control")).toMatchObject({ name: "Today's €1.99 page", control: true });
    // Who saw the page unread: those two blank, never 0.
    expect(half(build(subs, rows, { gateSeen: null }), "reveal")).toMatchObject({
      reached: null,
      paidReached: null,
      paid: 2,
    });
  });

  it("words the readout as the shared readouts do, and calls a winner only when the test supports it", () => {
    expect(test2([0, 0], [0, 0]).verdict).toBe("No data yet.");
    expect(test2([3, 1], [0, 0]).verdict).toBe(
      "Only Today's €1.99 page has data, so there is nothing to compare against."
    );
    expect(test2([20, 2], [24, 5]).verdict).toBe(
      "Not enough data to call this yet: the smallest group has 20 finishers. Treat any difference as noise for now."
    );
    const few = test2([60, 3], [62, 4]);
    expect(few.verdict).toBe(
      "Not enough €1.99 payments yet to compare: 7 finishers have paid across both groups. Each side needs at least 5."
    );
    expect(few).toMatchObject({
      lift: null,
      confidence: null,
      liftWhy: "Too few payments to call",
    });

    const close = test2([100, 10], [100, 13]);
    expect(close.verdict).toBe(
      "No clear winner yet. New page: Core Archetype shown is ahead (13.0% vs 10.0%) but the gap could still be chance."
    );
    expect(close.lift).toBeCloseTo(0.3, 10);
    expect(close.confidence).toBeLessThan(0.95);
    expect(close.liftWhy).toBeNull();
    expect(test2([100, 10], [100, 10]).verdict).toBe("No clear winner yet: both are at 10.0%.");

    const clear = test2([200, 10], [200, 40]);
    expect(clear.verdict).toMatch(
      /^New page: Core Archetype shown is genuinely ahead: 20\.0% vs 5\.0% \(\+15pp · 95% CI \+[\d.]+ to \+[\d.]+pp\)\.$/
    );
    expect(clear.lift).toBeCloseTo(3, 10);
    expect(clear.confidence).toBeGreaterThanOrEqual(0.95);
    // Today's page can win too, and is named when it does.
    expect(test2([200, 40], [200, 10]).verdict).toMatch(/^Today's €1\.99 page is genuinely ahead/);
    expect(test2([200, 40], [200, 10]).lift).toBeCloseTo(-0.75, 10);
  });

  it("says why it is blank: a filter, a range before the test, a failed read", () => {
    const blank = (b: GateTestBlock) => ({ arms: b.arms, why: b.why, verdict: b.verdict });
    expect(blank(build([], [], { blocked: "The filters hide the people." }))).toEqual({
      arms: [],
      why: "The filters hide the people.",
      verdict: "",
    });
    const before = build([], null, { from: "2026-10-18", to: "2026-11-16" });
    expect(before.why).toBe(
      "Not running in this range: the test began on 17 Nov 2026 at 10:01. Pick a range that reaches it."
    );
    expect(before.note).toBe("Since 17 Nov 2026 · live · not in this range");
    expect(build([], null).why).toBe("Who is in which half could not be read just now.");
  });

  it("names the test and its days as the page writes a live test, cut where the range cuts it", () => {
    const b = build([], []);
    expect(b).toMatchObject({ test: GATE_TEST_NAME, note: "Since 17 Nov 2026 · live", why: null });
    expect(GATE_TEST_NAME).toBe("#11 · New €1.99 page");
    // Starting after the switch-on, or ending before yesterday, the last whole day.
    expect(build([], [], { from: "2026-11-18", to: "2026-11-24", today: "2026-11-25" }).note).toBe(
      "Since 17 Nov 2026 · live · cut to this range"
    );
    expect(build([], [], { from: DAY, to: "2026-11-20", today: "2026-11-25" }).note).toBe(
      "Since 17 Nov 2026 · live · cut to this range"
    );
    expect(build([], [], { from: "2026-10-27", to: "2026-11-24", today: "2026-11-25" }).note).toBe(
      "Since 17 Nov 2026 · live"
    );
    // Only a range starting after the switch-on makes its figures the range's, not the test's.
    expect(
      build([], [], { from: "2026-11-18", to: "2026-11-24", today: "2026-11-25" }).startsLater
    ).toBe(true);
    expect(build([], [], { from: DAY, to: "2026-11-20", today: "2026-11-25" }).startsLater).toBe(
      false
    );
    expect(
      build([], [], { from: "2026-10-27", to: "2026-11-24", today: "2026-11-25" }).startsLater
    ).toBe(false);
  });

  it("writes no long dash in anything it shows", () => {
    const shown = [
      test2([0, 0], [0, 0]),
      test2([3, 1], [0, 0]),
      test2([20, 2], [24, 5]),
      test2([200, 10], [25, 8]),
      test2([60, 3], [62, 4]),
      test2([100, 10], [100, 13]),
      test2([200, 10], [200, 40]),
      build([], null, { from: "2026-10-18", to: "2026-11-16" }),
    ].flatMap((b) => [
      b.test,
      b.note,
      b.verdict,
      b.why ?? "",
      b.liftWhy ?? "",
      ...b.arms.map((a) => a.name),
    ]);
    for (const s of shown) expect(s).not.toMatch(/[—–]/);
    for (const [k, f] of Object.entries(FIELDS).filter(([k]) => k.startsWith("payment.gt-")))
      expect([f.label, f.what, f.caveat ?? ""].join(" "), k).not.toMatch(/[—–]/);
  });

  it("reads the surveys from the switch-on, or the range's first day when later; null when it can't", async () => {
    mockFetchAllRows.mockResolvedValue([row(1, "reveal")]);
    expect(await readGateTestRows("2026-10-20")).toEqual([row(1, "reveal")]);
    expect(await readGateTestRows("2026-11-20")).toEqual([row(1, "reveal")]);
    expect(mockFetchAllRows.mock.calls.map(([p]) => p)).toEqual([
      "/rest/v1/survey_submission?status=eq.completed&created_date_time=gte." +
        encodeURIComponent("2026-11-17T09:01:50.000Z") +
        "&select=id,session_id,utm_tracker&order=id.asc",
      "/rest/v1/survey_submission?status=eq.completed&created_date_time=gte." +
        encodeURIComponent("2026-11-19T23:00:00.000Z") +
        "&select=id,session_id,utm_tracker&order=id.asc",
    ]);
    mockFetchAllRows.mockResolvedValueOnce(null);
    expect(await readGateTestRows("2026-11-17")).toBeNull();
  });

  // As on every AP number: its info card's query counts it as the page does.
  it("shows the query behind each figure, the team and pay to start left out", () => {
    const keys = [
      "payment.gt-arm",
      "payment.gt-finishers",
      "payment.gt-reached",
      "payment.gt-paid",
      "payment.gt-rate",
      "payment.gt-rate-reached",
      "payment.gt-full",
      "payment.gt-lift",
    ];
    for (const k of keys) expect(FIELDS[k]?.query.lang, k).toBe("SQL");
    const q = FIELDS["payment.gt-rate"]!.query.text;
    expect(new Set(keys.map((k) => FIELDS[k]!.query.text)).size).toBe(1);
    expect(q).toContain("timestamptz '2026-11-17 09:01:50+00'");
    expect(q).toContain("and not exists (select 1 from ap_team_user t where t.id = s.user_id)");
    expect(q).toContain("pa.consumed_submission_id = s.id and pa.offer is not null");
    expect(q).toContain("coalesce(j->>'journey', '') <> 'pay_to_start'");
    expect(q).toContain("'gate_reveal_2026_11:' || session_id::text");
    expect(q).toContain("pr.initial_gate_seen_at is not null");
    expect(q).toContain("p.metadata->>'plan' = 'initial'");
  });
});
