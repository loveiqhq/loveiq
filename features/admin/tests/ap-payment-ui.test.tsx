// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Table, Tile } from "@features/admin/server/ap/common";
import type { PaymentPayload, SegmentRow } from "@features/admin/server/ap/payment";

const view = vi.hoisted(() => ({ payload: null as unknown }));
vi.mock("@features/admin/ui/hooks/useAdminFetch", () => ({
  useAdminFetch: () => ({ data: view.payload, loading: false, error: null, refetch: () => {} }),
}));
vi.mock("@features/admin/ui/ap/useApFilters", () => ({ useApFilters: () => ({ params: {} }) }));
vi.mock("@features/admin/ui/ap/ApFilterBar", () => ({ default: () => null }));
// The CSV's tables as the page hands them over, without a download.
const exported = vi.hoisted(() => ({ sections: [] as Array<{ name: string; table: Table }> }));
vi.mock("@features/admin/ui/ap/csv", () => ({
  exportTables: (_file: string, sections: Array<{ name: string; table: Table }>) => {
    exported.sections = sections;
  },
}));

import ApPayment from "@features/admin/ui/ap/ApPayment";

const tile = (
  key: string,
  label: string,
  unit: Tile["unit"],
  value: number | null,
  note: string,
  noteTone?: Tile["noteTone"]
): Tile => ({
  key,
  label,
  unit,
  value,
  prev: null,
  goodWhen: "up",
  spark: [1, 2, 3],
  foot: "",
  blocked: null,
  trend: "",
  note,
  ...(noteTone ? { noteTone } : {}),
});

const seg = (label: string, finishers: number, sales: number, revenue: number): SegmentRow => ({
  label,
  finishers,
  sales,
  preCvr: null,
  preAvg: null,
  preBuyers: 0,
  preSales: 0,
  preRevenue: 0,
  // Every buyer here bought one full unlock.
  fullCvr: finishers ? sales / finishers : null,
  fullAvg: sales ? revenue / sales : null,
  revenue,
  fullBuyers: sales,
  fullSales: sales,
  fullRevenue: revenue,
});

// Fourteen countries: the twelve largest are shown, the last two are added up.
const countries = Array.from({ length: 14 }, (_, i) =>
  seg(
    `Country ${String.fromCharCode(65 + i)}`,
    200 - i * 10,
    i === 13 ? 2 : i % 3,
    i === 13 ? 30 : (i % 3) * 10
  )
);

const payload: PaymentPayload = {
  range: { from: "2026-05-01", to: "2026-07-15", label: "1 May – 15 Jul 2026" },
  compare: null,
  generatedAt: "2026-07-16T10:00:00.000Z",
  notes: [],
  narrowed: null,
  launched: true,
  tiles: [
    tile("revenue", "Revenue", "eur", 649.93, "1 May – 15 Jul 2026"),
    tile("sales", "Paid sales", "count", 31, "+ 13 free unlocks"),
    tile("pre", "Pre-unlocks", "count", null, "Initial plan · not on sale yet"),
    tile("pre-cvr", "Pre-unlock CVR", "pct", null, "of 1,126 submissions"),
    tile("full", "Full unlocks", "count", 31, "Full, Full All, Core"),
    tile("full-cvr", "Full-unlock CVR", "pct", 0.0275, "of 1,126 submissions"),
    tile("aov", "Avg. order value", "eur", 16.5, "over 31 paid sales"),
    tile("pay-cvr", "Payment CVR", "pct", 0.018, "20 of 1,126 finishers"),
    tile(
      "checkout",
      "Checkout success",
      "pct",
      0.1398,
      "39 of 279 reached the payment page",
      "bad"
    ),
  ],
  overTime: {
    grain: "month",
    preOnSale: false,
    rows: [
      {
        label: "May 2026",
        partial: false,
        preSales: 0,
        preRevenue: 0,
        fullSales: 13,
        fullRevenue: 124.87,
        revenue: 124.87,
        finishers: 410,
      },
      {
        label: "Jun 2026",
        partial: false,
        preSales: 0,
        preRevenue: 0,
        fullSales: 11,
        fullRevenue: 192.14,
        revenue: 192.14,
        finishers: 496,
      },
      {
        label: "Jul 2026 (1 Jul–15 Jul)",
        partial: true,
        preSales: 0,
        preRevenue: 0,
        fullSales: 7,
        fullRevenue: 106.94,
        revenue: 106.94,
        finishers: 440,
      },
    ],
  },
  checkout: {
    reached: 100,
    attempted: 40,
    paid: 30,
    points: [
      { label: "May 2026", partial: false, reached: 20, attempted: 15, paid: 13 },
      { label: "Jun 2026", partial: false, reached: 30, attempted: 12, paid: 11 },
      { label: "Jul 2026 (1 Jul–15 Jul)", partial: true, reached: 50, attempted: 13, paid: 6 },
    ],
    methods: [
      { key: "link", name: "Stripe Link", kind: "saved details", sales: 24, revenue: 371.04 },
      { key: "visa", name: "Visa", kind: "card", sales: 8, revenue: 141.94 },
    ],
    sales: 32,
    why: null,
  },
  segments: [
    {
      key: "gender",
      label: "Gender",
      rows: [seg("Woman", 600, 10, 150), seg("Man", 500, 12, 240), seg("Other", 26, 0, 0)],
      note: "The range's survey finishers by their answer.",
    },
    {
      key: "age",
      label: "Age",
      rows: [seg("18–24", 700, 2, 34), seg("65+", 40, 4, 86)],
      note: "By age band.",
    },
    { key: "relationship", label: "Relationship", rows: [seg("Single", 800, 13, 289.4)], note: "" },
    {
      key: "country",
      label: "Country",
      rows: countries,
      note: "The country the finisher gave in the survey.",
    },
    { key: "device", label: "Device / OS", rows: [seg("iOS", 900, 17, 278.63)], note: "" },
    { key: "tier", label: "Country price tier", rows: [seg("Tier 1", 1000, 25, 464.07)], note: "" },
    {
      key: "source",
      label: "Traffic source",
      rows: [seg("Google Ads", 1083, 9, 234.46)],
      note: "",
    },
  ],
  pricing: {
    arms: [
      {
        test: "Pricing 2.x",
        note: "May – Aug 2026 · ended 31 Aug",
        arm: "A",
        control: true,
        basePrice: "personalised",
        paywallViews: null,
        checkouts: 97,
        paidSales: 20,
        revenue: 276.31,
        aovLift: null,
        aovConfidence: null,
        aovWhy: null,
      },
      {
        test: "Pricing 2.x",
        note: "May – Aug 2026 · ended 31 Aug",
        arm: "B",
        control: false,
        basePrice: "personalised",
        paywallViews: null,
        checkouts: 101,
        paidSales: 18,
        revenue: 344.62,
        aovLift: 0.3858,
        aovConfidence: 0.8158,
        aovWhy: null,
      },
      {
        test: "Pricing 3.0",
        note: "Live · from 9 Oct 2026",
        arm: "A3",
        control: true,
        basePrice: "€29.99 full · €39.99 all",
        paywallViews: 29,
        checkouts: 1,
        paidSales: 0,
        revenue: 0,
        aovLift: null,
        aovConfidence: null,
        aovWhy: null,
      },
      {
        test: "Pricing 3.0",
        note: "Live · from 9 Oct 2026",
        arm: "B3",
        control: false,
        basePrice: "€4.99 full · €6.99 all",
        paywallViews: 24,
        checkouts: 1,
        paidSales: 0,
        revenue: 0,
        aovLift: null,
        aovConfidence: null,
        aovWhy: "Too few sales to compare",
      },
    ],
    factors: {
      on: false,
      since: "2026-08-03T18:28:58Z",
      groups: [
        {
          label: "Country tier",
          items: [
            { key: "Tier 1", multiplier: 1.2 },
            { key: "Other countries", multiplier: 0.9 },
          ],
        },
        { label: "Device", items: [{ key: "Desktop", multiplier: 1.05 }] },
      ],
    },
  },
  // cvr(p) = min(1%, 2.25 / p²): the cap meets the curve at €15, where net revenue peaks.
  elasticity: {
    points: [
      { label: "May 2026", price: 10, cvr: 0.01, sales: 4, finishers: 400 },
      { label: "Jun 2026", price: 15, cvr: 0.008, sales: 4, finishers: 500 },
      { label: "Jul 2026 (1 Jul–15 Jul)", price: 20, cvr: 0.005, sales: 1, finishers: 200 },
    ],
    fit: { a: Math.log(2.25), e: -2 },
    cap: 0.01,
    why: null,
    today: [
      { arm: "A3", price: 29.99 },
      { arm: "B3", price: 4.99 },
    ],
  },
};

afterEach(() => {
  cleanup();
  view.payload = payload;
});
view.payload = payload;

const region = (name: string) => screen.getByRole("region", { name });
const rows = (table: HTMLElement) => within(table).getAllByRole("row").slice(1);
const texts = (els: HTMLElement[]) => els.map((e) => e.textContent);
const withFactors = (factors: Partial<PaymentPayload["pricing"]["factors"]>) => ({
  ...payload,
  pricing: { ...payload.pricing, factors: { ...payload.pricing.factors, ...factors } },
});

describe("the Payment page as drawn", () => {
  it("has the breadcrumb, the header, the section pills and the sections in order", () => {
    render(<ApPayment />);
    expect(screen.getByRole("navigation", { name: "Breadcrumb" }).textContent).toBe(
      "Assessments/Assessment A/Payment"
    );
    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual([
      "Payment",
      "Pre-unlock and full-unlock payments over time",
      "Checkout and payment methods",
      "Checkout success",
      "Payment methods",
      "Who pays",
      "Pricing tests",
      "Personal price multipliers in Pricing 3.0",
      "Price elasticity prediction",
    ]);
    const pills = within(screen.getByRole("navigation", { name: "Payment sections" })).getAllByRole(
      "link"
    );
    expect(texts(pills)).toEqual([
      "Over time",
      "Checkout & methods",
      "Segments",
      "Pricing tests",
      "Price elasticity",
    ]);
    expect(pills.map((p) => p.getAttribute("href"))).toEqual([
      "#over-time",
      "#checkout",
      "#segments",
      "#experiments",
      "#elasticity",
    ]);
    expect(pills[0]!.getAttribute("aria-current")).toBe("true");
    expect(pills[1]!.getAttribute("aria-current")).toBeNull();
  });

  it("nine tiles with the design's lines in place of a change", () => {
    render(<ApPayment />);
    const tileText = (label: string) => screen.getAllByText(label)[0]!.parentElement!.textContent;
    expect(tileText("Revenue")).toBe("Revenue€6501 May – 15 Jul 2026");
    expect(tileText("Pre-unlocks")).toBe("Pre-unlocks—Initial plan · not on sale yet");
    expect(tileText("Full-unlock CVR")).toBe("Full-unlock CVR2.75%of 1,126 submissions");
    expect(tileText("Avg. order value")).toBe("Avg. order value€16.50over 31 paid sales");
    expect(tileText("Payment CVR")).toBe("Payment CVR1.80%20 of 1,126 finishers");
    expect(tileText("Checkout success")).toBe(
      "Checkout success14.0%39 of 279 reached the payment page"
    );
    expect(screen.getByText("39 of 279 reached the payment page").className).toContain(
      "text-ap-bad"
    );
  });

  it("over time: stacked bars on computed axes, then the table with pre-unlock blank", () => {
    render(<ApPayment />);
    const card = region("Pre-unlock and full-unlock payments over time");
    expect(within(card).getByText(/Paid sales per month by unlock type/)).toBeTruthy();
    // 13 sales × 1.1 → 16, 496 finishers × 1.1 → 600: the design's own tops.
    for (const t of ["4", "8", "12", "16", "150", "300", "450", "600"])
      expect(within(card).getAllByText(t).length).toBeGreaterThan(0);
    const table = within(card).getByRole("table", { name: "Payments over time" });
    expect(texts(within(table).getAllByRole("columnheader"))[0]).toBe("Month");
    expect(texts(within(rows(table)[0]!).getAllByRole("cell"))).toEqual([
      "—",
      "—",
      "13",
      "€9.61",
      "€124.87",
      "410",
      "3.17%",
    ]);
    // Payment CVR shaded: May best (green), July worst (red).
    const cvr = (i: number) => within(rows(table)[i]!).getAllByRole("cell")[6]!.className;
    expect(cvr(0)).toContain("text-ap-good-ink");
    expect(cvr(2)).toContain("text-ap-bad-ink");
    expect(within(card).getByText("The Initial plan (pre-unlock) isn't on sale yet.")).toBeTruthy();
  });

  it("checkout: the a/b/c funnel with rates coloured as drawn, then the methods", () => {
    render(<ApPayment />);
    const card = region("Checkout and payment methods");
    expect(within(card).getByText(/Paid checkouts in this range: a\) reached/)).toBeTruthy();
    // 40 of 100 attempted (ink, between 30% and 50%); 30 of 40 paid (ink, between 70% and 85%).
    expect(within(card).getByText("40.0% of a").className).toContain("text-ap-ink");
    expect(within(card).getByText("75.0% of b").className).toContain("text-ap-ink");
    // Each month's success: green from 30%.
    expect(within(card).getByText("65%").className).toContain("text-ap-good");
    expect(within(card).getByText("12%").className).toContain("text-ap-bad");
    expect(within(card).getByText("32 paid sales in this range, via Stripe")).toBeTruthy();
    const methods = within(card).getByRole("table", { name: "Payment methods" });
    expect(texts(rows(methods))).toEqual([
      "Stripe Linksaved details2475%€371€15.46",
      "Visacard825%€142€17.74",
    ]);
  });

  it("who pays: switches segment, and adds up the smaller countries", () => {
    render(<ApPayment />);
    const card = region("Who pays");
    const table = () => within(card).getByRole("table");
    expect(texts(rows(table()).map((r) => within(r).getByRole("rowheader")))).toEqual([
      "Woman",
      "Man",
      "Other",
    ]);
    // Share of sales 10/22; full CVR 10/600; €15 a sale; €0.25 per finisher.
    expect(texts(within(rows(table())[0]!).getAllByRole("cell"))).toEqual([
      "600",
      "45%",
      "—",
      "—",
      "1.67%",
      "€15.00",
      "€150",
      "€0.25",
    ]);
    const select = within(card).getByLabelText("Segment by");
    expect(texts(within(select).getAllByRole("option"))).toEqual([
      "Gender",
      "Age",
      "Relationship",
      "Country",
      "Device / OS",
      "Country price tier",
      "Traffic source",
    ]);
    fireEvent.change(select, { target: { value: "age" } });
    expect(texts(rows(table()).map((r) => within(r).getByRole("rowheader")))).toEqual([
      "18–24",
      "65+",
    ]);
    fireEvent.change(select, { target: { value: "country" } });
    const names = texts(rows(table()).map((r) => within(r).getByRole("rowheader")));
    expect(names).toHaveLength(13);
    expect(names[12]).toBe("Other countries");
    // Countries M (80 finishers, no sale) and N (70, 2 sales, €30): 2 of the 14 sales, 2 buyers of 150.
    expect(texts(within(rows(table())[12]!).getAllByRole("cell"))).toEqual([
      "150",
      "14%",
      "—",
      "—",
      "1.33%",
      "€15.00",
      "€30",
      "€0.20",
    ]);
    expect(
      within(card).getByText(/Other countries: the 2 smaller countries added together\./)
    ).toBeTruthy();
    expect(within(card).getByText("The Initial plan (pre-unlock) isn't on sale yet.")).toBeTruthy();
  });

  it("pricing tests: as drawn, with the AOV lift and its confidence", () => {
    render(<ApPayment />);
    const table = screen.getByRole("table", { name: "Pricing tests" });
    const [a, b, a3, b3] = rows(table).map((r) => texts(within(r).getAllByRole("cell")));
    expect(a).toEqual([
      "Pricing 2.xMay – Aug 2026 · ended 31 Aug",
      "AControl",
      "—personalised",
      "—not logged",
      "97",
      "20",
      "€276",
      "€13.82",
      "21%",
      "—",
      "—",
    ]);
    expect(b).toEqual([
      "",
      "B",
      "—personalised",
      "—not logged",
      "101",
      "18",
      "€345",
      "€19.15",
      "18%",
      "—",
      "+38.6%82% confidence · not significant yet",
    ]);
    expect(a3!.slice(0, 3)).toEqual([
      "Pricing 3.0Live · from 9 Oct 2026",
      "A3Control",
      "€29.99full · €39.99 all",
    ]);
    expect(b3!.slice(-2)).toEqual(["€0.00", "—Too few sales to compare"]);
    // B's larger AOV is green; no sale from a checkout is red.
    const cell = (row: number, col: number) =>
      within(rows(table)[row]!).getAllByRole("cell")[col]!.className;
    expect(cell(1, 7)).toContain("text-ap-good-ink");
    expect(cell(0, 7)).not.toContain("text-ap-good-ink");
    expect(cell(2, 5)).toContain("text-ap-bad-ink");
    expect(cell(2, 8)).toContain("text-ap-bad-ink");
    expect(within(table).getAllByRole("row")[2]!.className).toContain("border-dashed");
  });

  it("the multipliers' sentence follows the price switch: off, on, or unread", () => {
    render(<ApPayment />);
    expect(
      screen.getByText(
        "Switched off since 3 Aug 2026: everyone pays their arm's flat price. Each quote still records these factors, which the price would be multiplied by if the switch were turned on."
      )
    ).toBeTruthy();
    expect(screen.queryByText(/Each visitor's price is the arm's base price/)).toBeNull();
    expect(screen.getByText("Tier 1").nextSibling!.textContent).toBe("×1.20");
    cleanup();

    view.payload = withFactors({ on: true });
    render(<ApPayment />);
    expect(
      screen.getByText(
        "Each visitor's price is the arm's base price times these factors. These are the levers to target or test next."
      )
    ).toBeTruthy();
    expect(screen.queryByText(/Switched off/)).toBeNull();
    cleanup();

    view.payload = withFactors({ on: null, since: null });
    render(<ApPayment />);
    expect(screen.getByText("The price switch could not be read just now.")).toBeTruthy();
  });

  it("price elasticity: the four tiles for a known fit, and the probe moves with the slider", () => {
    render(<ApPayment />);
    const card = region("Price elasticity prediction");
    const tileText = (label: string) => within(card).getByText(label).parentElement!.textContent;
    expect(within(card).getByText(/fitted to 3 months of full-unlock price/)).toBeTruthy();
    expect(tileText("Price elasticity")).toBe(
      "Price elasticity−2.00A 10% higher price cuts paying users by about 20%"
    );
    expect(tileText("Best price (net revenue)")).toBe(
      "Best price (net revenue)€15.00Where net revenue per submission peaks: €0.143"
    );
    expect(tileText("At €15.00")).toBe(
      "At €15.001.00%Predicted payment CVR · €0.143 net per submission"
    );
    expect(tileText("At today’s €29.99 (A3)")).toBe(
      "At today’s €29.99 (A3)0.25%€0.072 net per submission · 50% less than at the best price"
    );
    expect(within(card).getByText("Best ≈ €15.00")).toBeTruthy();
    expect(within(card).getByText("May €10")).toBeTruthy();
    expect(
      within(card).getByText(/Conversion is capped at 1\.0%, the best month observed/)
    ).toBeTruthy();

    fireEvent.change(within(card).getByLabelText(/Test a price/), { target: { value: "20" } });
    expect(within(card).getByLabelText("Test a price · €20.00")).toBeTruthy();
    expect(tileText("At €20.00")).toBe(
      "At €20.000.56%Predicted payment CVR · €0.108 net per submission"
    );
  });

  it("price elasticity: a price picked on the chart is the one its card shows", () => {
    render(<ApPayment />);
    const card = region("Price elasticity prediction");
    const chart = within(card).getByRole("group", { name: /^Price elasticity\./ });
    fireEvent.focus(chart);
    fireEvent.keyDown(chart, { key: "Home" });
    // The read-out stops where the slider does: €3.00, then €3.50.
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(document.querySelector("[data-ap-tip]")).toHaveTextContent("At €3.50");
    fireEvent.keyDown(chart, { key: "Enter" });
    expect(within(card).getByLabelText("Test a price · €3.50")).toBeTruthy();
    // The pointer finds the same stops: €20 sits 17/37 of the way along a €3–€40 axis.
    vi.spyOn(chart, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      right: 740,
      bottom: 280,
      width: 740,
      height: 280,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    fireEvent.pointerMove(chart, { clientX: (17 / 37) * 740, clientY: 100, pointerType: "mouse" });
    expect(document.querySelector("[data-ap-tip]")).toHaveTextContent("At €20.00");
    fireEvent.click(chart);
    expect(within(card).getByLabelText("Test a price · €20.00")).toBeTruthy();
  });

  it("price elasticity: says why in place of the model when there is no fit", () => {
    view.payload = {
      ...payload,
      elasticity: {
        ...payload.elasticity,
        points: [],
        fit: null,
        cap: null,
        why: "The model needs three months in the range with a full unlock sold; none has one. Pick a longer range (Last 12 months).",
      },
    };
    render(<ApPayment />);
    const card = region("Price elasticity prediction");
    expect(within(card).getByText(/The model needs three months in the range/)).toBeTruthy();
    expect(within(card).queryByText("Price elasticity")).toBeNull();
    expect(within(card).queryByRole("slider")).toBeNull();
    expect(card.querySelector("polyline")).toBeNull();
  });

  it("exports the over-time table, checkout, methods, the chosen segment and the pricing arms", () => {
    render(<ApPayment />);
    fireEvent.change(screen.getByLabelText("Segment by"), { target: { value: "country" } });
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(exported.sections.map((s) => s.name)).toEqual([
      "Payments over time",
      "Checkout success",
      "Payment methods",
      "Who pays · Country",
      "Pricing tests",
    ]);
    // The segment in full, every country.
    expect(exported.sections[3]!.table.rows).toHaveLength(14);
  });

  it("never writes NaN, undefined or Infinity, with or without sales", () => {
    const { container, unmount } = render(<ApPayment />);
    expect(container.innerHTML).not.toMatch(/NaN|undefined|Infinity/);
    unmount();
    // A range with nothing sold and nothing reached.
    view.payload = {
      ...payload,
      overTime: {
        ...payload.overTime,
        rows: payload.overTime.rows.map((r) => ({
          ...r,
          fullSales: 0,
          fullRevenue: 0,
          revenue: 0,
          finishers: 0,
        })),
      },
      checkout: { reached: 0, attempted: 0, paid: 0, points: [], methods: [], sales: 0, why: null },
      segments: payload.segments.map((s) => ({ ...s, rows: [] })),
      elasticity: { ...payload.elasticity, points: [], fit: null, cap: null, why: "No fit." },
    };
    const empty = render(<ApPayment />);
    expect(empty.container.innerHTML).not.toMatch(/NaN|undefined|Infinity/);
    expect(screen.getByText("No paid sale in this range.")).toBeTruthy();
  });
});
