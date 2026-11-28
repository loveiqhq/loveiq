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
  counts: { submissions: 1126, fullSubmissions: 31, finishers: 1100, payers: 20 },
  types: {
    rows: [
      {
        key: "pre-fixed",
        name: "Pre-unlock · fixed €1.99",
        line: "On sale from 27 Oct 2026",
        live: false,
        sales: null,
        revenue: null,
        refunds: null,
        fullRefunds: null,
        shown: null,
        base: null,
        baseOf: null,
      },
      {
        key: "full",
        name: "Full report on the report",
        line: "",
        live: true,
        sales: 31,
        revenue: 649.93,
        refunds: 0,
        fullRefunds: 0,
        shown: null,
        base: 1240,
        baseOf: "finishers",
      },
    ],
    refundsWhy: null,
  },
  overTime: {
    grain: "month",
    preOnSale: false,
    note: null,
    rows: [
      {
        label: "May 2026",
        partial: false,
        preSales: 0,
        preRevenue: 0,
        fullSales: 13,
        fullRevenue: 124.87,
        revenue: 124.87,
        submissions: 410,
        finishers: 410,
        payers: 12,
      },
      {
        label: "Jun 2026",
        partial: false,
        preSales: 0,
        preRevenue: 0,
        fullSales: 11,
        fullRevenue: 192.14,
        revenue: 192.14,
        submissions: 496,
        finishers: 496,
        payers: 10,
      },
      {
        label: "Jul 2026 (1 Jul–15 Jul)",
        partial: true,
        preSales: 0,
        preRevenue: 0,
        fullSales: 7,
        fullRevenue: 106.94,
        revenue: 106.94,
        submissions: 440,
        finishers: 440,
        payers: 5,
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
  priceTest: {
    test: "Pre-unlock price test: €1.99 vs choose your price",
    arms: [
      {
        arm: "fixed",
        name: "A · Fixed €1.99",
        sub: "Control: today’s page",
        control: true,
        finishers: 200,
        reached: 180,
        paid: 20,
        revenue: 39.8,
        free: 0,
        full: 2,
      },
      {
        arm: "choose",
        name: "B · Choose your price",
        sub: "Suggested €6.99",
        control: false,
        finishers: 200,
        reached: 190,
        paid: 30,
        revenue: 209.7,
        free: 12,
        full: 3,
      },
    ],
    options: [
      { option: "fair", name: "Fair price · €6.99", sub: "recommended", n: 20, revenue: 139.8 },
      { option: "support", name: "Support our research · €19.99", sub: "", n: 2, revenue: 39.98 },
      {
        option: "custom",
        name: "Own amount · from €0.50",
        sub: "avg. of what they typed",
        n: 8,
        revenue: 29.92,
      },
    ],
    verdict:
      "Choose your price earns €1.05 per finisher against €0.20, with a higher pay rate (15.0% vs 10.0%) and 12 free claims. The pay rates could still differ by chance. Watch the free claims and the share choosing the lowest amounts: if they grow, the average price falls. To call it, each arm needs at least 5 paying readers per price option.",
    why: null,
  },
};

afterEach(() => {
  cleanup();
  view.payload = payload;
});
view.payload = payload;

// A section's name is its title, then its info icon's name where the title has one.
const region = (name: string) =>
  screen.getByRole("region", {
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( About .*)?$`),
  });
const rows = (table: HTMLElement) => within(table).getAllByRole("row").slice(1);
const texts = (els: HTMLElement[]) => els.map((e) => e.textContent);
describe("the Payment page as drawn", () => {
  it("has the breadcrumb, the header, the section pills and the sections in order", () => {
    render(<ApPayment />);
    expect(screen.getByRole("navigation", { name: "Breadcrumb" }).textContent).toBe(
      "Assessments/Assessment A/Payment"
    );
    expect(screen.getAllByRole("heading").map((h) => h.textContent?.trim())).toEqual([
      "Payment",
      "Payment types",
      "Pre-unlock price test: €1.99 vs choose your price",
      "Pre-unlock and full-unlock payments over time",
      "Who pays",
      "Checkout and payment methods",
      "Checkout success",
      "Payment methods",
    ]);
    const pills = within(screen.getByRole("navigation", { name: "Payment sections" })).getAllByRole(
      "link"
    );
    expect(texts(pills)).toEqual([
      "Pre-unlock price test",
      "Over time",
      "Segments",
      "Checkout & methods",
    ]);
    expect(pills.map((p) => p.getAttribute("href"))).toEqual([
      "#gate-test",
      "#over-time",
      "#segments",
      "#checkout",
    ]);
    expect(pills[0]!.getAttribute("aria-current")).toBe("true");
    expect(pills[1]!.getAttribute("aria-current")).toBeNull();
  });

  it("nine tiles with the design's lines in place of a change", () => {
    render(<ApPayment />);
    // Each label is followed by its info icon (a space, then the button).
    // The info icon is glued to its label by a no-break space: read it as a space.
    const tileText = (label: string) =>
      screen.getAllByText(label)[0]!.parentElement!.textContent!.replace(/\u00a0/g, " ");
    expect(tileText("Revenue")).toBe("Revenue €6501 May – 15 Jul 2026");
    expect(tileText("Pre-unlocks")).toBe("Pre-unlocks —Initial plan · not on sale yet");
    expect(tileText("Full-unlock CVR")).toBe("Full-unlock CVR 2.8%of 1,126 submissions");
    expect(tileText("Avg. order value")).toBe("Avg. order value €16.50over 31 paid sales");
    expect(tileText("Payment CVR")).toBe("Payment CVR 1.8%20 of 1,126 finishers");
    expect(tileText("Checkout success")).toBe(
      "Checkout success 14.0%39 of 279 reached the payment page"
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
      // The month's finishers who paid (12 of 410), as the Payment CVR tile counts them.
      "2.9%",
    ]);
    // Payment CVR shaded: May best (green), July worst (red).
    const cvr = (i: number) => within(rows(table)[i]!).getAllByRole("cell")[6]!.className;
    expect(cvr(0)).toContain("text-ap-good-ink");
    expect(cvr(2)).toContain("text-ap-bad-ink");
    expect(
      within(card).getByText(
        "Pre-unlock figures start on 23 Oct 2026, the first whole day the €1.99 Core Archetype was on sale (from the evening of 22 Oct): earlier periods have none to count."
      )
    ).toBeTruthy();
  });

  it("colours each month's checkout success by the figure shown: green from 30.0%", () => {
    view.payload = {
      ...payload,
      checkout: {
        ...payload.checkout,
        points: [
          // 599 of 2,000 is 29.95%: it reads "30.0%", so green; 299 of 1,000 reads "29.9%".
          { label: "May 2026", partial: false, reached: 2000, attempted: 900, paid: 599 },
          { label: "Jun 2026", partial: false, reached: 1000, attempted: 500, paid: 299 },
        ],
      },
    };
    render(<ApPayment />);
    const card = region("Checkout and payment methods");
    expect(within(card).getByText("30.0%").className).toContain("text-ap-good");
    expect(within(card).getByText("29.9%").className).toContain("text-ap-bad");
  });

  it("checkout: the a/b/c funnel with rates coloured as drawn, then the methods", () => {
    render(<ApPayment />);
    const card = region("Checkout and payment methods");
    expect(within(card).getByText(/Paid checkouts in this range: a\) reached/)).toBeTruthy();
    // 40 of 100 attempted (ink, between 30% and 50%); 30 of 40 paid (ink, between 70% and 85%).
    expect(within(card).getByText("40.0% of a").className).toContain("text-ap-ink");
    expect(within(card).getByText("75.0% of b").className).toContain("text-ap-ink");
    // Each month's success: green from 30%.
    expect(within(card).getByText("65.0%").className).toContain("text-ap-good");
    expect(within(card).getByText("12.0%").className).toContain("text-ap-bad");
    expect(within(card).getByText("32 paid sales in this range, via Stripe")).toBeTruthy();
    const methods = within(card).getByRole("table", { name: "Payment methods" });
    // Revenue in whole euros, as drawn; the AOV keeps its cents.
    expect(texts(rows(methods))).toEqual([
      "Stripe Linksaved details2475.0%€371€15.46",
      "Visacard825.0%€142€17.74",
    ]);
  });

  // Marcus's "Paygate exit pages" (28.10): "add it to the payment report".
  it("who pays: switches segment; countries of 15 finishers or more all shown", () => {
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
      "45.5%",
      "—",
      "—",
      "1.7%",
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
    // Every country has 15 finishers or more: none is left out, none added together.
    const names = texts(rows(table()).map((r) => within(r).getByRole("rowheader")));
    expect(names).toHaveLength(14);
    expect(names).not.toContain("Other countries");
    // Country N: 70 finishers, 2 of the 14 sales, 2 buyers, €30.
    expect(texts(within(rows(table())[13]!).getAllByRole("cell"))).toEqual([
      "70",
      "14.3%",
      "—",
      "—",
      "2.9%",
      "€15.00",
      "€30",
      "€0.43",
    ]);
    expect(within(card).queryByText(/Smaller groups are left out/)).toBeNull();
    expect(
      within(card).getByText(
        "Pre-unlock figures start on 23 Oct 2026, the first whole day the €1.99 Core Archetype was on sale (from the evening of 22 Oct): earlier periods have none to count."
      )
    ).toBeTruthy();
  });

  it("pre-unlock price test: each half, the choosing half's picks under it, the free claims, and the verdict", () => {
    render(<ApPayment />);
    const table = screen.getByRole("table", {
      name: "Pre-unlock price test: €1.99 vs choose your price",
    });
    const all = rows(table).map((x) => texts(within(x).getAllByRole("cell")));
    expect(all).toEqual([
      [
        "A · Fixed €1.99Control: today’s page",
        "200",
        "180",
        "20",
        "10.0%",
        "€1.99",
        "€0.20€39.80 in total",
        "2",
      ],
      [
        "B · Choose your priceSuggested €6.99",
        "200",
        "190",
        "30",
        "15.0%",
        "€6.99",
        "€1.05€209.70 in total",
        "3",
      ],
      [
        "Fair price · €6.99recommended",
        "",
        "",
        "20",
        "10.0%",
        "€6.99",
        "€0.70€139.80 in total",
        "",
      ],
      ["Support our research · €19.99", "", "", "2", "1.0%", "€19.99", "€0.20€39.98 in total", ""],
      [
        "Own amount · from €0.50avg. of what they typed",
        "",
        "",
        "8",
        "4.0%",
        "€3.74",
        "€0.15€29.92 in total",
        "",
      ],
      ["Took it free · €012 readers · 6.0% of finishers", "", "", "—", "—", "€0.00", "€0.00", ""],
    ]);
    const cell = (row: number, col: number) =>
      within(rows(table)[row]!).getAllByRole("cell")[col]!.className;
    // Green on the half ahead, on the pay rate and on revenue per finisher.
    expect(cell(1, 4)).toContain("text-ap-good-ink");
    expect(cell(1, 6)).toContain("text-ap-good-ink");
    expect(cell(0, 4)).not.toContain("text-ap-good-ink");
    expect(cell(0, 6)).not.toContain("text-ap-good-ink");
    // The picks sit in under their half, on the board's pale ground; the halves stay white.
    expect(cell(2, 0)).toContain("pl-7");
    const rowClass = (row: number) => rows(table)[row]!.className;
    for (const r of [2, 3, 4, 5]) expect(rowClass(r)).toContain("bg-[#faf9fc]");
    for (const r of [0, 1]) expect(rowClass(r)).not.toContain("bg-[#faf9fc]");
    for (const r of [0, 1, 2, 3, 4, 5]) expect(rowClass(r)).not.toContain("border-dashed");
    expect(
      within(region("Pre-unlock price test: €1.99 vs choose your price")).getByText(
        payload.priceTest.verdict
      )
    ).toBeTruthy();
  });

  it("pre-unlock price test: says why in place of the table, and a half it couldn't read says so", () => {
    view.payload = {
      ...payload,
      priceTest: {
        ...payload.priceTest,
        arms: [],
        options: [],
        verdict: "",
        why: "Who is in which half could not be read just now.",
      },
    };
    render(<ApPayment />);
    expect(
      screen.queryByRole("table", { name: "Pre-unlock price test: €1.99 vs choose your price" })
    ).toBeNull();
    expect(
      within(region("Pre-unlock price test: €1.99 vs choose your price")).getByText(
        "Who is in which half could not be read just now."
      )
    ).toBeTruthy();
    cleanup();

    view.payload = {
      ...payload,
      priceTest: {
        ...payload.priceTest,
        arms: payload.priceTest.arms.map((a) => ({ ...a, reached: null })),
      },
    };
    render(<ApPayment />);
    const first = rows(
      screen.getByRole("table", { name: "Pre-unlock price test: €1.99 vs choose your price" })
    )[0]!;
    expect(within(first).getAllByRole("cell")[2]!.textContent).toBe("—could not be read");
  });

  it("says when a payment type's Paywall shown could not be read, and leaves an uncounted paywall blank", () => {
    view.payload = {
      ...payload,
      types: {
        ...payload.types,
        rows: payload.types.rows.map((r) =>
          r.key === "pre-fixed"
            ? {
                ...r,
                line: "",
                live: true,
                sales: 3,
                revenue: 5.97,
                refunds: 0,
                fullRefunds: 0,
                base: 40,
                baseOf: "finishers",
                shownUnread: true,
              }
            : r
        ),
      },
    };
    render(<ApPayment />);
    const [fixed, full] = rows(screen.getByRole("table", { name: "Payment types" }));
    expect(within(fixed!).getAllByRole("cell")[0]!.textContent).toBe("—could not be read");
    expect(within(full!).getAllByRole("cell")[0]!.textContent).toBe("—");
  });

  it("exports the tables in the page's order: types, the price test, over time, the chosen segment, checkout, methods", () => {
    render(<ApPayment />);
    fireEvent.change(screen.getByLabelText("Segment by"), { target: { value: "country" } });
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(exported.sections.map((s) => s.name)).toEqual([
      "Payment types",
      "Pre-unlock price test",
      "Payments over time",
      "Who pays · Country",
      "Checkout success",
      "Payment methods",
    ]);
    const section = (name: string) => exported.sections.find((s) => s.name === name)!.table;
    // Paywall shown, the CVR and what it is of, as the table shows them.
    expect(section("Payment types").rows[1]).toEqual({
      label: "Full report on the report",
      values: ["", null, 31, 31 / 1240, 1240, "finishers", 649.93 / 31, 649.93, 1, 0, 0],
    });
    // Each half's counts, rates and money, then the choosing half's picks.
    const near = (n: number) => expect.closeTo(n, 6);
    expect(section("Pre-unlock price test").rows).toEqual([
      {
        label: "A · Fixed €1.99 (control)",
        values: [200, 180, 20, near(0.1), near(1.99), near(0.199), 39.8, null, 2],
      },
      {
        label: "B · Choose your price",
        values: [200, 190, 30, near(0.15), near(6.99), near(1.0485), 209.7, 12, 3],
      },
      {
        label: "B · Fair price · €6.99",
        values: [null, null, 20, near(0.1), near(6.99), near(0.699), 139.8, null, null],
      },
      {
        label: "B · Support our research · €19.99",
        values: [null, null, 2, near(0.01), near(19.99), near(0.1999), 39.98, null, null],
      },
      {
        label: "B · Own amount · from €0.50",
        values: [null, null, 8, near(0.04), near(3.74), near(0.1496), 29.92, null, null],
      },
    ]);
    // The segment in full, every country.
    expect(section("Who pays · Country").rows).toHaveLength(14);
  });

  it("writes a CVR over 100% but never shades it as the best", () => {
    const type = payload.types.rows[1]!;
    view.payload = {
      ...payload,
      types: {
        ...payload.types,
        rows: [
          // Sales count on the payment day, finishers on the finishing day: 6 of 5 in a short range.
          { ...type, key: "a", name: "A", sales: 6, revenue: 60, base: 5 },
          { ...type, key: "b", name: "B", sales: 1, revenue: 10, base: 10 },
          { ...type, key: "c", name: "C", sales: 5, revenue: 50, base: 10 },
        ],
      },
    };
    render(<ApPayment />);
    const table = screen.getByRole("table", { name: "Payment types" });
    const cvr = (i: number) => within(rows(table)[i]!).getAllByRole("cell")[2]!;
    expect(cvr(0).textContent).toBe("120.0%of 5 finishers");
    expect(cvr(0).className).not.toContain("text-ap-good");
    expect(cvr(1).className).toContain("text-ap-bad");
    expect(cvr(2).className).toContain("text-ap-good");
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
    };
    const empty = render(<ApPayment />);
    expect(empty.container.innerHTML).not.toMatch(/NaN|undefined|Infinity/);
    expect(screen.getByText("No paid sale in this range.")).toBeTruthy();
  });
});
