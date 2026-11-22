// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Table } from "@features/admin/server/ap/common";
import type { GateTestBlock } from "@features/admin/server/ap/gate-reveal-test";
import {
  measuresOf,
  type FunnelKey,
  type FunnelPaywallPayload,
  type PtsFunnel,
  type PtsStep,
  type PtsView,
} from "@features/admin/server/ap/pay-to-start";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const view = vi.hoisted(() => ({ payload: null as unknown }));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: () => ({ data: view.payload, loading: false, error: null, refetch: () => {} }),
}));
vi.mock("@features/admin/ui/ap/useApFilters", () => ({ useApFilters: () => ({ params: {} }) }));
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({ default: () => null }));
const exported = vi.hoisted(() => ({ sections: [] as Array<{ name: string; table: Table }> }));
vi.mock("@features/admin/ui/ap/csv", () => ({
  exportTables: (_file: string, sections: Array<{ name: string; table: Table }>) => {
    exported.sections = sections;
  },
}));

import { DEFAULT_ASSUMPTIONS } from "@features/admin/server/ap/traffic-math";
import ApPayToStart, { bandWidth } from "@features/admin/ui/ap/ApPayToStart";
import { FIELDS } from "@features/admin/ui/ap/fields";

const funnel = (
  key: FunnelKey,
  label: string,
  live: boolean,
  spend: number | null,
  clicks: number | null,
  all: PtsView,
  ads: PtsView,
  steps: PtsStep[]
): PtsFunnel => ({
  key,
  label,
  live,
  spend,
  clicks,
  all: { ...all, m: measuresOf(spend, clicks, all) },
  ads: { ...ads, m: measuresOf(spend, clicks, ads) },
  steps,
});

const s = (label: string, n: number | null, pays = false): PtsStep => ({ label, n, pays });

/** #11 outside the fixture's range: its section says why, and the funnels below still show. */
const noTest: GateTestBlock = {
  test: "#11 · New €1.99 page",
  note: "Since 17 Nov 2026 · not in this range",
  arms: [],
  lift: null,
  confidence: null,
  liftWhy: null,
  verdict: "",
  why: "Not running in this range: the test began on 17 Nov 2026 at 10:01. Pick a range that reaches it.",
};

const payload: FunnelPaywallPayload = {
  gateTest: noTest,
  range: { from: "2026-10-12", to: "2026-10-22" },
  funnels: [
    funnel(
      "after",
      "Pay after the report",
      true,
      900,
      1200,
      { visits: 6000, finished: 300, paid: 2, revenue: 59.98, revenueFinished: 59.98 },
      { visits: 1200, finished: 260, paid: 1, revenue: 29.99, revenueFinished: 29.99 },
      [
        s("Visits", 6000),
        s("Survey started", 500),
        s("Survey finished", 300),
        s("Report opened", 290),
        s("Checkout started", 10),
        s("Paid", 2, true),
      ]
    ),
    funnel(
      "full",
      "Pay to start · €29.99",
      true,
      450,
      600,
      { visits: 500, finished: 5, paid: 6, revenue: 179.94, revenueFinished: 179.94 },
      { visits: 600, finished: 5, paid: 6, revenue: 179.94, revenueFinished: 179.94 },
      [
        s("Visits", 500),
        s("Checkout started", 26),
        s("Paid €29.99", 6, true),
        s("Survey finished", 5),
        s("Report opened", 5),
      ]
    ),
    funnel(
      "pre",
      "Pay to start · €1.99",
      true,
      450,
      640,
      { visits: 560, finished: 29, paid: 31, revenue: 121.66, revenueFinished: 121.66 },
      { visits: 640, finished: 28, paid: 30, revenue: 117.67, revenueFinished: 117.67 },
      [
        s("Visits", 560),
        s("Checkout started", 70),
        s("Paid €1.99", 31, true),
        s("Survey finished", 29),
        s("Report opened", 28),
        s("Bought the full report", 3, true),
      ]
    ),
    funnel(
      "gate",
      "€1.99 after the survey",
      false,
      0,
      0,
      { visits: 0, finished: 0, paid: 0, revenue: 0, revenueFinished: 0 },
      { visits: 0, finished: 0, paid: 0, revenue: 0, revenueFinished: 0 },
      [s("Visits", 0), s("Paid €1.99", 0, true)]
    ),
  ],
  weeks: [
    {
      from: "2026-10-12",
      to: "2026-10-18",
      label: "12 Oct",
      funnels: {
        after: { cac: 450, cvr: 0.0003, roas: 0.03 },
        full: { cac: null, cvr: null, roas: null },
        pre: { cac: 15, cvr: 0.05, roas: 0.27 },
        gate: { cac: null, cvr: null, roas: null },
      },
    },
    {
      from: "2026-10-19",
      to: "2026-10-22",
      label: "19 Oct",
      funnels: {
        after: { cac: null, cvr: 0, roas: 0 },
        full: { cac: 75, cvr: 0.012, roas: 0.4 },
        pre: { cac: 14, cvr: 0.055, roas: 0.3 },
        gate: { cac: null, cvr: null, roas: null },
      },
    },
  ],
  notes: ["No ad in this range lands on a pay-to-start page yet."],
};

afterEach(cleanup);

const table = () => screen.getByRole("table", { name: /Funnel metrics compared/ });
const row = (label: string) =>
  within(table())
    .getAllByRole("row")
    .find((r) => within(r).queryByRole("rowheader")?.textContent?.startsWith(label))!;
/** What a cell shows on screen: its text without the words only a screen reader hears. */
const shown = (el: Element) => {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll(".sr-only").forEach((x) => x.remove());
  return copy.textContent;
};
const cells = (label: string) => within(row(label)).getAllByRole("cell").map(shown);

describe("the funnel picture's bands (bandWidth)", () => {
  it("narrows by a quarter for each tenth of the visits, never to nothing above none", () => {
    expect([1, 0.1, 0.01, 0.001].map(bandWidth)).toEqual([100, 75, 50, 25]);
    expect(bandWidth(0.00001)).toBe(4);
    expect([0, -1, Number.NaN].map(bandWidth)).toEqual([0, 0, 0]);
    expect(bandWidth(2)).toBe(100);
  });
});

describe("ApPayToStart", () => {
  it("lays the four funnels side by side, the gate off, the three core KPIs marked", () => {
    view.payload = payload;
    render(<ApPayToStart />);
    const head = within(table())
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(head).toEqual([
      "Measure",
      "Pay after the reportLive",
      "Pay to start · €29.99Live",
      "Pay to start · €1.99Live",
      "€1.99 after the surveyOff",
    ]);
    expect(cells("Ad spend")).toEqual(["€900", "€450", "€450", "—"]);
    expect(cells("Visit → paying customer")).toEqual(["<0.1%", "1.2%", "5.5%", "—"]);
    expect(cells("Revenue per visit")).toEqual(["€0.010", "€0.360", "€0.217", "—"]);
    expect(cells("ROAS")).toEqual(["0.07×", "0.40×", "0.27×", "—"]);
    expect(cells("Return on ad spend (€)")).toEqual(["−€840.02", "−€270.06", "−€328.34", "—"]);
    // Mark: profit (contribution, as Traffic counts it) per customer and per completion.
    expect(cells("Profit per paying customer")).toEqual(["−€428.63", "−€46.17", "−€11.00", "—"]);
    expect(cells("Profit per survey completion")).toEqual(["−€2.86", "−€55.41", "−€11.76", "—"]);
    const core = within(table())
      .getAllByText("Core")
      .map((c) => c.closest("tr")!.querySelector("th")!.textContent);
    expect(core).toEqual([
      "Visit → paying customer\u00a0Core",
      "Revenue per visit\u00a0Core",
      "ROAS\u00a0Core",
    ]);
  });

  it("marks the best of the running funnels green and the worst red, lower cost the better", () => {
    view.payload = payload;
    render(<ApPayToStart />);
    const tone = (label: string) =>
      within(row(label))
        .getAllByRole("cell")
        .map((c) =>
          c.className.includes("text-ap-good-ink")
            ? "good"
            : c.className.includes("text-ap-bad-ink")
              ? "bad"
              : "plain"
        );
    expect(tone("Visit → paying customer")).toEqual(["bad", "plain", "good", "plain"]);
    expect(tone("Cost per paying customer")).toEqual(["bad", "plain", "good", "plain"]);
    // A count is no better for being bigger: never coloured.
    expect(tone("Paying customers")).toEqual(["plain", "plain", "plain", "plain"]);
  });

  it("switches the table to paid traffic only: ad clicks as visits, spend unchanged", () => {
    view.payload = payload;
    render(<ApPayToStart />);
    expect(screen.queryByText(/Paid traffic only: visits are the ad clicks/)).toBeNull();
    // Mark, 23 Oct: the completions as a number, and why visits outnumber the ad clicks.
    expect(cells("Survey completions")).toEqual(["300", "5", "29", "—"]);
    expect(screen.getByText(/so there are usually more of them than ad clicks/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Paid traffic only" }));
    expect(cells("Visits")).toEqual(["1,200", "600", "640", "—"]);
    expect(cells("Survey completions")).toEqual(["260", "5", "28", "—"]);
    expect(screen.queryByText(/so there are usually more of them than ad clicks/)).toBeNull();
    expect(cells("Paying customers")).toEqual(["1", "6", "30", "—"]);
    expect(cells("Ad spend")).toEqual(["€900", "€450", "€450", "—"]);
    expect(screen.getByText(/Paid traffic only: visits are the ad clicks/)).toBeTruthy();
  });

  it("walks each funnel step by step, every step a share of its own visits", () => {
    view.payload = payload;
    render(<ApPayToStart />);
    const card = screen.getByRole("region", { name: "Pay to start · €1.99" });
    const items = within(card)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(items).toEqual([
      "Visits\u00a0560 100.0%",
      "Checkout started\u00a070 12.5%",
      // Mark, 23 Oct: the market's figure beside ours, on the same base.
      "Paid €1.99\u00a031 5.5%Market 51% of checkouts · here 44.3%Market 1.4% of visits",
      "Survey finished\u00a029 5.2%",
      "Report opened\u00a028 5.0%",
      "Bought the full report\u00a03 0.5%",
    ]);
    // Mark, 23 Oct: a funnel picture, each band narrowing with its step's share of the visits
    // (log scale): 560 visits (100%, full width) down to 70 checkouts (12.5%: 77.42 wide).
    const bands = within(card)
      .getAllByRole("listitem")
      .map((li) => li.querySelector("polygon")?.getAttribute("points"));
    expect(bands[0]).toBe("0,0 100,0 88.71,100 11.29,100");
    // The last step (0.54%: 43.22 wide) narrows to itself.
    expect(bands.at(-1)).toBe("28.39,0 71.61,0 71.61,100 28.39,100");
    // Out of the flow, so the text sets each row's height, not the band's square viewBox.
    const svg = within(card).getAllByRole("listitem")[0]!.querySelector("svg")!;
    expect(svg.getAttribute("class")).toContain("absolute inset-0");
    expect(svg.parentElement!.className).toContain("relative");
    // The free funnel: the survey's references, its finish rate of its own starts.
    const free = screen.getByRole("region", { name: "Pay after the report" });
    const freeItems = within(free)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(freeItems[1]).toBe("Survey started\u00a0500 8.3%Market ≈52.7% of visits");
    expect(freeItems[2]).toBe("Survey finished\u00a0300 5.0%Market ≈59.1% of starts · here 60.0%");
    expect(within(card).getByText("€121.66")).toBeTruthy();
    expect(within(card).getByText("€0.217")).toBeTruthy();
    // Only the funnel's name on the card (Marcus, 23 Oct): off is dimmed, dashed and named.
    const off = screen.getByRole("region", { name: "€1.99 after the survey (off)" });
    expect(off.className).toContain("border-dashed");
    expect(within(off).getAllByText("—").length).toBeGreaterThan(0);
    expect(off.textContent).not.toContain("Off");
  });

  // The €1.99 page's buttons and its way out (27 Oct; since 28 Oct "Not ready" opens the exit
  // page, which has Unlock buttons of its own): a line under the steps that split.
  it("says under the gate's steps who pressed Not ready and which button was pressed", () => {
    const live: PtsPayload = {
      ...payload,
      funnels: payload.funnels.map((f) =>
        f.key !== "gate"
          ? f
          : {
              ...f,
              live: true,
              all: { ...f.all, visits: 100 },
              steps: [
                s("Visits", 100),
                {
                  ...s("Saw the €1.99 page", 40),
                  detail: "6 pressed “Not ready to unlock yet”",
                },
                {
                  ...s("Pressed Unlock", 12),
                  detail: "on the card 7 · on the bar 6 · on the exit page 2",
                },
                s("Paid €1.99", 9, true),
              ],
            }
      ),
    };
    view.payload = live;
    render(<ApPayToStart />);
    const card = screen.getByRole("region", { name: "€1.99 after the survey" });
    const items = within(card)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(items[1]).toBe("Saw the €1.99 page\u00a040 40.0%6 pressed “Not ready to unlock yet”");
    expect(items[2]).toBe(
      "Pressed Unlock\u00a012 12.0%on the card 7 · on the bar 6 · on the exit page 2"
    );
    // Every step, the new one too, says what it counts.
    expect(within(card).getAllByRole("button", { name: /about pressed unlock/i }).length).toBe(1);
  });

  it("says when a live funnel has no week in the range, rather than key a line drawn nowhere", () => {
    view.payload = {
      ...payload,
      weeks: payload.weeks.map((w) => ({
        ...w,
        funnels: { ...w.funnels, full: { cac: null, cvr: null, roas: null } },
      })),
    };
    render(<ApPayToStart />);
    expect(screen.getByText("Pay to start · €29.99 · no week in this range")).toBeTruthy();
    // A funnel with a line keeps its plain label.
    expect(screen.queryByText("Pay after the report · no week in this range")).toBeNull();
  });

  it("draws a line per funnel by week, the gate's legend saying it is off", () => {
    view.payload = payload;
    render(<ApPayToStart />);
    expect(
      screen.getByText("€1.99 after the survey · off, line starts when switched on")
    ).toBeTruthy();
    const weeks = screen.getByRole("table", { name: /per week, per funnel/ });
    expect(within(weeks).getAllByRole("row")[1]!.textContent).toBe(
      "12 Oct – 18 Oct 2026€450—€15off"
    );
    fireEvent.click(screen.getByRole("button", { name: "ROAS" }));
    expect(within(weeks).getAllByRole("row")[2]!.textContent).toBe(
      "19 Oct – 22 Oct 20260.00×0.40×0.30×off"
    );
    expect(screen.getByRole("group", { name: /ROAS per week, per funnel/ })).toBeTruthy();
  });

  it("exports both traffic views, the steps and the weeks as plain figures", () => {
    view.payload = payload;
    render(<ApPayToStart />);
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(exported.sections.map((x) => x.name)).toEqual([
      "Funnel metrics, paid + organic",
      "Funnel metrics, paid traffic only",
      "Step by step",
      "Week by week (ads and organic)",
    ]);
    const all = exported.sections[0]!.table;
    const cvr = all.rows.find((r) => r.label === "Conversion: Visit → paying customer (%)")!;
    // Four decimals: a small rate is never written as 0.
    expect(cvr.values).toEqual(["0.0333", "1.2", "5.5357", ""]);
    const paid = exported.sections[1]!.table.rows.find((r) => r.label === "Conversion: Visits")!;
    expect(paid.values).toEqual(["1200", "600", "640", ""]);
    // The gate is off: no steps of its own.
    expect(
      exported.sections[2]!.table.rows.every((r) => r.label !== "€1.99 after the survey")
    ).toBe(true);
  });

  it("says best and worst in words too, not by colour alone", () => {
    view.payload = payload;
    render(<ApPayToStart />);
    const [after, , pre] = within(row("Visit → paying customer")).getAllByRole("cell");
    expect(after!.textContent).toBe("<0.1% (worst of the running funnels)");
    expect(pre!.getAttribute("title")).toBe("best of the running funnels");
    // Safari paints no box-shadow on a table row: the core accent is on its header cell.
    expect(row("ROAS").className).not.toContain("shadow");
    expect(within(row("ROAS")).getByRole("rowheader").className).toContain(
      "shadow-[inset_4px_0_0_#795fc8]"
    );
  });

  it("never writes a figure above zero as zero, and a break-even as +€0.00", () => {
    const tiny = structuredClone(payload);
    const after = tiny.funnels[0]!;
    after.all.m = { ...after.all.m, rpv: 0.0002, cvr: 0.00002, net: 0, roas: 0.004 };
    // Revenue per visit keeps three decimals above €1 too.
    tiny.funnels[1]!.all.m = { ...tiny.funnels[1]!.all.m, rpv: 1.2 };
    view.payload = tiny;
    render(<ApPayToStart />);
    expect(cells("Revenue per visit").slice(0, 2)).toEqual(["<€0.001", "€1.200"]);
    expect(cells("Visit → paying customer")[0]).toBe("<0.1%");
    expect(cells("Return on ad spend (€)")[0]).toBe("+€0.00");
    expect(cells("ROAS")[0]).toBe("<0.01×");
  });

  it("writes the conversion axis in whole tenths of a point, even for small rates", () => {
    const small = structuredClone(payload);
    for (const w of small.weeks)
      for (const k of Object.keys(w.funnels) as FunnelKey[])
        if (w.funnels[k].cvr !== null) w.funnels[k].cvr = Math.min(w.funnels[k].cvr!, 0.0003);
    view.payload = small;
    render(<ApPayToStart />);
    fireEvent.click(screen.getByRole("button", { name: "Visit → paying customer" }));
    const chart = screen.getByRole("group", {
      name: /Visit → paying customer per week, per funnel/,
    });
    // 0.03% at most: lines at 0.1% steps, each written exactly, never "<0.1%" on the axis.
    for (const t of ["0.0%", "0.1%", "0.2%", "0.3%", "0.4%"])
      expect(within(chart.parentElement!).getAllByText(t).length).toBeGreaterThan(0);
  });

  it("says so when no funnel has a figure for the measure, instead of an empty axis", () => {
    const none = structuredClone(payload);
    for (const w of none.weeks)
      for (const k of Object.keys(w.funnels) as FunnelKey[]) w.funnels[k].cac = null;
    view.payload = none;
    render(<ApPayToStart />);
    expect(screen.getByText("No funnel has a figure for this in the range.")).toBeTruthy();
    // No axis, no read-out: the chart itself is gone.
    expect(screen.queryByRole("group", { name: /per week, per funnel/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ROAS" }));
    expect(screen.queryByText("No funnel has a figure for this in the range.")).toBeNull();
    expect(screen.getByRole("group", { name: /ROAS per week, per funnel/ })).toBeTruthy();
  });

  it("names every week up to 14, then every other one, the latest always", () => {
    const named = (n: number) => {
      const long = structuredClone(payload);
      long.weeks = Array.from({ length: n }, (_, i) => ({
        ...payload.weeks[0]!,
        from: `2026-${String(1 + Math.floor(i / 4)).padStart(2, "0")}-${String(1 + (i % 4) * 7).padStart(2, "0")}`,
        label: `W${i + 1}`,
      }));
      view.payload = long;
      const { unmount } = render(<ApPayToStart />);
      const out = screen.queryAllByText(/^W\d+$/).map((x) => x.textContent);
      unmount();
      return out;
    };
    expect(named(14)).toHaveLength(14);
    expect(named(15)).toEqual(["W1", "W3", "W5", "W7", "W9", "W11", "W13", "W15"]);
    expect(named(20)).toEqual(["W2", "W4", "W6", "W8", "W10", "W12", "W14", "W16", "W18", "W20"]);
  });

  it("keeps the table's screen-reader words inside its own scroll box", () => {
    view.payload = payload;
    render(<ApPayToStart />);
    // Absolutely placed sr-only words need a placed box, or they widen the page on a phone.
    const box = table().parentElement!;
    expect(box.className).toContain("overflow-x-auto");
    expect(box.className).toContain("relative");
  });

  it("puts an info card on every figure: each row, each step, the cards' totals and the weekly chart", () => {
    view.payload = payload;
    render(<ApPayToStart />);
    const about = (scope: HTMLElement) =>
      within(scope)
        .getAllByRole("button", { name: /^About / })
        .map((b) => [b.getAttribute("aria-label")!.slice(6), b.getAttribute("title")]);
    // The table: every measure's row header, none of them only a hover hint any more.
    // (The Ads, Conversion and Money group headings are no figures.)
    const rows = within(table())
      .getAllByRole("rowheader")
      .filter((th) => th.getAttribute("scope") === "row");
    expect(rows.length).toBe(18);
    for (const r of rows) {
      expect(r.getAttribute("title")).toBeNull();
      const [[name, title]] = about(r) as [[string, string | null]];
      expect(r.textContent).toContain(name);
      expect(title).not.toBe("Not defined yet.");
    }
    // Every step of every card, and each card's two totals.
    const cards = screen
      .getAllByRole("region")
      .filter((x) => x.hasAttribute("aria-label") && x.querySelector("ol"));
    expect(cards.length).toBe(4);
    for (const card of cards) {
      const steps = within(card).getAllByRole("listitem");
      const icons = about(card);
      expect(icons.length, card.getAttribute("aria-label")!).toBe(steps.length + 2);
      for (const [, title] of icons) expect(title).not.toBe("Not defined yet.");
    }
    // The weekly chart's own card, beside its heading.
    expect(screen.getByRole("button", { name: "About Week by week" }).title).not.toBe(
      "Not defined yet."
    );
  });

  it("writes the profit cards' fees and running cost as the page works them out", () => {
    // The cards say the numbers in words; the page takes them from the Traffic page's defaults.
    const { feePct, feeFix, varCost } = DEFAULT_ASSUMPTIONS;
    for (const k of ["pts.ppc", "pts.ppf"]) {
      const num = FIELDS[k]!.formula.num;
      expect(FIELDS[k]!.formula.num, k).toContain(
        k === "pts.ppc" ? `card fees (${feePct}% + €${feeFix.toFixed(2)} a payment)` : "card fees"
      );
      expect(num, k).toContain(`€${varCost.toFixed(2)} per finished survey`);
    }
  });

  it("links the market figures' sources, drawn as links", () => {
    view.payload = payload;
    render(<ApPayToStart />);
    for (const name of ["Riddle, State of Interactive Content 2026", "Littledata"]) {
      const link = screen.getByRole("link", { name });
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      // Tailwind's base drops a link's colour and underline: these set them back.
      expect(link.className).toContain("text-ap-plum");
      expect(link.className).toContain("underline");
    }
  });

  it("shows the notes under the page", () => {
    view.payload = payload;
    render(<ApPayToStart />);
    expect(screen.getByText("No ad in this range lands on a pay-to-start page yet.")).toBeTruthy();
  });
});

describe("Funnel and paywall (Marcus, 19 Nov 2026)", () => {
  const running: GateTestBlock = {
    ...noTest,
    note: "Since 17 Nov 2026 · live",
    why: null,
    verdict:
      "Not enough data to call this yet: the smallest group has 40 finishers. Treat any difference as noise for now.",
    arms: [
      {
        arm: "control",
        name: "Today's €1.99 page",
        control: true,
        finishers: 40,
        reached: 38,
        paid: 4,
        paidReached: 4,
        full: 1,
      },
      {
        arm: "reveal",
        name: "New page: Core Archetype shown",
        control: false,
        finishers: 42,
        reached: 40,
        paid: 6,
        paidReached: 6,
        full: 2,
      },
    ],
  };
  const withPeriods: FunnelPaywallPayload = {
    ...payload,
    gateTest: running,
    funnels: payload.funnels.map((f) =>
      f.key === "after"
        ? { ...f, label: "Before the paywall", period: "Free report · 1 Oct – 22 Oct 2026" }
        : f
    ),
  };

  it("is named as Marcus renamed it, with the paywall test first", () => {
    view.payload = payload;
    render(<ApPayToStart />);
    expect(screen.getByRole("heading", { level: 1, name: "Funnel and paywall" })).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Funnel and paywall sections" });
    expect(within(nav).getAllByRole("link")[0]!.textContent).toBe("Paywall test");
    const order = [...document.querySelectorAll("section[id]")].map((s) => s.id);
    expect(order.indexOf("paywall-test")).toBeLessThan(order.indexOf("funnels"));
    // A range before the test: its section says why, and the funnels still show.
    expect(
      within(document.getElementById("paywall-test")!).getByText(/^Not running in this range/)
    ).toBeTruthy();
  });

  it("draws a card per half: saw the page, paid, the pay rate and the sample so far", () => {
    view.payload = withPeriods;
    render(<ApPayToStart />);
    const test = within(document.getElementById("paywall-test")!);
    const a = within(test.getByRole("region", { name: "Today's €1.99 page" }));
    expect(a.getByText("A · Today's €1.99 page")).toBeTruthy();
    expect(a.getByText("38")).toBeTruthy();
    expect(a.getByText("of 40 finishers")).toBeTruthy();
    expect(a.getByText("10.0%")).toBeTruthy();
    expect(a.getByText("38 of ~170 readers")).toBeTruthy();
    const b = within(test.getByRole("region", { name: "New page: Core Archetype shown" }));
    expect(b.getByText("14.3%")).toBeTruthy();
    expect(test.getByText("10 readers")).toBeTruthy();
    expect(test.getByText("Full report bought: A 1 · B 2")).toBeTruthy();
    expect(test.getByText(running.verdict)).toBeTruthy();
    // Every figure carries its info card, the same as AP › Payment's.
    for (const name of ["Saw €1.99 page", "Paid €1.99", "Pay rate"])
      expect(a.getByRole("button", { name: `About ${name}` })).toBeTruthy();
  });

  it("says which stretch each funnel is read over, and exports the test", () => {
    view.payload = withPeriods;
    render(<ApPayToStart />);
    expect(screen.getAllByText("Free report · 1 Oct – 22 Oct 2026").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const t = exported.sections.find((x) => x.name === "Paywall test · #11 · New €1.99 page")!;
    expect(t.table.rows.map((r) => [r.label, ...r.values])).toEqual([
      ["Today's €1.99 page", 40, 38, 4, 0.1, 1],
      ["New page: Core Archetype shown", 42, 40, 6, 6 / 42, 2],
    ]);
  });
});

describe("Funnel and paywall: what can't be compared across its two stretches (review, 21 Nov 2026)", () => {
  it("never ranks the return on ad spend, a total over two different stretches", () => {
    view.payload = payload;
    render(<ApPayToStart />);
    const row = screen.getByRole("row", { name: /^Return on ad spend \(€\)/ });
    for (const cell of within(row).getAllByRole("cell"))
      expect(cell.className).not.toMatch(/bg-ap-good|bg-ap-bad/);
    // A rate per visit still is: the two stretches compare on it.
    const rate = screen.getByRole("row", { name: /^Revenue per visit/ });
    expect(
      within(rate)
        .getAllByRole("cell")
        .some((c) => /bg-ap-good/.test(c.className))
    ).toBe(true);
  });
});
