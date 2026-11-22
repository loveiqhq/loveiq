// @vitest-environment jsdom
/**
 * AP › Survey against Mark's Survey copy board (17–18 Nov 2026): the Sheets section above the
 * demographics, each sheet's row between its questions in the funnel (survey order only), the
 * funnel sorted by two columns, and the Question dropdown in Question detail.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseFilters } from "@features/admin/server/ap/filters";
import type { SurveySheetsByOrder, SurveySheetsSeen } from "@features/admin/server/ap/posthog";
import { buildSurveyQuestions, type QuestionRow } from "@features/admin/server/ap/survey";
import { buildSurveyPage } from "@features/admin/server/ap/survey-page";
import type { DropoffRun } from "@features/admin/server/dropoff-report";
import { askedQuestions } from "@features/admin/server/dropoff-weekly";

import { factsFixture } from "./ap-fixtures";

const run = (sessionId: string, startedAt: string, reached: string[]): DropoffRun => ({
  sessionId,
  startedAt: Date.parse(startedAt),
  reached,
  leftAt: null,
  source: "other",
  device: null,
});
const oldOrder = askedQuestions(400, "control").map((q) => q.qId);
const newOrder = askedQuestions(400, "variant").map((q) => q.qId);

const questions = buildSurveyQuestions(
  [
    run("o1", "2026-11-16T10:00:00Z", oldOrder),
    run("n1", "2026-11-18T11:00:00Z", newOrder),
    run("n2", "2026-11-19T12:00:00Z", newOrder.slice(0, 40)),
  ],
  {
    steps: [
      { q_id: "02004", went_back: 0, skipped: 0, median_ms: 9000, timed: 2 },
      { q_id: "03008", went_back: 0, skipped: 0, median_ms: 4000, timed: 2 },
    ],
    exits: [],
    first_asked: {},
    orders: [
      { s: "n1", q: newOrder.slice(0, 6) },
      { s: "n2", q: newOrder.slice(0, 6) },
    ],
  },
  "2026-11-16",
  "2026-11-21",
  "All traffic",
  null
);

const fig = (saw: number, leftOpen: number, medianMs: number, ticked = 0) => ({
  saw,
  settled: saw,
  leftOpen,
  closed: saw - leftOpen,
  medianMs,
  ticked,
});
const seen: SurveySheetsSeen = {
  bySheet: {
    science: fig(87, 1, 4967),
    trustpilot: fig(76, 1, 3499),
    expert: fig(23, 0, 2701),
    halfway: fig(40, 3, 5679),
    desire: fig(36, 0, 3405, 1),
    reportMap: fig(49, 2, 4874),
  },
  all: fig(311, 7, 4129, 1),
};

/** The old order's runs met fewer sheets, and never the expert's. */
const byOrder: SurveySheetsByOrder = {
  test: seen,
  survey: {
    bySheet: { science: fig(41, 0, 5049), halfway: fig(29, 2, 4832) },
    all: fig(70, 2, 4900),
  },
};

const page = (
  to: string,
  sheetsSeen: Parameters<typeof buildSurveyPage>[0]["sheetsSeen"] = { ok: true, value: byOrder },
  over: Partial<Parameters<typeof buildSurveyPage>[0]> = {}
) =>
  buildSurveyPage({
    facts: factsFixture({ from: "2026-11-16", to }),
    previous: null,
    benchmark: factsFixture(),
    benchmarkKind: "all",
    filters: parseFilters({ period: "custom", from: "2026-11-16", to }, "2026-11-22"),
    today: "2026-11-22",
    now: new Date("2026-11-22T10:00:00Z"),
    questions,
    questionsError: null,
    introClicks: null,
    sheetsOn: ["science", "trustpilot", "expert", "halfway", "desire", "reportMap"],
    sheetsSeen,
    ...over,
  });
const payload = page("2026-11-21");

const view: {
  payload: typeof payload;
  /** What the answers call holds: the hook keeps the last answers while the next load. */
  answers: AnswerSplit | null;
  answersLoading: boolean;
  answersError: string | null;
} = { payload, answers: null, answersLoading: false, answersError: null };
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: (url: string) => ({
    data:
      url === "/api/admin/ap/survey"
        ? view.payload
        : url === "/api/admin/ap/survey/answers"
          ? view.answers
          : null,
    loading: url === "/api/admin/ap/survey/answers" ? view.answersLoading : false,
    error: url === "/api/admin/ap/survey/answers" ? view.answersError : null,
    refetch: () => {},
  }),
}));
vi.mock("@features/admin/ui/ap/useApFilters", () => ({ useApFilters: () => ({ params: {} }) }));
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({ default: () => null }));
vi.mock("@features/admin/ui/ap/csv", () => ({ exportTables: () => {} }));

import type { AnswerSplit } from "@features/admin/server/ap/answers";
import ApSurvey, { FUNNEL_SORT, sortFunnel } from "@features/admin/ui/ap/ApSurvey";

Element.prototype.scrollIntoView = vi.fn();
afterEach(() => {
  cleanup();
  view.payload = payload;
  view.answers = null;
  view.answersLoading = false;
  view.answersError = null;
});

const funnel = () => screen.getByRole("table", { name: "Survey question funnel" });
const funnelRows = () => within(funnel()).getAllByRole("row").slice(1);
const sheetRow = (id: string) => funnelRows().find((r) => r.getAttribute("data-sheet") === id);
const neighbours = (id: string) => {
  const rows = funnelRows();
  const i = rows.findIndex((r) => r.getAttribute("data-sheet") === id);
  return { before: rows[i - 1]!.textContent!, after: rows[i + 1]?.textContent ?? "" };
};
const sheetsTable = () => screen.getByRole("table", { name: "Sheets between the questions" });
const sheetsRow = (name: string) =>
  within(sheetsTable())
    .getAllByRole("row")
    .find((r) => r.textContent!.includes(name))!;
const banner = () => screen.queryByText(/Sheets show only in survey order\./);

describe("the Sheets section (Mark, 17 Nov 2026)", () => {
  it("sits above the core demographics, a row per sheet with its figures", () => {
    render(<ApSurvey />);
    const sheets = document.getElementById("sheets")!;
    const demo = document.getElementById("demographics")!;
    expect(sheets.compareDocumentPosition(demo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(sheetsTable()).getAllByRole("row")).toHaveLength(7);
    const halfway = within(sheetsRow("Halfway · profile filling in")).getAllByRole("cell");
    // Where it sits in the new order (the page opens on it): after 11003, its number in that order.
    expect(halfway[0]!.textContent).toContain(`After #${newOrder.indexOf("11003") + 1}`);
    expect(halfway[0]!.textContent).toContain("11003");
    expect(halfway[1]!.textContent).toBe("40");
    // 3 of 40 left with it open: over 5%, red as a question's drop-out is.
    expect(halfway[2]!.textContent).toBe("7.5%");
    expect(halfway[2]!.className).toContain("text-ap-bad");
    expect(halfway[3]!.textContent).toBe("6 s");
    expect(halfway[4]!.textContent).toBe("—");
    const desire = within(sheetsRow("State of Desire report promo")).getAllByRole("cell");
    expect(desire[4]!.textContent).toBe("2.8%1 click");
    const expert = within(sheetsRow("Expert quote")).getAllByRole("cell");
    expect(expert[0]!.textContent).toContain(`Before #${newOrder.indexOf("01005") + 1}`);
  });

  it("shows the four tiles: sheets on, and every sheet's bounce, time and conversion", () => {
    render(<ApSurvey />);
    const sheets = within(document.getElementById("sheets")!);
    const tile = (label: string) => sheets.getAllByText(label)[0]!.closest("div")!.textContent!;
    expect(tile("Sheets in the survey")).toContain("6");
    expect(tile("Bounce rate")).toContain("2.3%");
    expect(tile("Median time")).toContain("4 s");
    expect(tile("Conversion")).toContain("2.8%");
    expect(tile("Conversion")).toContain("1 click");
  });

  it("says when the range is before the sheets, and keeps them off the funnel and charts", () => {
    view.payload = page("2026-11-15");
    render(<ApSurvey />);
    expect(screen.getByText(/The sheets went live on 17 Nov 2026/)).toBeTruthy();
    expect(funnelRows().some((r) => r.hasAttribute("data-sheet"))).toBe(false);
    expect(document.querySelector("[data-sheet]")).toBeNull();
  });

  it("says PostHog couldn't be read, with blanks rather than noughts in the funnel", () => {
    view.payload = page("2026-11-21", {
      ok: false,
      error: "PostHog could not be read just now. Try again in a minute.",
    });
    render(<ApSurvey />);
    expect(
      within(document.getElementById("sheets")!).getByText(/PostHog could not be read/)
    ).toBeTruthy();
    expect(within(sheetRow("halfway")!).getAllByRole("cell")[1]!.textContent).toBe("—");
  });
});

describe("the sheets in the question funnel", () => {
  it("puts each sheet's row between its questions, in survey order", () => {
    render(<ApSurvey />);
    expect(neighbours("science").before).toContain("02004");
    expect(neighbours("trustpilot").before).toContain("03008");
    expect(neighbours("halfway").before).toContain("11003");
    expect(neighbours("desire").before).toContain("16005");
    expect(neighbours("reportMap").before).toContain("16017");
    // The expert's opens on arriving at 01005: its row comes right before it.
    expect(neighbours("expert").after).toContain("01005");
    const cells = within(sheetRow("halfway")!).getAllByRole("cell");
    expect(cells[1]!.textContent).toBe("40");
    expect(cells[5]!.textContent).toBe("3");
    expect(cells[6]!.textContent).toBe("7.5%");
    expect(within(sheetRow("halfway")!).getByRole("link").getAttribute("href")).toBe("#sheets");
    expect(sheetRow("desire")!.textContent).toContain("Conversion 2.8%");
  });

  it("leaves the expert's out of the old order, which asks its question too early", () => {
    render(<ApSurvey />);
    fireEvent.click(
      within(screen.getByRole("group", { name: "Question order" })).getByRole("button", {
        name: /^Old order/,
      })
    );
    expect(sheetRow("expert")).toBeUndefined();
    expect(neighbours("science").before).toContain("02004");
    // The old order's own runs: its figures, not the new order's.
    expect(within(sheetRow("science")!).getAllByRole("cell")[1]!.textContent).toBe("41");
    expect(within(sheetRow("halfway")!).getAllByRole("cell")[5]!.textContent).toBe("2");
    expect(
      within(sheetsRow("Halfway · profile filling in")).getAllByRole("cell")[1]!.textContent
    ).toBe("29");
    // A sheet nobody in this order met reads 0, not a blank.
    expect(within(sheetRow("desire")!).getAllByRole("cell")[1]!.textContent).toBe("0");
  });

  it("pins the sheets on both charts", () => {
    render(<ApSurvey />);
    const charts = document.getElementById("time-drop")!;
    const pins = [...charts.querySelectorAll("[data-sheet]")].map((p) =>
      p.getAttribute("data-sheet")
    );
    expect(pins).toEqual([
      ...["science", "trustpilot", "expert", "halfway", "desire", "reportMap"],
      ...["science", "trustpilot", "expert", "halfway", "desire", "reportMap"],
    ]);
    // Mark's board: the section says where the sheets are, and the key names them as between
    // questions (the expert's opens before its question, so not "after").
    expect(charts.textContent).toContain(
      "with the numbered sheets where they sit between questions."
    );
    expect(within(charts).getAllByText("Sheet, between questions")).toHaveLength(2);
  });

  it("says nothing about sheets on the charts for a range before them", () => {
    view.payload = page("2026-11-15");
    render(<ApSurvey />);
    const charts = document.getElementById("time-drop")!;
    expect(charts.textContent).not.toContain("numbered sheets");
    expect(within(charts).queryByText("Sheet, between questions")).toBeNull();
  });
});

describe("the sheets where the figures around them can't follow (review, 21 Nov 2026)", () => {
  it("keeps the sheets out of a funnel narrowed by a filter, and says where they are", () => {
    view.payload = page("2026-11-21", undefined, {
      questions: { ...questions, segment: "Phones" },
    });
    render(<ApSurvey />);
    expect(funnelRows().some((r) => r.hasAttribute("data-sheet"))).toBe(false);
    expect(document.querySelector("#time-drop [data-sheet]")).toBeNull();
    expect(
      screen.getByText(
        /The sheets show between the questions with all traffic only: they are read from PostHog, while the filters narrow the survey runs in our database\./
      )
    ).toBeTruthy();
    // The Sheets section still has them.
    expect(within(sheetsTable()).getAllByRole("row")).toHaveLength(7);
  });

  it("says which order's runs the Sheets section counts, and follows the funnel's pick", () => {
    render(<ApSurvey />);
    const sheets = document.getElementById("sheets")!;
    expect(sheets.textContent).toContain(
      "Runs in the new order (C13), as picked in the Question funnel."
    );
    fireEvent.click(
      within(screen.getByRole("group", { name: "Question order" })).getByRole("button", {
        name: /Old order/,
      })
    );
    expect(document.getElementById("sheets")!.textContent).toContain(
      "Runs in the old order, as picked in the Question funnel."
    );
  });

  it("says why the Sheets section counts all traffic under a filter (the true reason)", () => {
    view.payload = page("2026-11-21", undefined, {
      filters: parseFilters(
        { period: "custom", from: "2026-11-16", to: "2026-11-21", device: "phone" },
        "2026-11-22"
      ),
    });
    render(<ApSurvey />);
    const sheets = document.getElementById("sheets")!;
    expect(sheets.textContent).toContain(
      "The sheets count all traffic whatever the filters: they are read from PostHog, while the filters narrow the survey runs in our database."
    );
    expect(sheets.textContent).not.toContain("carry no source or device");
  });

  it("says from when a sheet is counted, for a range that starts before the sheets", () => {
    view.payload = page("2026-11-21", undefined, {
      filters: parseFilters(
        { period: "custom", from: "2026-11-01", to: "2026-11-21" },
        "2026-11-22"
      ),
      facts: factsFixture({ from: "2026-11-01", to: "2026-11-21" }),
    });
    render(<ApSurvey />);
    expect(within(sheetRow("halfway")!).getByText("Counted from 17 Nov 2026")).toBeTruthy();
  });

  it("without the questions, reads the order the range opens on and places nothing", () => {
    view.payload = page("2026-11-21", undefined, {
      questions: null,
      questionsError: "The questions could not be read.",
    });
    render(<ApSurvey />);
    const halfway = within(sheetsRow("Halfway · profile filling in")).getAllByRole("cell");
    // The new order's figures (the range reaches the test's end), not the old order's.
    expect(halfway[1]!.textContent).toBe("40");
    expect(halfway[0]!.textContent).toBe("—");
    expect(document.getElementById("sheets")!.textContent).not.toContain("it never opens");
    // It names the order, but no "as picked" with no order toggle on the funnel.
    const said = document.getElementById("sheets")!.textContent!;
    expect(said).toContain("Runs in the new order (C13).");
    expect(said).not.toContain("as picked in the Question funnel");
  });
});

describe("sorting the funnel by two columns (Mark, 17 Nov 2026)", () => {
  it("clicks a column first, another second; the first again goes back to survey order", () => {
    render(<ApSurvey />);
    const head = within(funnelRows()[0]!.parentElement!.firstElementChild as HTMLElement);
    fireEvent.click(head.getByRole("button", { name: "Sort by Drop-out rate" }));
    expect(banner()!.parentElement!.textContent).toContain("Sorted by Drop-out rate.");
    expect(funnelRows().some((r) => r.hasAttribute("data-sheet"))).toBe(false);
    fireEvent.click(head.getByRole("button", { name: "Sort by Median time" }));
    expect(banner()!.parentElement!.textContent).toContain(
      "Sorted by Median time, then Drop-out rate."
    );
    expect(head.getByRole("button", { name: "Sort by Median time, now sort 1" })).toBeTruthy();
    expect(head.getByRole("button", { name: "Sort by Drop-out rate, now sort 2" })).toBeTruthy();
    // The slowest question first: 02004's 9 s, then 03008's 4 s.
    expect(funnelRows()[0]!.textContent).toContain("02004");
    expect(funnelRows()[1]!.textContent).toContain("03008");
    fireEvent.click(head.getByRole("button", { name: "Sort by Median time, now sort 1" }));
    expect(banner()).toBeNull();
    expect(sheetRow("science")).toBeTruthy();
  });

  it("sorts with the two dropdowns, and Back to survey order resets them", () => {
    render(<ApSurvey />);
    const sortBy = screen.getByRole("combobox", { name: "Sort by" }) as HTMLSelectElement;
    const thenBy = screen.getByRole("combobox", { name: "Then by" }) as HTMLSelectElement;
    expect(thenBy.disabled).toBe(true);
    fireEvent.change(sortBy, { target: { value: "exits" } });
    fireEvent.change(thenBy, { target: { value: "time" } });
    expect(banner()!.parentElement!.textContent).toContain("Sorted by Exits, then Median time.");
    // The first sort is never offered again as the second.
    expect([...thenBy.options].map((o) => o.value)).not.toContain("exits");
    fireEvent.click(screen.getByRole("button", { name: "Back to survey order" }));
    expect(sortBy.value).toBe("order");
    expect(thenBy.value).toBe("none");
    expect(banner()).toBeNull();
  });

  it("orders by the first key, the second on a tie, then survey order; blanks last", () => {
    const step = (n: number, drop: number | null, time: number | null, ofPrev: number | null) => ({
      r: { n } as QuestionRow,
      text: `q${n}`,
      reached: 100 - n,
      ofStart: null,
      ofPrev,
      exits: 0,
      drop,
      time,
    });
    // Median times in ms, as the funnel carries them.
    const steps = [
      step(1, 0, 3000, 1),
      step(2, 0.1, 1000, 0.9),
      step(3, 0, 9000, 0.95),
      step(4, null, 5000, null),
      step(5, 0, 9000, 1),
    ];
    const order = (s: typeof steps) => s.map((x) => x.r.n);
    expect(order(sortFunnel(steps, null, null))).toEqual([1, 2, 3, 4, 5]);
    expect(order(sortFunnel(steps, "drop", "time"))).toEqual([2, 3, 5, 1, 4]);
    expect(order(sortFunnel(steps, "drop", null))).toEqual([2, 1, 3, 5, 4]);
    // % of prev.: lowest first.
    expect(order(sortFunnel(steps, "ofPrev", null))).toEqual([2, 3, 1, 5, 4]);
    expect(FUNNEL_SORT.ofPrev.option).toBe("% of prev., lowest first");
  });

  it("never ties a rate that reads differently: <0.1% sits above 0.0%, >99.9% below 100.0%", () => {
    const step = (n: number, drop: number, ofPrev: number, time: number) => ({
      r: { n } as QuestionRow,
      text: `q${n}`,
      reached: 100,
      ofStart: null,
      ofPrev,
      exits: 0,
      drop,
      time,
    });
    const order = (s: ReturnType<typeof step>[]) => s.map((x) => x.r.n);
    // 1 exit of 2,500 reads "<0.1%": above a true "0.0%" whatever the second key says.
    const drops = [step(1, 0, 1, 30000), step(2, 1 / 2500, 1, 1000)];
    expect(order(sortFunnel(drops, "drop", "time"))).toEqual([2, 1]);
    // % of prev., lowest first: ">99.9%" comes before "100.0%".
    const prev = [step(1, 0, 1, 0), step(2, 0, 2499 / 2500, 0)];
    expect(order(sortFunnel(prev, "ofPrev", null))).toEqual([2, 1]);
  });

  it("treats rows that read the same as tied, so the second key decides (review, 22 Nov 2026)", () => {
    const step = (n: number, drop: number, time: number) => ({
      r: { n } as QuestionRow,
      text: `q${n}`,
      reached: 100,
      ofStart: null,
      ofPrev: null,
      exits: 0,
      drop,
      time,
    });
    // 4/77 and 3/58 both read "5.2%"; 2.4 s and 2.6 s read "2 s" and "3 s".
    const steps = [step(1, 4 / 77, 2000), step(2, 3 / 58, 30000), step(3, 0.06, 1000)];
    const order = (s: typeof steps) => s.map((x) => x.r.n);
    expect(order(sortFunnel(steps, "drop", "time"))).toEqual([3, 2, 1]);
    // A tenth of a percent apart is not a tie.
    const apart = [step(1, 0.053, 2000), step(2, 0.052, 30000)];
    expect(order(sortFunnel(apart, "drop", "time"))).toEqual([1, 2]);
    // Times to the second: 2.4 s and 2.6 s differ as shown (2 s, 3 s).
    expect(order(sortFunnel([step(1, 0, 2400), step(2, 0, 2600)], "time", null))).toEqual([2, 1]);
  });
});

describe("the Question dropdown in Question detail (Mark, 16–17 Nov 2026)", () => {
  it("lists the questions by chapter and opens the one picked", () => {
    render(<ApSurvey />);
    const pick = screen.getByRole("combobox", { name: "Question" }) as HTMLSelectElement;
    const groups = [...pick.querySelectorAll("optgroup")].map((g) => g.label);
    expect(groups[0]).toBe("Name");
    expect(groups).toContain("Desire & arousal");
    pick.focus();
    fireEvent.change(pick, { target: { value: "03008" } });
    const detail = document.getElementById("question-detail")!;
    expect(detail.textContent).toContain("Survey · Question detail · 03008");
    // The same control, still focused: arrowing through the list keeps the keyboard on it.
    const now = screen.getByRole("combobox", { name: "Question" }) as HTMLSelectElement;
    expect(now).toBe(pick);
    expect(document.activeElement).toBe(pick);
    expect(now.value).toBe("03008");
  });

  it("never shows the last question's answers under a newly picked one while its own load", () => {
    view.answers = {
      qid: "01002",
      question: "Right now, I feel satisfied with my sex life.",
      type: "scale",
      multiple: false,
      segments: [{ name: "All submissions", n: 12 }],
      hidden: [],
      answers: [{ label: "7 · Completely true", shares: [0.5] }],
      gap: null,
      respondents: 12,
      finished: 12,
    };
    render(<ApSurvey />);
    const pick = screen.getByRole("combobox", { name: "Question" }) as HTMLSelectElement;
    fireEvent.change(pick, { target: { value: "01002" } });
    expect(document.getElementById("question-detail")!.textContent).toContain(
      "7 · Completely true"
    );
    // The next question is picked; the hook still holds 01002's answers while 03008's load.
    view.answersLoading = true;
    fireEvent.change(pick, { target: { value: "03008" } });
    const detail = document.getElementById("question-detail")!;
    expect(detail.textContent).not.toContain("7 · Completely true");
    expect(detail.textContent).toContain("Loading the answers…");
  });

  it("never shows the last question's load error while the next question's answers load", () => {
    view.answersError = "timed out";
    render(<ApSurvey />);
    const pick = screen.getByRole("combobox", { name: "Question" }) as HTMLSelectElement;
    expect(document.getElementById("question-detail")!.textContent).toContain(
      "Could not load the answers: timed out"
    );
    view.answersLoading = true;
    fireEvent.change(pick, { target: { value: "03008" } });
    const detail = document.getElementById("question-detail")!.textContent!;
    expect(detail).not.toContain("Could not load the answers");
    expect(detail).toContain("Loading the answers…");
  });

  it("starts a newly picked question unsplit", () => {
    render(<ApSurvey />);
    const split = screen.getByRole("combobox", { name: /Compare answers by/ }) as HTMLSelectElement;
    fireEvent.change(split, { target: { value: "device" } });
    expect(split.value).toBe("device");
    fireEvent.change(screen.getByRole("combobox", { name: "Question" }), {
      target: { value: "03008" },
    });
    expect(
      (screen.getByRole("combobox", { name: /Compare answers by/ }) as HTMLSelectElement).value
    ).toBe("none");
  });
});
