import { describe, expect, it } from "vitest";
import type { SubFact } from "@features/admin/server/ap/facts";
import {
  buildPaygateExits,
  EXITS_FROM,
  type ExitEventRow,
} from "@features/admin/server/ap/paygate-exits";

const T0 = "2026-10-28T12:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();
const epoch = (iso: string) => Math.floor(Date.parse(iso) / 1000);

/** The builder reads a fact's id and its sales; nothing else. */
const sub = (id: number, pays: Array<[number, number, string | null]> = []) =>
  ({ id, pays }) as unknown as SubFact;

const row = (
  sid: number,
  event_type: string,
  minutes: number,
  extra: Partial<ExitEventRow> = {}
): ExitEventRow => ({
  survey_submission_id: sid,
  event_type,
  event_time: at(minutes),
  stage: null,
  reason: null,
  place: null,
  via: null,
  note: null,
  ...extra,
});

const build = (subs: SubFact[], rows: ExitEventRow[] | null, blocked: string | null = null) =>
  buildPaygateExits({ subs, rows, blocked, to: "2026-10-31" });

describe("AP Payment · Paygate exits", () => {
  it("says why it is blank: a filter, a range before the pages, a failed read", () => {
    expect(build([], [], "The filters hide the people.")).toEqual({
      why: "The filters hide the people.",
      pages: [],
    });
    expect(buildPaygateExits({ subs: [], rows: [], blocked: null, to: "2026-10-27" }).why).toMatch(
      /from 28 Oct 2026/
    );
    expect(build([], null).why).toMatch(/could not be read/);
    expect(EXITS_FROM).toBe("2026-10-28");
  });

  it("counts each reader once a page, with every view under it", () => {
    const out = build(
      [sub(1), sub(2)],
      [
        row(1, "paygate_exit_viewed", 0, { stage: "pre" }),
        row(1, "paygate_exit_viewed", 5, { stage: "pre" }),
        row(2, "paygate_exit_viewed", 1, { stage: "pre" }),
        row(2, "paygate_exit_viewed", 2, { stage: "full" }),
      ]
    );
    const [pre, full] = out.pages;
    expect(out.why).toBeNull();
    expect(pre).toMatchObject({ stage: "pre", reached: 2, views: 3 });
    expect(full).toMatchObject({ stage: "full", reached: 1, views: 1 });
  });

  it("ranks each reader's latest reason, as shares of those who answered", () => {
    const out = build(
      [sub(1), sub(2), sub(3)],
      [
        row(1, "paygate_exit_viewed", 0, { stage: "pre" }),
        row(1, "paygate_exit_reason", 1, { stage: "pre", reason: "later" }),
        row(1, "paygate_exit_reason", 2, { stage: "pre", reason: "see_first" }),
        row(2, "paygate_exit_viewed", 0, { stage: "pre" }),
        row(2, "paygate_exit_reason", 1, { stage: "pre", reason: "see_first" }),
        row(3, "paygate_exit_viewed", 0, { stage: "pre" }),
        row(3, "paygate_exit_reason", 1, { stage: "pre", reason: "other" }),
        row(3, "paygate_exit_note", 2, { stage: "pre", note: "Write to ana@example.com please" }),
      ]
    );
    const pre = out.pages[0]!;
    expect(pre.answered).toBe(3);
    expect(pre.wrote).toBe(1);
    expect(pre.reasons.map((r) => [r.code, r.n])).toEqual([
      ["see_first", 2],
      ["other", 1],
    ]);
    expect(pre.reasons[0]!.share).toBeCloseTo(2 / 3);
    expect(pre.reasons[0]!.label).toBe("I want to see some of it before I pay");
    expect(pre.words).toHaveLength(1);
    expect(pre.words[0]!.reason).toBe("other");
    expect(pre.words[0]!.text).not.toContain("ana@example.com");
  });

  it("counts Unlock presses by place: the gate's on its exit page, and the full page's own", () => {
    const out = build(
      [sub(1), sub(2)],
      [
        row(1, "paygate_exit_viewed", 0, { stage: "pre" }),
        row(1, "initial_gate_cta_click", 1, { place: "exit_card" }),
        row(1, "initial_gate_cta_click", 2, { place: "exit_sticky" }),
        row(2, "paygate_exit_viewed", 0, { stage: "full" }),
        row(2, "paygate_exit_cta_click", 1, { stage: "full", place: "sticky" }),
      ]
    );
    expect(out.pages[0]!.pressed).toEqual({ card: 1, sticky: 1, any: 1 });
    expect(out.pages[1]!.pressed).toEqual({ card: 0, sticky: 1, any: 1 });
  });

  it("counts a real sale of the page's plan within 24 hours of the first view, and no other", () => {
    const view = at(0);
    const out = build(
      [
        sub(1, [[epoch(at(60)), 1.99, "initial"]]),
        sub(2, [[epoch(at(25 * 60)), 1.99, "initial"]]),
        sub(3, [[epoch(at(30)), 0, "initial"]]),
        sub(4, [[epoch(at(30)), 19.99, "full_report"]]),
        sub(5, [[epoch(at(-10)), 1.99, "initial"]]),
      ],
      [1, 2, 3, 4, 5].map((sid) => row(sid, "paygate_exit_viewed", 0, { stage: "pre" }))
    );
    expect(view).toBe(T0);
    // 1 paid an hour later; 2 a day and an hour later; 3 was given it; 4 bought another plan;
    // 5 paid before ever seeing the page.
    expect(out.pages[0]!.paidAfter).toBe(1);
  });

  it("counts a full unlock after the full report's page", () => {
    const out = build(
      [sub(1, [[epoch(at(90)), 19.99, "full_report"]])],
      [row(1, "paygate_exit_viewed", 0, { stage: "full" })]
    );
    expect(out.pages[1]!.paidAfter).toBe(1);
    expect(out.pages[0]!.paidAfter).toBe(0);
  });

  it("tells the ways out apart", () => {
    const out = build(
      [sub(1), sub(2), sub(3)],
      [
        row(1, "paygate_exit_leave", 1, { stage: "pre", via: "maybe_later" }),
        row(2, "paygate_exit_leave", 1, { stage: "pre", via: "back" }),
        row(3, "paygate_exit_leave", 1, { stage: "full", via: "chapters" }),
      ]
    );
    expect(out.pages[0]!.left).toEqual({ maybeLater: 1, back: 1, chapters: 0 });
    expect(out.pages[1]!.left).toEqual({ maybeLater: 0, back: 0, chapters: 1 });
  });

  it("leaves out readers the page's people do not include (the team, our tests, the filters)", () => {
    const out = build([sub(1)], [row(9, "paygate_exit_viewed", 0, { stage: "pre" })]);
    expect(out.pages[0]!.reached).toBe(0);
  });

  it("shows the ten newest sentences, newest first", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row(1, "paygate_exit_note", i, { stage: "full", note: `note ${i}` })
    );
    const words = build([sub(1)], rows).pages[1]!.words;
    expect(words).toHaveLength(10);
    expect(words[0]!.text).toBe("note 11");
    expect(words.at(-1)!.text).toBe("note 2");
  });
});
