// @vitest-environment jsdom
/**
 * The Landing page as Marcus's design and the 21 Oct 2026 call left it: the tests renamed, the
 * rebuild test and "How these are counted" gone, median times, the pay-to-start section, the
 * tiles' grey "No comparison" reasons, and an info icon on every figure.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const screenData = vi.hoisted(() => ({ payload: null as unknown, exported: null as unknown }));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: () => ({
    data: screenData.payload,
    loading: false,
    error: null,
    refetch: () => {},
  }),
}));
// The info card reads the filters (its query box and 12-week line).
vi.mock("@features/admin/ui/ap/useApFilters", async () => {
  const { parseFilters } = await import("@features/admin/server/ap/filters");
  return {
    useApFilters: () => ({
      params: {},
      filters: parseFilters(
        { period: "custom", from: "2026-10-14", to: "2026-10-20" },
        "2026-10-21"
      ),
      today: "2026-10-21",
    }),
  };
});
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({ default: () => null }));
vi.mock("@features/admin/ui/ap/csv", () => ({
  exportTables: (_name: string, tables: unknown) => {
    screenData.exported = tables;
  },
}));

import type { Table } from "@features/admin/server/ap/common";
import { parseFilters, rangeLabel } from "@features/admin/server/ap/filters";
import { fmt } from "@features/admin/server/ap/format";
import {
  buildLanding,
  HERO_VIDEO_SEEN_FROM,
  LANDING_TESTS,
} from "@features/admin/server/ap/landing";
import {
  measuresOf,
  SURVEY_STARTED_FROM,
  type PtsFunnel,
  type PtsPayload,
} from "@features/admin/server/ap/pay-to-start";
import type { HeroVideo, LandingArmEngagement } from "@features/admin/server/ap/posthog";
import ApLanding from "@features/admin/ui/ap/ApLanding";
import { FieldInfoProvider } from "@features/admin/ui/ap/field-info";
import { FIELDS } from "@features/admin/ui/ap/fields";

import { factsFixture, sub } from "./ap-fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const today = "2026-10-21";
const now = new Date("2026-10-21T10:00:00Z");

/** PostHog's engagement for one arm: `bounced` of `sessions` bounced, a tenth clicked. */
const ph = (
  arm: string,
  sessions: number,
  bounced: number,
  median: number
): LandingArmEngagement => ({
  arm,
  sessions,
  bounced,
  cta: Math.round(sessions / 10),
  leaves: sessions,
  scroll: [sessions, Math.round(sessions / 2), 0, 0],
  medianSeconds: median,
  meanSeconds: median * 14,
  timed: sessions,
  sqSeconds: sessions * (median * 14) ** 2,
});

/** The presenter video's week: 8 of the 364 who saw it started it, and no tap recorded yet. */
const VIDEO: HeroVideo = {
  saw: 364,
  tapped: 0,
  started: 8,
  reached: [6, 3, 2],
  finished: 0,
  failed: 1,
};

/** The running hero test's last week, compared with the first run's week. */
function heroInput(): Parameters<typeof buildLanding>[0] {
  const arms = {
    ok: true as const,
    value: [ph("white_card", 200, 80, 5.097), ph("white_video", 60, 15, 5.72)],
  };
  return {
    facts: factsFixture({
      from: "2026-10-14",
      to: "2026-10-20",
      visits: [
        { day: "2026-10-15", arm: "white_card", src: null, n: 300 },
        { day: "2026-10-15", arm: "white_video", src: null, n: 280 },
      ],
      starts: [
        {
          day: "2026-10-15",
          known: true,
          src: null,
          med: null,
          ads: false,
          arm: "white_card",
          device: null,
          finished: true,
          camp: null,
          term: null,
          cq: null,
          email: true,
          n: 58,
        },
      ],
      subs: [sub({ id: 5, day: "2026-10-15", arm: "white_card" })],
      money: [],
    }),
    previous: factsFixture({ from: "2026-10-07", to: "2026-10-13" }),
    filters: parseFilters({ period: "custom", from: "2026-10-14", to: "2026-10-20" }, today),
    today,
    now,
    armEngagement: { hero: arms },
    engagement: arms,
    pageTime: { ok: true, value: { median: 4.763, mean: 38.4 } },
    video: { ok: true, value: VIDEO },
  };
}
const heroWeek = () => buildLanding(heroInput());

describe("the landing tests, as the design names them", () => {
  it("shows #6 · Landing hero and its first run, and no rebuild test", () => {
    expect(LANDING_TESTS.map((t) => t.name)).toEqual([
      "#6 · Landing hero",
      "#6 · Landing hero · first run (7–13 Oct)",
    ]);
    expect(LANDING_TESTS.flatMap((t) => t.arms)).not.toContain("white_prev");
  });

  it("names A the question card and B the presenter video, with no dates on the line", () => {
    screenData.payload = heroWeek();
    render(createElement(ApLanding));
    const table = screen.getByRole("table", { name: "Landing tests and variants" });
    const lines = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((r) => {
        const first = within(r).getAllByRole("cell")[0]!;
        return [first.children[0]!.textContent, first.children[1]!.textContent];
      });
    expect(lines).toEqual([
      ["#6 · Landing hero", "A · Question card"],
      ["#6 · Landing hero", "B · Presenter video"],
    ]);
  });

  it("drops the rebuild line and the How these are counted block", () => {
    screenData.payload = buildLanding({
      facts: factsFixture({ from: "2026-08-25", to: "2026-09-19" }),
      previous: null,
      filters: parseFilters({ period: "custom", from: "2026-08-25", to: "2026-09-19" }, today),
      today,
      now,
      armEngagement: {},
      engagement: null,
    });
    render(createElement(ApLanding));
    expect(screen.getAllByText("No landing test ran in this range.").length).toBeGreaterThan(0);
    for (const gone of [/Not in this range/, /How these are counted/, /Landing rebuild/])
      expect(screen.queryByText(gone)).toBeNull();
    expect(screenData.payload).not.toHaveProperty("outside");
    expect(screenData.payload).not.toHaveProperty("footnotes");
  });
});

describe("times are medians in whole seconds", () => {
  it("writes each version's median and the all-pages median, never a weighted average", () => {
    screenData.payload = heroWeek();
    render(createElement(ApLanding));
    const tests = screen.getByRole("table", { name: "Landing tests and variants" });
    const card = within(tests).getAllByRole("row")[1]!;
    expect(within(card).getAllByRole("cell").at(-1)!.textContent).toBe("5 s");
    const eng = screen.getByRole("table", { name: "Engagement per landing page" });
    const rows = within(eng).getAllByRole("row");
    // The video's 5.72 s, then the all-pages row's 4.763 s: both whole seconds.
    expect(within(rows.at(-2)!).getAllByRole("cell")[2]!.textContent).toBe("6 s");
    const all = rows.at(-1)!;
    expect(within(all).getByText("Every visit together · median time")).toBeTruthy();
    expect(within(all).getAllByRole("cell")[2]!.textContent).toBe("5 s");
    expect(screen.queryByText("Weighted average")).toBeNull();
    expect(screen.queryByText(/Avg\. time/)).toBeNull();
  });

  it("keeps the average beside the median in the export", () => {
    screenData.payload = heroWeek();
    render(createElement(ApLanding));
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const tables = screenData.exported as Array<{ name: string; table: Table }>;
    const cols = (name: string) =>
      tables.find((t) => t.name.startsWith(name))!.table.columns.map((c) => c.label);
    expect(cols("Tests and variants")).toEqual(
      expect.arrayContaining([
        "Avg. time (PostHog, each view up to 30 min)",
        "Median time (PostHog)",
      ])
    );
    expect(cols("Engagement per landing page")).toEqual(
      expect.arrayContaining(["Median time", "Avg. time (each view up to 30 min)"])
    );
    const eng = tables.find((t) => t.name.startsWith("Engagement"))!.table;
    expect(eng.rows.at(-1)).toMatchObject({
      label: "All landing pages · every visit together · median time",
    });
    // The card's own row: its median 5 s, its average (70 s) last.
    expect(eng.rows[0]!.values[1]).toBe("5 s");
    expect(eng.rows[0]!.values.at(-1)).toBe("1:11");
  });
});

describe("the headline tiles", () => {
  it("call the revenue tile Revenue / visitor, its card saying it divides by visits", () => {
    const p = heroWeek();
    expect(p.tiles.find((t) => t.key === "rev-visit")!.label).toBe("Revenue / visitor");
    expect(FIELDS["landing.rev-visit"]!.caveat).toMatch(
      /visits: the visit log counts a browser once a day/
    );
  });

  it("say in grey why the start rates have no comparison, never a bare dash", () => {
    const p = buildLanding({
      facts: factsFixture({ from: "2026-09-21", to: "2026-10-20" }),
      // The period before has its visits and finishers, but its starts read low (before 18 Sep).
      previous: factsFixture({
        from: "2026-08-22",
        to: "2026-09-20",
        visits: [{ day: "2026-09-01", arm: "white", src: null, n: 200 }],
        subs: [sub({ id: 9, day: "2026-09-01", at: "2026-09-01T10:00:00Z" })],
        money: [],
      }),
      filters: parseFilters({ period: "30d" }, today),
      today,
      now,
      armEngagement: {},
      engagement: null,
    });
    const note = (key: string) => p.tiles.find((t) => t.key === key)!.note;
    expect(note("start-cvr")).toBe("No comparison: earlier starts incomplete");
    expect(note("complete-cvr")).toBe("No comparison: earlier starts incomplete");
    // The other figures compare as before.
    expect(note("rev-visit")).toBeUndefined();
    // A range reaching back before the EUR 1.99 was on sale: blank with why, never 0%.
    expect(p.tiles.find((t) => t.key === "pre-cvr")).toMatchObject({
      value: null,
      blocked:
        "Pre-unlock figures start on 23 Oct 2026, its first whole day on sale (from the evening before): pick a range from that day on.",
    });
    screenData.payload = p;
    render(createElement(ApLanding));
    const grey = screen.getAllByText("No comparison: earlier starts incomplete");
    expect(grey).toHaveLength(2);
    for (const g of grey) expect(g).toHaveClass("text-ap-muted");
  });

  it("say no comparison while today runs on every compared tile", () => {
    const p = buildLanding({
      facts: factsFixture({ from: today, to: today, visits: [], starts: [], subs: [], money: [] }),
      previous: null,
      filters: parseFilters({ period: "today" }, today),
      today,
      now,
      armEngagement: {},
      engagement: null,
    });
    expect(p.tiles.map((t) => t.note)).toEqual([
      "No comparison while today runs",
      "No comparison while today runs",
      // Today (21 Oct) is before the EUR 1.99 was on sale: blank with why, no note.
      undefined,
      "No comparison while today runs",
      "No comparison while today runs",
      "No comparison while today runs",
    ]);
    expect(p.tiles[2]!.blocked).toMatch(/^Pre-unlock figures start on 23 Oct 2026/);
  });

  it("give each tile's card this range's numbers, as the tile writes them", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {}))
    );
    const p = heroWeek();
    screenData.payload = p;
    render(createElement(FieldInfoProvider, null, createElement(ApLanding)));
    const icon = screen.getByRole("button", { name: "About Survey start CVR" });
    fireEvent.click(icon);
    // Its icon stays violet while its card is open (the design), and only its own.
    expect(icon).toHaveAttribute("data-open");
    expect(icon.className).toContain("data-[open]:text-ap-purple");
    expect(document.querySelectorAll("[data-open]")).toHaveLength(1);
    const tile = p.tiles.find((t) => t.key === "start-cvr")!;
    const worked = `${fmt("count", p.counts.starts)} ÷ ${fmt("count", p.counts.visits)} = ${fmt("pct", tile.value)}`;
    expect(screen.getByText(worked)).toBeTruthy();
    expect(p.counts.starts! / p.counts.visits!).toBeCloseTo(tile.value!);
    expect(screen.getByText("Loading the last 12 weeks…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(icon).not.toHaveAttribute("data-open");
  });
});

describe("the pay-to-start section", () => {
  /** One pay-to-start funnel as the Pay to start page reads it, with its Step by step steps. */
  const funnel = (key: "full" | "pre", price: string, steps: number[]): PtsFunnel => {
    const [visits, checkout, paid, finished, paidFinished, paidStarted] = steps as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    const v = { visits, finished, paid, revenue: 0, revenueFinished: 0 };
    const all = { ...v, m: measuresOf(null, null, v) };
    return {
      key,
      label: `Pay to start · ${price}`,
      live: true,
      spend: null,
      clicks: null,
      all,
      ads: all,
      steps: [
        { label: "Visits", n: visits, pays: false },
        { label: "Checkout started", n: checkout, pays: false },
        { label: `Paid ${price}`, n: paid, pays: true },
        { label: "Survey finished", n: finished, pays: false },
        { label: "Report opened", n: finished, pays: false },
      ],
      paidFinished,
      paidStarted,
    };
  };
  const pts: PtsPayload = {
    range: { from: "2026-10-24", to: "2026-10-30" },
    funnels: [
      funnel("full", "€29.99", [400, 20, 8, 7, 6, 7]),
      // A 100% code's buyers finish too: 16 finished, 12 of the 15 who paid; 14 of them began.
      funnel("pre", "€1.99", [300, 30, 15, 16, 12, 14]),
    ],
    weeks: [],
    notes: ["4 visits to the pay-to-start pages came before the two pages were counted apart."],
  };

  it("draws each pay-to-start page with the Pay to start page's own step figures", () => {
    screenData.payload = buildLanding({ ...heroInput(), pts });
    render(createElement(ApLanding));
    const section = document.getElementById("pay-first")!;
    expect(
      within(section).getByRole("heading", { name: "Pay-to-start landing pages" })
    ).toBeTruthy();
    expect(section.textContent).toContain(
      "Landing pages with the price shown before the survey. The visitor pays first, then takes the survey. The same figures as the Pay to start page, step by step."
    );
    const table = within(section).getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent)
    ).toEqual([
      "Landing page",
      "Visitors",
      "Saw the price",
      "Started checkout",
      "Paid",
      "Visitor → paid",
      "Started survey",
      "Paid → completed",
    ]);
    const [, full, pre] = within(table).getAllByRole("row");
    expect(within(full!).getByRole("rowheader")).toHaveTextContent(
      "/sexual-archetype · €29.99Pay to start · full"
    );
    // What the eye reads, and the colour: the better page green, the other red, as drawn.
    const seen = (row: HTMLElement) =>
      within(row)
        .getAllByRole("cell")
        .map((c) => {
          const copy = c.cloneNode(true) as HTMLElement;
          copy.querySelectorAll(".sr-only").forEach((x) => x.remove());
          const tone = c.className.includes("bg-ap-good")
            ? "+"
            : c.className.includes("bg-ap-bad")
              ? "-"
              : "";
          return `${copy.textContent}${tone}`;
        });
    expect(seen(full!)).toEqual(["400", "—", "20-", "8-", "2.00%-", "7", "75%-"]);
    // Paid → completed is of the paying buyers only: 12 of 15, never above 100%.
    expect(seen(pre!)).toEqual(["300", "—", "30+", "15+", "5.00%+", "14", "80%+"]);
    // Saw the price is no step on these pages: blank, with no card, and the note says why.
    for (const h of within(table).getAllByRole("columnheader").slice(1))
      expect(within(h).queryByRole("button", { name: /^About / }) !== null).toBe(
        h.textContent !== "Saw the price"
      );
    expect(section.textContent).toContain(
      "Saw the price: the price is on screen from the first moment on every device"
    );
    // The board's note: what the two new columns count, from the stamp's first day.
    expect(section.textContent).toContain(
      `Started survey: paying buyers whose survey saved an answer or was finished (recorded from ${rangeLabel(SURVEY_STARTED_FROM, SURVEY_STARTED_FROM)}). Paid → completed: of the paying buyers, those who finished.`
    );
    expect(section.textContent).toContain(pts.notes[0]);
    // `relative`: the cells' sr-only words stay in the box, or they widen the page on a phone.
    expect(
      within(section).getByRole("region", { name: "Pay-to-start landing pages, scrolls sideways" })
    ).toHaveClass("overflow-x-auto", "relative");
  });

  it("says so when Pay to start's figures couldn't be read", () => {
    screenData.payload = heroWeek();
    render(createElement(ApLanding));
    const section = document.getElementById("pay-first")!;
    expect(section.textContent).toContain(
      "Pay to start’s figures could not be read just now. Try again in a minute."
    );
    expect(within(section).queryByRole("table")).toBeNull();
  });
});

describe("Started survey's first day", () => {
  it("is the same day in the card as in the code that counts from it", () => {
    // A hand-written date: set SURVEY_STARTED_FROM at the deploy, and this keeps the card in step.
    expect(FIELDS["landing.pf-started"]!.caveat).toContain(
      rangeLabel(SURVEY_STARTED_FROM, SURVEY_STARTED_FROM)
    );
  });
});

describe("an info icon on every figure", () => {
  it("puts one on each tile and on each numeric column of both tables, each defined", () => {
    screenData.payload = heroWeek();
    render(createElement(ApLanding));
    const icons = screen.getAllByRole("button", { name: /^About / });
    // Six tiles, the tests table's eight figures, the engagement table's seven, the hero
    // video's eight steps …and the three section titles.
    expect(icons).toHaveLength(6 + 8 + 7 + 8 + 3);
    for (const i of icons) expect(i.getAttribute("title")).not.toBe("Not defined yet.");
    const tests = screen.getByRole("table", { name: "Landing tests and variants" });
    for (const h of within(tests).getAllByRole("columnheader").slice(2))
      expect(within(h).getByRole("button", { name: /^About / })).toBeTruthy();
    const eng = screen.getByRole("table", { name: "Engagement per landing page" });
    const figures = within(eng)
      .getAllByRole("columnheader")
      .filter((h) => /^(Bounce|Median time|CTA clicks|\d+%)$/.test(h.textContent ?? ""));
    expect(figures).toHaveLength(7);
    for (const h of figures)
      expect(within(h).getByRole("button", { name: /^About / })).toBeTruthy();
  });

  it("gives each hero video step's card this range's numbers", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {}))
    );
    screenData.payload = heroWeek();
    render(createElement(FieldInfoProvider, null, createElement(ApLanding)));
    fireEvent.click(screen.getByRole("button", { name: "About Started" }));
    // 8 of the 364 who saw it: the hand count's 2.2%.
    expect(screen.getByText("8 ÷ 364 = 2.2%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "About Saw the video" }));
    expect(within(document.querySelector("dialog")!).getByText("364")).toBeTruthy();
  });

  it("says for every landing field whether it is a share, an average or a median, and per what", () => {
    const keys = Object.keys(FIELDS).filter((k) => k.startsWith("landing."));
    // 27, and the hero video's block and its eight steps (29 Oct 2026).
    expect(keys).toHaveLength(36);
    for (const k of keys) {
      expect(FIELDS[k]!.stat, k).toMatch(/^(Share|Average|Median|Count)$/);
      expect(FIELDS[k]!.per, k).toMatch(/^per /);
    }
    expect(FIELDS["landing.median-time"]!.stat).toBe("Median");
  });
});

describe("the hero video block", () => {
  beforeEach(() => {
    // A pointer event that carries its pointerType, as a browser's does (jsdom has none).
    if (!("PointerEvent" in window)) {
      class PE extends MouseEvent {
        pointerType: string;
        constructor(type: string, init: PointerEventInit = {}) {
          super(type, init);
          this.pointerType = init.pointerType ?? "mouse";
        }
      }
      vi.stubGlobal("PointerEvent", PE);
    }
  });

  it("reads a step out on a tap: its people, its share of those who saw it, and of those who started", () => {
    screenData.payload = heroWeek();
    render(createElement(ApLanding));
    const table = screen.getByRole("table", { name: "Hero video, step by step" });
    fireEvent.pointerDown(within(table).getByRole("row", { name: /Reached 25%/ }), {
      pointerType: "touch",
    });
    const card = document.querySelector("[data-ap-tip]");
    expect(card).toHaveTextContent("Reached 25%");
    expect(card).toHaveTextContent("People6");
    expect(card).toHaveTextContent("Of those who saw it1.6%");
    // 6 of the 8 whose film started: how far a watch goes.
    expect(card).toHaveTextContent("Of those who started it75%");
  });

  it("draws the bar from a tablet up, the failed starts in red and apart", () => {
    screenData.payload = heroWeek();
    render(createElement(ApLanding));
    const table = screen.getByRole("table", { name: "Hero video, step by step" });
    const groups = within(table).getAllByRole("rowgroup");
    expect(groups.map((g) => within(g).getAllByRole("row").length)).toEqual([7, 1]);
    // The bar is the row's last part: hidden from a screen reader, which hears the figures.
    const bar = within(groups[1]!).getByRole("row").lastElementChild as HTMLElement;
    expect(bar).toHaveAttribute("aria-hidden", "true");
    expect(bar).toHaveClass("hidden", "sm:flex");
    const fill = bar.querySelector(".h-full") as HTMLElement;
    expect(fill.style.background).toMatch(/^(rgb\(214, 50, 0\)|#d63200)$/i);
  });

  it("exports its steps: people, and each one's share of those who saw it", () => {
    screenData.payload = heroWeek();
    render(createElement(ApLanding));
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const tables = screenData.exported as Array<{ name: string; table: Table }>;
    const video = tables.find((t) => t.name.startsWith("Hero video"))!;
    expect(video.name).toBe("Hero video (PostHog, 14 Oct – 20 Oct 2026)");
    expect(video.table.columns.map((c) => c.label)).toEqual([
      "Step",
      "People",
      "Of those who saw it",
    ]);
    expect(video.table.rows[2]).toEqual({ label: "Started", values: [8, 8 / 364] });
  });

  it("says under it that Tapped play isn't recorded yet, and points to Started", () => {
    screenData.payload = heroWeek();
    render(createElement(ApLanding));
    expect(document.getElementById("hero-video")!.textContent).toContain(
      "Tapped play is recorded only since its release, so here it counts fewer people than Started: Started, a tap whose film began, is the closest measure for the days before it."
    );
  });
});

describe("the hero video's info cards", () => {
  const VIDEO_KEYS = [
    "landing.hero-video",
    "landing.video-saw",
    "landing.video-tapped",
    "landing.video-started",
    "landing.video-25",
    "landing.video-50",
    "landing.video-75",
    "landing.video-finished",
    "landing.video-failed",
  ];

  it("count people, from the day the page reads from, and warn that bots lower every share", () => {
    for (const k of VIDEO_KEYS) {
      const f = FIELDS[k]!;
      expect(f.per, k).toBe("per person PostHog recorded");
      expect(f.caveat, k).toContain(rangeLabel(HERO_VIDEO_SEEN_FROM, HERO_VIDEO_SEEN_FROM));
      expect(f.caveat, k).toMatch(/About 11% of version B's visitors look like bots/);
      expect(f.caveat, k).toMatch(/every share here reads a little low/);
      // The query the block runs: from the same day, the forced versions and the team left out.
      expect(f.query.lang, k).toBe("HogQL");
      expect(f.query.text, k).toContain(
        `timestamp >= toDateTime('${HERO_VIDEO_SEEN_FROM} 00:00:00', 'Europe/Berlin')`
      );
      expect(f.query.text, k).toContain("match(toString(properties.$current_url), '[?&]variant=')");
      expect(f.query.text, k).toContain("$session_id IN :team_visits");
    }
  });

  it("say Tapped play reads 0 before its release, Started being the closest earlier measure", () => {
    const tapped = FIELDS["landing.video-tapped"]!.caveat!;
    expect(tapped).toMatch(
      /recorded only since the release that added it, so a range before then reads 0/
    );
    expect(tapped).toMatch(/Until then Started is the closest measure/);
    expect(FIELDS["landing.video-started"]!.related).toContain("landing.video-tapped");
  });

  it("say why a start failed, abandoned among the reasons and new", () => {
    const failed = FIELDS["landing.video-failed"]!;
    expect(failed.good).toBe("down");
    for (const reason of ["media-error-N", "paused-before-playing", "timeout", "abandoned"])
      expect(failed.caveat).toContain(reason);
    expect(failed.caveat).toMatch(/abandoned is new/);
    // The muted loop's errors were no tap's: left out.
    expect(failed.query.text).toContain("properties.video = 'full'");
  });
});
