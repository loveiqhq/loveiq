// @vitest-environment jsdom
// The Report page as Marcus's design sync of 21 Oct 2026 has it: every figure with its info
// card, the wizard's rows adding up, all-time chapter votes and the design's names and notes.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  POSTGREST_MAX_ROWS: 1000,
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));
const screenData = vi.hoisted(() => ({ payload: null as unknown }));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: () => ({
    data: screenData.payload,
    loading: false,
    error: null,
    refetch: () => {},
  }),
}));
vi.mock("@features/admin/ui/ap/useApFilters", () => ({ useApFilters: () => ({ params: {} }) }));
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({ default: () => null }));

import { parseFilters } from "@features/admin/server/ap/filters";
import { clearTeamCache } from "@features/admin/server/ap/team";
import {
  buildReportPage,
  fetchVotes,
  maskContacts,
  type ReportExtras,
  type Vote,
} from "@features/admin/server/ap/report-page";
import ApReport, { wholeSplit } from "@features/admin/ui/ap/ApReport";
import { FIELDS } from "@features/admin/ui/ap/fields";

import { factsFixture, sub } from "./ap-fixtures";

const TODAY = "2026-10-13";
const now = new Date("2026-10-13T10:00:00Z");
const filters = parseFilters({ period: "custom", from: "2026-10-01", to: "2026-10-07" }, TODAY);
const extras: ReportExtras = {
  wizard: [],
  map_steppers: [],
  chapters: [],
  paywall_clicks: [],
  chapter_stats: [],
  chapter_readers: 0,
  chapter_depth: [],
  chapter_stats_from: null,
  wizard_skips: [],
  wizard_skips_from: null,
  issues: [],
  feedback: [],
  votes_total: 0,
  emails: [],
  email_events_from: null,
  email_opens_from: null,
};
const facts = factsFixture();
const page = (over: Partial<Parameters<typeof buildReportPage>[0]> = {}) =>
  buildReportPage({
    facts,
    previous: null,
    benchmark: facts,
    extras,
    returns: null,
    filters,
    today: TODAY,
    now,
    ...over,
  });
const vote = (section: string, v: "up" | "down", at: string, over: Partial<Vote> = {}): Vote => ({
  at,
  submission: 1,
  section,
  vote: v,
  issue: null,
  comment: null,
  ...over,
});

afterEach(() => {
  cleanup();
  mockSupabaseFetch.mockReset();
});

describe("a reader's comment", () => {
  it("has email addresses and phone numbers masked, and nothing else", () => {
    expect(maskContacts("write me: jo.doe@example.com, or call +49 170 1234567!")).toBe(
      "write me: [email], or call [phone]!"
    );
    expect(maskContacts("Tel 0170/123 45 67 please")).toBe("Tel [phone] please");
    expect(maskContacts("Chapter 4, 10/10, worth €9.99 in 2026")).toBe(
      "Chapter 4, 10/10, worth €9.99 in 2026"
    );
  });
});

describe("the chapter votes, all time", () => {
  it("are read whole, without a date, the team's left out and each comment masked", async () => {
    clearTeamCache();
    mockSupabaseFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 7 }] })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            created_at: "2026-10-20T09:00:00Z",
            survey_submission_id: 5,
            section_id: "core_archetype",
            feedback: "down",
            issue: "unclear",
            comment: "  mail me: jo@example.com ",
            survey_submission: { user_id: 3 },
          },
          // On a staff user's survey: left out, as ap_report_extras leaves it out.
          {
            created_at: "2026-10-19T09:00:00Z",
            survey_submission_id: 6,
            section_id: "summary",
            feedback: "up",
            issue: null,
            comment: "",
            survey_submission: { user_id: 7 },
          },
          {
            created_at: "2026-04-09T09:00:00Z",
            survey_submission_id: null,
            section_id: "the_loveiq_concept",
            feedback: "up",
            issue: null,
            comment: "   ",
            survey_submission: null,
          },
        ],
      });
    expect(await fetchVotes()).toEqual([
      {
        at: "2026-10-20T09:00:00Z",
        submission: 5,
        user: 3,
        section: "core_archetype",
        vote: "down",
        issue: "unclear",
        comment: "mail me: [email]",
      },
      {
        at: "2026-04-09T09:00:00Z",
        submission: null,
        user: null,
        section: "the_loveiq_concept",
        vote: "up",
        issue: null,
        comment: null,
      },
    ]);
    const [staff, votes] = mockSupabaseFetch.mock.calls.map((c) =>
      decodeURIComponent(String(c[0]))
    );
    // The team: ap_team_user (an @loveiq.org account or one that used the team's test code).
    expect(staff).toContain("/rest/v1/ap_team_user?");
    expect(votes).toContain("/rest/v1/report_section_feedback?");
    expect(votes).not.toMatch(/created_at=/);
  });

  it("fill the chapters' feedback and the Feedback section whatever the range", () => {
    const votes = [
      vote("core_archetype", "up", "2026-10-02T10:00:00Z"),
      vote("core_archetype", "up", "2026-09-01T10:00:00Z"),
      vote("typical_beliefs", "up", "2026-10-03T10:00:00Z"),
      vote("typical_beliefs", "down", "2026-10-04T10:00:00Z", { issue: "unclear" }),
      vote("the_loveiq_concept", "up", "2026-04-09T09:00:00Z"),
      vote("background_know_how_arousal_desire_and_pleasure", "down", "2026-08-04T10:00:00Z"),
    ];
    const p = page({ votes });
    const row = (id: string) => p.chapters.find((c) => c.id === id)!;
    expect(row("core_archetype")).toMatchObject({ up: 2, down: 0 });
    expect(row("typical_beliefs")).toMatchObject({ up: 1, down: 1 });
    // Earlier versions' chapters by their proper names, not names made from the ids.
    expect(row("the_loveiq_concept").name).toBe("The LoveIQ concept");
    expect(row("background_know_how_arousal_desire_and_pleasure").name).toBe(
      "Know-how: arousal, desire and pleasure"
    );
    expect(p.feedback).toMatchObject({ from: "2026-04-09", good: 4, bad: 2, total: 6 });
    expect(p.feedback.issues.find((i) => i.label === "Unclear")!.n).toBe(1);
    // The log, newest first, holds every vote with its chapter's id for the search.
    expect(p.feedback.log.map((r) => r.id)).toEqual([
      "typical_beliefs",
      "typical_beliefs",
      "core_archetype",
      "core_archetype",
      "background_know_how_arousal_desire_and_pleasure",
      "the_loveiq_concept",
    ]);
  });
});

describe("the intro wizard's rows", () => {
  const f = factsFixture({
    subs: [
      sub({ id: 1, wizardSlide: 5 }),
      sub({ id: 2, wizardSlide: 5, openedAt: null }),
      sub({ id: 3, wizardSlide: 2 }),
      sub({ id: 4, wizardSlide: 1, openedAt: null }),
      sub({ id: 5 }),
      sub({ id: 6, openedAt: null }),
      sub({ id: 7, wizardSlide: 3 }),
    ],
  });

  it("add up: Continue + Skip intro + Exit share out each slide's readers", () => {
    const skips = [
      { slide: 0, n: 1, sids: [5] },
      { slide: 2, n: 1, sids: [3] },
      { slide: 1, n: 1, sids: [7] },
    ];
    const p = page({
      facts: f,
      benchmark: f,
      extras: { ...extras, wizard_skips: skips, wizard_skips_from: "2026-10-01" },
    });
    for (const s of p.wizard.slides) {
      expect((s.cont ?? 0) + (s.skip ?? 0) + (s.exit ?? 0)).toBeCloseTo(1, 12);
    }
    // 5 skipped on slide 1 (of 7); 3 on slide 3 (of 4); 7 went back from slide 4 and skipped on
    // slide 2, so it counts where they stopped: slide 4 (of 3).
    expect(p.wizard.slides.map((s) => s.skip)).toEqual([1 / 7, 0, 1 / 4, 1 / 3, 0, 0]);
    // Not recorded in the range: no Skip intro, and Continue + Exit is everyone.
    const q = page({
      facts: f,
      benchmark: f,
      extras: { ...extras, wizard_skips_from: "2026-10-09" },
    });
    for (const s of q.wizard.slides) {
      expect(s.skip).toBeNull();
      expect((s.cont ?? 0) + (s.exit ?? 0)).toBeCloseTo(1, 12);
    }
  });
});

describe("reading time by group", () => {
  it("puts those who'd rather not label it in Not stated, and shows Other when answered", () => {
    const f = factsFixture({
      subs: [
        sub({ id: 1, readMs: 100_000, closed: 1, gender: "I’d rather not label this" }),
        sub({ id: 2, readMs: 300_000, closed: 1 }),
        sub({ id: 3, readMs: 200_000, closed: 1, gender: "Woman" }),
      ],
    });
    expect(
      page({ facts: f, benchmark: f }).time.byGender.map((r) => [r.label, r.medianMs])
    ).toEqual([
      ["Women", 200_000],
      ["Men", null],
      ["Non-binary", null],
      ["Not stated", 200_000],
    ]);
    const g = factsFixture({ subs: [sub({ id: 4, readMs: 60_000, closed: 1, gender: "Other" })] });
    expect(page({ facts: g, benchmark: g }).time.byGender.map((r) => r.label)).toEqual([
      "Women",
      "Men",
      "Non-binary",
      "Other",
      "Not stated",
    ]);
  });
});

describe("what each info card is worked out of", () => {
  it("gives the rates and averages their parts", () => {
    const f = factsFixture({
      subs: [
        sub({ id: 1, readMs: 100_000, closed: 1, returnedAt: "2026-10-03T10:00:00Z", visits: 2 }),
        sub({ id: 2, readMs: 300_000, closed: 3 }),
        sub({ id: 3, openedAt: null }),
      ],
    });
    const p = page({ facts: f, benchmark: f });
    expect(p.tiles.find((t) => t.key === "returned")!.parts).toEqual({ num: 1, den: 2 });
    expect(p.tiles.find((t) => t.key === "read")!.parts).toEqual({ num: 400_000, den: 2 });
    expect(p.wizard.tiles.find((t) => t.key === "left")!.parts).toEqual({ num: 1, den: 3 });
    const box = (k: string) => [...p.time.boxes, ...p.returns.boxes].find((b) => b.key === k)!;
    expect(box("session").parts).toEqual({ num: 400_000, den: 4 });
    expect(box("visits")).toMatchObject({
      label: "Sessions per reader",
      parts: { num: 3, den: 2 },
    });
  });
});

describe("the report page on screen", () => {
  const screenFacts = factsFixture({
    subs: [
      sub({ id: 1, wizardSlide: 5, readMs: 200_000, closed: 1 }),
      sub({ id: 2, wizardSlide: 3, readMs: 50_000, closed: 1 }),
      sub({ id: 3, wizardSlide: 1, openedAt: null }),
    ],
  });
  const stat = (section: string, over: Partial<ReportExtras["chapter_stats"][number]>) => ({
    section,
    reached: 0,
    ms_avg: null,
    ms_median: null,
    opened: 0,
    show_all: 0,
    learn_more: 0,
    try_this: 0,
    pw_seen: 0,
    pw_click: 0,
    ...over,
  });
  const payload = page({
    facts: screenFacts,
    benchmark: screenFacts,
    extras: {
      ...extras,
      chapter_stats: [stat("typical_beliefs", { reached: 2, ms_avg: 150_000, ms_median: 125_000 })],
      chapter_readers: 2,
      chapter_stats_from: "2026-10-01",
      emails: [{ stage: "72h_no_unlock", sent: 8, returned: 2, bought: 1, revenue: 3.49 }],
    },
    returns: {
      ok: true,
      value: {
        sources: [
          { source: "Bookmark or direct", sessions: 3 },
          { source: "Email link", sessions: 1 },
        ],
        campaigns: [],
        wizardSkips: 0,
      },
    },
    votes: [
      vote("core_archetype", "up", "2026-10-07T10:00:00Z", { comment: "Spot on [email]" }),
      vote("core_archetype", "up", "2026-10-06T10:00:00Z"),
      vote("typical_beliefs", "up", "2026-10-05T10:00:00Z"),
      vote("typical_beliefs", "down", "2026-10-04T10:00:00Z"),
      vote("the_loveiq_concept", "up", "2026-04-09T10:00:00Z"),
    ],
  });

  it("has the Guided tour section and pill, the design's names, and its notes", () => {
    screenData.payload = payload;
    render(createElement(ApReport));
    const nav = within(screen.getByRole("navigation", { name: "Report sections" }));
    expect(nav.getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Wizard",
      "Guided tour",
      "Time & returns",
      "Chapters",
      "Feedback",
    ]);
    const tour = within(document.getElementById("tour")!);
    expect(tour.getByRole("heading", { name: "Guided tour" })).toBeInTheDocument();
    expect(tour.getByText(/Free readers get 5 stops, paid readers 4/)).toBeInTheDocument();
    // A range before it was recorded (23 Oct): no figures, and the day it starts.
    expect(
      tour.getAllByText(/Recorded from 23 Oct 2026: pick a range from that day on/).length
    ).toBeGreaterThan(0);
    // No figure: no share is drawn anywhere in it.
    expect(tour.queryAllByText(/^(Finish )?\d+%$/)).toHaveLength(0);
    expect(
      screen.getByText(
        /Continue \+ Skip intro \+ Exit add up to 100% of readers on each slide; Back is counted separately\./
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/in total, against all reports$/)).toBeInTheDocument();
    expect(screen.queryByText(/average of all reports/)).toBeNull();
    expect(screen.getByText("Sessions per reader")).toBeInTheDocument();
    expect(screen.queryByText("Visits per reader")).toBeNull();
    expect(screen.getByText("Bookmark / direct")).toBeInTheDocument();
    // A retired campaign with nothing in the range: 0 sent, 0 bought, the rest blank.
    const campaigns = within(screen.getByRole("table", { name: "Email campaigns" }));
    const retired = campaigns.getAllByRole("row")[2]!;
    expect(
      within(retired)
        .getAllByRole("cell")
        .map((c) => c.textContent)
    ).toEqual(["Retired", "0", "—", "—", "—", "—", "0"]);
  });

  it("puts a defined info icon on every figure", () => {
    screenData.payload = payload;
    render(createElement(ApReport));
    const icons = screen.getAllByRole("button", { name: /^About / });
    for (const b of icons) expect(b.title).not.toBe("Not defined yet.");
    const named = new Set(icons.map((b) => b.getAttribute("aria-label")));
    const want = [
      // The headline tiles and the wizard's.
      ...payload.tiles.map((t) => t.label),
      ...payload.wizard.tiles.map((t) => t.label),
      // The wizard's columns, the boxes, the charts.
      "Median time",
      "Reached",
      "Continue",
      "Skip intro",
      "Back",
      "Exit",
      ...[...payload.time.boxes, ...payload.returns.boxes].map((b) => b.label),
      "Share of readers by total active reading time",
      "How far into the report readers got",
      "Total time by gender",
      "Total time by age",
      "Days until first return",
      "In this band",
      "Returned by then",
      "What brought readers back",
      // The campaigns' and chapters' columns, the feedback figures.
      "Sent",
      "Opened",
      "Clicked",
      "Returned",
      "Return rate",
      "Purchased",
      "Reach",
      "Feedback · good / bad",
      "Show more CTR",
      "Paywall CTR",
      "Learn more CTR",
      "Exercise CTR",
      "Good votes",
      "Issues reported",
      // The guided tour: its tiles and its stops' columns.
      ...payload.tour.audiences[0]!.tiles.map((t) => t.label),
      "Time",
      "Next",
      "Skip tour",
    ];
    for (const label of want) expect(named, label).toContain(`About ${label}`);
    // Every tour tile carries its own card.
    const tourKeys = payload.tour.audiences[0]!.tiles.map((t) => `report.${t.key}`);
    for (const k of tourKeys) expect(FIELDS[k], k).toBeDefined();
    // Every key the page names is defined, with its query.
    for (const k of Object.keys(FIELDS).filter((x) => x.startsWith("report."))) {
      expect(FIELDS[k]!.query.text.length, k).toBeGreaterThan(20);
    }
  });

  it("chapters: the median time, 0 and 0 / 0 without votes, and the Feedback sort", () => {
    screenData.payload = payload;
    render(createElement(ApReport));
    const table = within(screen.getByRole("table", { name: "Chapters" }));
    expect(table.getByRole("button", { name: "Sort by Median time" })).toBeInTheDocument();
    expect(table.getByText("2:05")).toBeInTheDocument();
    const intro = table.getByText("Introduction").closest<HTMLElement>("[role=row]")!;
    expect(within(intro).getAllByRole("cell")[3]!.textContent).toBe("00 / 0");
    // Most votes first; a tie by the larger good share.
    fireEvent.click(
      within(screen.getByRole("group", { name: "Sort chapters by" })).getByRole("button", {
        name: "Feedback",
      })
    );
    const names = table.getAllByRole("rowheader").map((h) => h.textContent);
    expect(names.slice(0, 3)).toEqual(["Core Archetype", "Typical Beliefs", "The LoveIQ concept"]);
  });

  it("feedback: all time, the search finds a chapter's id, and the comment shows", () => {
    screenData.payload = payload;
    render(createElement(ApReport));
    const fb = within(document.getElementById("feedback")!);
    expect(fb.getByText(/good · 4 good \/ 1 bad · 5 votes \(live, all time\)/)).toBeInTheDocument();
    expect(fb.getByText(/live, all time since 9 Apr 2026/)).toBeInTheDocument();
    const log = within(fb.getByRole("table", { name: "Feedback log" }));
    expect(log.getByText("Spot on [email]")).toHaveClass("italic");
    expect(log.getAllByRole("row")[2]!.lastElementChild!.textContent).toBe("—");
    fireEvent.change(fb.getByRole("searchbox", { name: "Search feedback" }), {
      target: { value: "the_loveiq_concept" },
    });
    expect(fb.getByText("Feedback log · 1 of 1")).toBeInTheDocument();
  });

  it("says so when the votes could not be read, never a column of zeros", () => {
    const p = page({ votes: null });
    expect(p.feedback.error).toMatch(/could not be read/);
    screenData.payload = p;
    render(createElement(ApReport));
    expect(
      within(document.getElementById("feedback")!).getByText(/could not be read/)
    ).toBeInTheDocument();
    const intro = within(screen.getByRole("table", { name: "Chapters" }))
      .getByText("Introduction")
      .closest<HTMLElement>("[role=row]")!;
    expect(within(intro).getAllByRole("cell")[3]!.textContent).toBe("—");
  });
});

describe("the intro wizard's whole percents", () => {
  it("add up to 100 and read equal shares alike", () => {
    // 39, 1 and 1 of 41 readers: 95.1%, 2.4%, 2.4%.
    expect(wholeSplit([39 / 41, 1 / 41, 1 / 41])).toEqual(["96%", "2%", "2%"]);
    expect(wholeSplit([0.951, 0.0245, 0.0245])).toEqual(["96%", "2%", "2%"]);
    // 37, 1 and 1 of 39 (94.9%, 2.6%, 2.6%): the two equal shares take the two points left.
    expect(wholeSplit([37 / 39, 1 / 39, 1 / 39])).toEqual(["94%", "3%", "3%"]);
    // Skip intro not recorded (before 16 Oct): the other two still add up to 100.
    expect(wholeSplit([0.875, null, 0.125])).toEqual(["88%", "—", "12%"]);
    // Largest remainder otherwise: 2.6% rounds up before 95.2%.
    expect(wholeSplit([0.952, 0.026, 0.022])).toEqual(["95%", "3%", "2%"]);
    // Three equal shares can't read alike and add up: they still add up.
    expect(
      wholeSplit([1 / 3, 1 / 3, 1 / 3])
        .map((x) => parseInt(x))
        .reduce((a, b) => a + b)
    ).toBe(100);
    // A share under half a percent reads "<1%", never a false 0%.
    expect(wholeSplit([0.996, 0.004, 0])).toEqual(["100%", "<1%", "0%"]);
  });
});
