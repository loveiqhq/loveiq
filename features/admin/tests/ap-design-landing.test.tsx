// @vitest-environment jsdom
/**
 * The Landing page as Marcus's design and the 21 Oct 2026 call left it: the tests renamed, the
 * rebuild test and "How these are counted" gone, median times, the pay-to-start section, the
 * tiles' grey "No comparison" reasons, and an info icon on every figure.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
import { parseFilters } from "@features/admin/server/ap/filters";
import { fmt } from "@features/admin/server/ap/format";
import { buildLanding, LANDING_TESTS } from "@features/admin/server/ap/landing";
import {
  measuresOf,
  type PtsFunnel,
  type PtsPayload,
} from "@features/admin/server/ap/pay-to-start";
import type { LandingArmEngagement } from "@features/admin/server/ap/posthog";
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
    fireEvent.click(screen.getByRole("button", { name: "About Survey start CVR" }));
    const tile = p.tiles.find((t) => t.key === "start-cvr")!;
    const worked = `${fmt("count", p.counts.starts)} ÷ ${fmt("count", p.counts.visits)} = ${fmt("pct", tile.value)}`;
    expect(screen.getByText(worked)).toBeTruthy();
    expect(p.counts.starts! / p.counts.visits!).toBeCloseTo(tile.value!);
    expect(screen.getByText("Loading the last 12 weeks…")).toBeTruthy();
  });
});

describe("the pay-to-start section", () => {
  /** One pay-to-start funnel as the Pay to start page reads it, with its Step by step steps. */
  const funnel = (key: "full" | "pre", price: string, steps: number[]): PtsFunnel => {
    const [visits, checkout, paid, finished] = steps as [number, number, number, number];
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
    };
  };
  const pts: PtsPayload = {
    range: { from: "2026-10-24", to: "2026-10-30" },
    funnels: [funnel("full", "€29.99", [400, 20, 8, 7]), funnel("pre", "€1.99", [300, 30, 15, 16])],
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
      "Started checkout",
      "Paid",
      "Visitor → paid",
      "Finished survey",
    ]);
    const [, full, pre] = within(table).getAllByRole("row");
    expect(within(full!).getByRole("rowheader")).toHaveTextContent(
      "/sexual-archetype · €29.99Pay to start · full"
    );
    expect(
      within(full!)
        .getAllByRole("cell")
        .map((c) => c.textContent)
    ).toEqual(["400", "20", "8", "2.00%", "7"]);
    // A 100% code's buyer finishes too: Finished survey is no share of Paid.
    expect(
      within(pre!)
        .getAllByRole("cell")
        .map((c) => c.textContent)
    ).toEqual(["300", "30", "15", "5.00%", "16"]);
    for (const h of within(table).getAllByRole("columnheader").slice(1))
      expect(within(h).getByRole("button", { name: /^About / })).toBeTruthy();
    expect(section.textContent).toContain(pts.notes[0]);
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

describe("an info icon on every figure", () => {
  it("puts one on each tile and on each numeric column of both tables, each defined", () => {
    screenData.payload = heroWeek();
    render(createElement(ApLanding));
    const icons = screen.getAllByRole("button", { name: /^About / });
    // Six tiles, the tests table's eight figures, the engagement table's seven.
    // …and the two section titles.
    expect(icons).toHaveLength(6 + 8 + 7 + 2);
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

  it("says for every landing field whether it is a share, an average or a median, and per what", () => {
    const keys = Object.keys(FIELDS).filter((k) => k.startsWith("landing."));
    expect(keys).toHaveLength(26);
    for (const k of keys) {
      expect(FIELDS[k]!.stat, k).toMatch(/^(Share|Average|Median|Count)$/);
      expect(FIELDS[k]!.per, k).toMatch(/^per /);
    }
    expect(FIELDS["landing.median-time"]!.stat).toBe("Median");
  });
});
