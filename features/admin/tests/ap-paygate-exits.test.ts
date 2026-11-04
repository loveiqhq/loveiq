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
  buildPaygateExits,
  EXITS_FROM,
  readGateSeen,
  readPaygateExitRows,
  type ExitEventRow,
} from "@features/admin/server/ap/paygate-exits";
import { FIELDS } from "@features/admin/ui/ap/fields";

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

const build = (
  subs: SubFact[],
  rows: ExitEventRow[] | null,
  blocked: string | null = null,
  gateSeen: ReadonlySet<number> | null = null
) => buildPaygateExits({ subs, rows, gateSeen, blocked, to: "2026-10-31" });

describe("AP Payment · Paygate exits", () => {
  it("says why it is blank: a filter, a range before the pages, a failed read", () => {
    expect(build([], [], "The filters hide the people.")).toEqual({
      why: "The filters hide the people.",
      pages: [],
    });
    expect(
      buildPaygateExits({ subs: [], rows: [], gateSeen: null, blocked: null, to: "2026-10-27" }).why
    ).toMatch(/from 28 Oct 2026/);
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

  it("tells the ways out apart, the browser's own Back included", () => {
    const out = build(
      [sub(1), sub(2), sub(3), sub(4)],
      [
        row(1, "paygate_exit_viewed", 0, { stage: "pre" }),
        row(1, "paygate_exit_leave", 1, { stage: "pre", via: "maybe_later" }),
        row(2, "paygate_exit_viewed", 0, { stage: "pre" }),
        row(2, "paygate_exit_leave", 1, { stage: "pre", via: "back" }),
        row(3, "paygate_exit_viewed", 0, { stage: "full" }),
        row(3, "paygate_exit_leave", 1, { stage: "full", via: "chapters" }),
        row(4, "paygate_exit_viewed", 0, { stage: "pre" }),
        row(4, "paygate_exit_leave", 1, { stage: "pre", via: "browser_back" }),
      ]
    );
    expect(out.pages[0]!.left).toEqual({ maybeLater: 1, back: 1, chapters: 0, browserBack: 1 });
    expect(out.pages[1]!.left).toEqual({ maybeLater: 0, back: 0, chapters: 1, browserBack: 0 });
  });

  // As the SQL beside the section counts them: every step is of the readers who reached the
  // page, so none can read more than 100% of "Reached" when a view is not stored.
  it("counts every step only for readers who reached the page", () => {
    const out = build(
      [sub(1), sub(2)],
      [
        row(1, "paygate_exit_viewed", 0, { stage: "pre" }),
        row(1, "paygate_exit_reason", 1, { stage: "pre", reason: "later" }),
        row(2, "paygate_exit_reason", 1, { stage: "pre", reason: "see_first" }),
        row(2, "paygate_exit_note", 2, { stage: "pre", note: "no view stored" }),
        row(2, "initial_gate_cta_click", 3, { place: "exit_card" }),
        row(2, "paygate_exit_leave", 4, { stage: "pre", via: "maybe_later" }),
      ]
    );
    const pre = out.pages[0]!;
    expect(pre).toMatchObject({ reached: 1, answered: 1, wrote: 0 });
    expect(pre.pressed.any).toBe(0);
    expect(pre.left.maybeLater).toBe(0);
    expect(pre.words).toEqual([]);
  });

  // Beacons arrive in no fixed order: on staging (03.11) a reason was stored a moment before
  // the view it followed. The reader reached the page; their answer counts.
  it("counts a reader's steps whatever order their events were stored in", () => {
    const out = build(
      [sub(1)],
      [
        row(1, "paygate_exit_reason", 0, { stage: "pre", reason: "later" }),
        row(1, "paygate_exit_viewed", 1, { stage: "pre" }),
        row(1, "paygate_exit_leave", 2, { stage: "pre", via: "browser_back" }),
      ]
    );
    expect(out.pages[0]).toMatchObject({ reached: 1, answered: 1 });
    expect(out.pages[0]!.left.browserBack).toBe(1);
  });

  it("leaves out readers the page's people do not include (the team, our tests, the filters)", () => {
    const out = build([sub(1)], [row(9, "paygate_exit_viewed", 0, { stage: "pre" })]);
    expect(out.pages[0]!.reached).toBe(0);
  });

  it("shows the ten newest sentences, newest first", () => {
    const rows = [
      row(1, "paygate_exit_viewed", 0, { stage: "full" }),
      ...Array.from({ length: 12 }, (_, i) =>
        row(1, "paygate_exit_note", i + 1, { stage: "full", note: `note ${i}` })
      ),
    ];
    const words = build([sub(1)], rows).pages[1]!.words;
    expect(words).toHaveLength(10);
    expect(words[0]!.text).toBe("note 11");
    expect(words.at(-1)!.text).toBe("note 2");
  });

  // The card "count every way out": since #700 the €1.99 page's own Back opens its exit page too.
  it("tells how readers reached the €1.99 page's exit page, of those who saw the €1.99 page", () => {
    const pre = { stage: "pre" };
    const out = build(
      [1, 2, 3, 4, 5, 6, 7].map((id) => sub(id)),
      [
        // 1 by "Not ready", 2 by the browser's Back, 3 both ways (on two page loads).
        row(1, "initial_gate_back", 0),
        row(1, "paygate_exit_viewed", 0, pre),
        row(2, "initial_gate_browser_back", 0),
        row(2, "paygate_exit_viewed", 0, pre),
        row(3, "initial_gate_back", 0),
        row(3, "paygate_exit_viewed", 0, pre),
        row(3, "initial_gate_browser_back", 9),
        row(3, "paygate_exit_viewed", 9, pre),
        // 4 pressed Back but no view of the page was stored: not among those who reached it.
        row(4, "initial_gate_browser_back", 0),
        // 5 reached it with neither stored (a Forward, a reload).
        row(5, "paygate_exit_viewed", 0, pre),
        // 6 reached only the full report's page.
        row(6, "paygate_exit_viewed", 0, { stage: "full" }),
        // Not the page's people.
        row(99, "initial_gate_back", 0),
        row(99, "paygate_exit_viewed", 0, pre),
      ],
      null,
      // Saw the €1.99 page: 1–5 and 7 of the page's people; 99 is not one of them.
      new Set([1, 2, 3, 4, 5, 7, 99])
    );
    const [preRow, fullRow] = out.pages;
    // The page's own figures are as before.
    expect(preRow).toMatchObject({ reached: 4, views: 5 });
    expect(preRow!.came).toEqual({ notReady: 2, browserBack: 2, sawGate: 6 });
    expect(fullRow!.came).toBeNull();
  });

  it("keeps how readers came, without what it is a share of, when the viewers can't be read", () => {
    const out = build(
      [sub(1)],
      [row(1, "initial_gate_back", 0), row(1, "paygate_exit_viewed", 1, { stage: "pre" })]
    );
    expect(out.pages[0]!.came).toEqual({ notReady: 1, browserBack: 0, sawGate: null });
    expect(build([sub(1)], [], null, new Set()).pages[0]!.came).toEqual({
      notReady: 0,
      browserBack: 0,
      sawGate: 0,
    });
  });
});

describe("AP Payment · Paygate exits: the reads", () => {
  // A block: a function beforeEach returns is run as its teardown, and mockReset returns the mock.
  beforeEach(() => {
    mockFetchAllRows.mockReset();
  });
  const paths = () => mockFetchAllRows.mock.calls.map(([p]) => String(p));

  it("reads what opened the gate's exit page, only where it led there, and refuses a part read", async () => {
    mockFetchAllRows.mockImplementation(async (path: string) =>
      path.includes("initial_gate_browser_back")
        ? [{ survey_submission_id: 1, event_type: "initial_gate_browser_back" }]
        : []
    );
    const rows = await readPaygateExitRows("2026-11-01");
    expect(rows).toEqual([{ survey_submission_id: 1, event_type: "initial_gate_browser_back" }]);
    const ways = paths().find((p) => p.includes("initial_gate_browser_back"))!;
    expect(ways).toContain("event_type=in.(initial_gate_back,initial_gate_browser_back)");
    // "Not ready" led to the landing page before the exit page: no way in.
    expect(ways).toContain("&metadata->>to=eq.exit_page&");
    // From the range's first Berlin day (or the pages' own).
    expect(ways).toContain(`event_time=gte.${encodeURIComponent("2026-10-31T23:00:00.000Z")}`);

    mockFetchAllRows.mockImplementation(async (path: string) =>
      path.includes("initial_gate_browser_back") ? null : []
    );
    expect(await readPaygateExitRows("2026-11-01")).toBeNull();
  });

  it("reads who saw the €1.99 page from the range's first day, null when it can't", async () => {
    mockFetchAllRows.mockResolvedValueOnce([
      { survey_submission_id: 4 },
      { survey_submission_id: 7 },
    ]);
    expect(await readGateSeen("2026-10-20")).toEqual(new Set([4, 7]));
    expect(paths()[0]).toBe(
      "/rest/v1/personal_report?initial_gate_seen_at=gte." +
        encodeURIComponent("2026-10-19T22:00:00.000Z") +
        "&select=survey_submission_id&order=id.asc"
    );
    mockFetchAllRows.mockResolvedValueOnce(null);
    expect(await readGateSeen("2026-10-20")).toBeNull();
  });

  // As on every AP number: its info card's query counts it as the page does.
  it("shows the queries behind the new counts", () => {
    const came = FIELDS["payment.exit-came"]!.query.text;
    expect(came).toContain("a.event_type in ('initial_gate_back', 'initial_gate_browser_back')");
    expect(came).toContain("and a.metadata->>'to' = 'exit_page'");
    expect(came).toContain("where pr.initial_gate_seen_at is not null");
    expect(came).toContain("not exists (select 1 from ap_team_user t where t.id = s.user_id)");
    expect(FIELDS["pts.step-gate"]!.query.text).toContain(
      "AND a.event_type = 'initial_gate_browser_back')) AS pressed_browser_back"
    );
  });
});
