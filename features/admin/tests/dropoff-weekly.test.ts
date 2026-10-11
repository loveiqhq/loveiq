import { describe, expect, it } from "vitest";

import {
  askedQuestions,
  buildDropoffWeeklyPayload,
  DROPOFF_FLOOR,
  dropoffWeeks,
  shortDate,
  type QuestionEnds,
} from "@features/admin/server/dropoff-weekly";
import { HIDDEN_QIDS } from "@features/survey/questionFlags";
import { orderAskedQuestions } from "@features/survey/ui/questionOrder";
import { surveyQuestions } from "@/data/survey-data";

const iso = (d: Date) => d.toISOString();

describe("dropoffWeeks", () => {
  it("on a Sunday: the complete weeks since 21 Sep, then this week through yesterday", () => {
    const w = dropoffWeeks(new Date("2026-10-11T10:00:00Z"));
    expect(w.map((x) => x.label)).toEqual(["21 Sep", "28 Sep", "5 Oct"]);
    expect(w.map((x) => x.partial)).toEqual([false, false, true]);
    // Berlin midnights (CEST, UTC+2), not UTC ones.
    expect(iso(w[0]!.since)).toBe("2026-09-20T22:00:00.000Z");
    expect(iso(w[1]!.until)).toBe("2026-10-04T22:00:00.000Z");
    // Through Saturday: someone mid-survey right now must not count as a quit.
    expect(iso(w[2]!.until)).toBe("2026-10-10T22:00:00.000Z");
  });

  it("on a Monday the week in progress has no full day yet, so it is left out", () => {
    const w = dropoffWeeks(new Date("2026-10-12T06:00:00Z"));
    expect(w.map((x) => x.label)).toEqual(["21 Sep", "28 Sep", "5 Oct"]);
    expect(w.some((x) => x.partial)).toBe(false);
  });

  it("keeps eight complete weeks and follows Berlin onto winter time", () => {
    const w = dropoffWeeks(new Date("2026-12-20T12:00:00Z"));
    const full = w.filter((x) => !x.partial);
    expect(full).toHaveLength(8);
    expect(full[0]!.label).toBe("19 Oct");
    expect(iso(full.at(-1)!.since)).toBe("2026-12-06T23:00:00.000Z"); // CET, UTC+1
    expect(w.at(-1)!.partial).toBe(true);
  });

  it("names a week by its Monday the same way on every ICU build", () => {
    expect(shortDate("2026-09-21")).toBe("21 Sep");
  });
});

describe("askedQuestions", () => {
  it("numbers today's asked questions in order and leaves the hidden ones out", () => {
    const asked = orderAskedQuestions(surveyQuestions, "control").filter(
      (q) => !HIDDEN_QIDS.has(q.qId)
    );
    const qs = askedQuestions(46);
    expect(qs.map((q) => q.qId)).toEqual(asked.map((q) => q.qId));
    expect(qs.map((q) => q.n)).toEqual(asked.map((_, i) => i + 1));
    expect(qs.every((q) => q.name.length <= 46)).toBe(true);
    expect(qs.find((q) => q.qId === "00000")?.name).toMatch(/email/i);
  });
});

describe("buildDropoffWeeklyPayload", () => {
  const weeks = dropoffWeeks(new Date("2026-10-12T06:00:00Z"));
  const asked = orderAskedQuestions(surveyQuestions, "control").filter(
    (q) => !HIDDEN_QIDS.has(q.qId)
  );
  const rowOf = (p: ReturnType<typeof buildDropoffWeeklyPayload>, qId: string) =>
    p.rows[asked.findIndex((q) => q.qId === qId)]!;

  it("gives every asked question one row, numbered in today's order, hidden ones left out", () => {
    const p = buildDropoffWeeklyPayload(weeks, [new Map(), new Map(), new Map()], "12 Oct");
    expect(p.rows).toHaveLength(asked.length);
    expect(p.rows.map((r) => r.n)).toEqual(asked.map((_, i) => i + 1));
    expect(asked.some((q) => HIDDEN_QIDS.has(q.qId))).toBe(false);
    expect(p.weeks).toEqual(["21 Sep", "28 Sep", "5 Oct"]);
    expect(p.partialLast).toBe(false);
    expect(p.updated).toBe("12 Oct");
  });

  it("is quits over people who reached it, one decimal, blank under the floor", () => {
    const ends: QuestionEnds[] = [
      new Map([
        ["00001", { sessions: 300, quits: 14 }],
        ["00000", { sessions: DROPOFF_FLOOR - 1, quits: 5 }],
      ]),
      new Map([["00000", { sessions: 160, quits: 25 }]]),
      new Map(),
    ];
    const p = buildDropoffWeeklyPayload(weeks, ends, "12 Oct");
    expect(rowOf(p, "00001").r[0]).toBe(4.7);
    expect(rowOf(p, "00000").r).toEqual([null, 15.6, null]);
    expect(rowOf(p, "00000").q).toMatch(/email/i);
  });
});
