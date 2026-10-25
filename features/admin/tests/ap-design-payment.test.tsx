// @vitest-environment jsdom
/** The Payment page as synced to Marcus's design on 21 Oct 2026 (builder and page). */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Table } from "@features/admin/server/ap/common";
import type { Facts, MoneyFact, RefundFact } from "@features/admin/server/ap/facts";
import { parseFilters } from "@features/admin/server/ap/filters";
import {
  buildPayment,
  fitMonths,
  people,
  type PaymentPayload,
} from "@features/admin/server/ap/payment";
import { FIELDS } from "@features/admin/ui/ap/fields";

import { factsFixture, sub } from "./ap-fixtures";

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

import ApPayment from "@features/admin/ui/ap/ApPayment";

const TODAY = "2026-10-21";
const now = new Date("2026-10-21T10:00:00Z");

const money = (over: Partial<MoneyFact>): MoneyFact => ({
  day: "2026-10-06",
  sid: 2,
  amount: 9.99,
  plan: "full_report",
  arm: "white_card",
  device: "iOS",
  tier: "tier_1",
  ph: null,
  uid: 7,
  method: "visa",
  net: null,
  priceArm: "A3",
  src: "google",
  med: "cpc",
  ads: true,
  camp: null,
  term: null,
  ...over,
});

const refund = (over: Partial<RefundFact>): RefundFact => ({
  day: "2026-10-06",
  sid: 2,
  plan: "full_report",
  amount: 9.99,
  refund: 9.99,
  full: true,
  ...over,
});

const payment = (
  from: string,
  to: string,
  over: Partial<Facts> = {},
  f: Record<string, string> = {},
  fitFacts?: Facts,
  gateOn: boolean | null = false
) =>
  buildPayment({
    facts: factsFixture({ from, to, subs: [], money: [], checkouts: [], ...over }),
    filters: parseFilters({ period: "custom", from, to, ...f }, TODAY),
    today: TODAY,
    now,
    uplift: { enabled: false, updatedAt: "2026-08-03T18:28:00Z" },
    fitFacts,
    gateOn,
  });

/** Person 7 finished twice and paid on the second; a survey without a person; person 9 twice. */
const twice = [
  sub({ id: 1, uid: 7, day: "2026-10-05", at: "2026-10-05T10:00:00Z", gender: "Woman" }),
  sub({
    id: 2,
    uid: 7,
    day: "2026-10-06",
    at: "2026-10-06T10:00:00Z",
    gender: "Woman",
    paidAt: "2026-10-06T11:00:00Z",
    sales: 1,
    revenue: 9.99,
    plan: "full_report",
    full: true,
    fullSales: 1,
    fullRevenue: 9.99,
  }),
  sub({ id: 3, uid: null, day: "2026-10-07", at: "2026-10-07T10:00:00Z", gender: "Man" }),
  sub({ id: 4, uid: 9, day: "2026-10-08", at: "2026-10-08T10:00:00Z", gender: "Man" }),
  // Person 9 answered differently the second time: counted under each answer.
  sub({ id: 5, uid: 9, day: "2026-10-09", at: "2026-10-09T10:00:00Z", gender: "Woman" }),
];

/** Whole months whose people bought a full unlock at €10, €20 and €40: cvr = 5 / price. */
function fitFixture(months = ["2026-05", "2026-06", "2026-07"]): Facts {
  let id = 100;
  const subs = months.flatMap((m, i) => {
    const price = [10, 20, 40][i]!;
    const n = [4, 4, 8][i]!;
    const buyers = [2, 1, 1][i]!;
    return Array.from({ length: n }, (_, k) =>
      sub({
        id: ++id,
        uid: id,
        day: `${m}-10`,
        at: `${m}-10T10:00:00Z`,
        ...(k < buyers
          ? { paidAt: `${m}-11T10:00:00Z`, sales: 1, revenue: price, full: true, fullSales: 1 }
          : {}),
        fullRevenue: k < buyers ? price : 0,
      })
    );
  });
  // A May finisher who finished again the same month: still four people in May.
  subs.push(sub({ id: 999, uid: 101, day: "2026-05-12", at: "2026-05-12T10:00:00Z" }));
  return factsFixture({ from: "2026-05-01", to: "2026-09-30", subs, money: [], checkouts: [] });
}

describe("Payment builder (design sync, 21 Oct 2026)", () => {
  it("counts people once in the Payment CVR, Over time and Who pays; the full-unlock CVR stays on submissions", () => {
    const p = payment("2026-09-21", "2026-10-20", { subs: twice, money: [money({})] });
    expect(people(twice)).toHaveLength(3);
    const tile = (k: string) => p.tiles.find((t) => t.key === k)!;
    expect(tile("pay-cvr")).toMatchObject({ value: 1 / 3, note: "1 of 3 finishers" });
    expect(tile("full-cvr")).toMatchObject({ value: 1 / 5, note: "1 of 5 submissions so far" });
    expect(p.counts).toEqual({ submissions: 5, fullSubmissions: 1, finishers: 3, payers: 1 });
    const week = p.overTime.rows.find((r) => r.label === "5 Oct")!;
    expect(week).toMatchObject({ submissions: 5, finishers: 3, payers: 1, fullSales: 1 });
    const gender = p.segments.find((s) => s.key === "gender")!.rows;
    expect(gender.map((r) => [r.label, r.finishers, r.fullBuyers])).toEqual([
      ["Woman", 2, 1],
      ["Man", 2, 0],
    ]);
  });

  it("payment types: the live rows add up to the paid sales, the rest are blank, refunds as read", () => {
    const sales = [
      money({ sid: 2, amount: 9.99 }),
      money({ sid: 3, amount: 29.99, plan: "all_reports" }),
      money({ sid: 4, amount: 4.99, plan: "essentials" }),
      money({ sid: 5, amount: 0, method: null }),
    ];
    const p = payment("2026-09-21", "2026-10-20", {
      money: sales,
      refunds: [refund({ sid: 6 }), refund({ sid: 2, refund: 2, full: false })],
    });
    const rows = p.types.rows;
    // Before pay to start went live (22 Oct) and with the EUR 1.99 gate off: those rows blank.
    expect(rows.map((r) => [r.name, r.live, r.sales, r.revenue, r.refunds, r.fullRefunds])).toEqual(
      [
        ["Full unlock after report", true, 2, 39.98, 2, 1],
        ["Pre-unlock after report", false, null, null, null, null],
        ["Essentials (retired)", true, 1, 4.99, 0, 0],
        ["Pay to start · full", false, null, null, null, null],
        ["Pay to start · €1.99 pre", false, null, null, null, null],
        ["Pay to start · later purchase on the report", false, null, null, null, null],
        ["Upgrade after €1.99", false, null, null, null, null],
      ]
    );
    expect(rows.map((r) => r.line)).toEqual([
      "Free survey · live",
      "Free survey · the €1.99 gate is switched off",
      "Free survey",
      "Pay to start · live from 22 Oct 2026",
      "Pay to start · live from 22 Oct 2026",
      "Pay to start · live from 22 Oct 2026",
      "Pay to start · live from 22 Oct 2026",
    ]);
    const live = rows.filter((r) => r.live).reduce((n, r) => n + (r.sales ?? 0), 0);
    expect(live).toBe(p.tiles.find((t) => t.key === "sales")!.value);
    expect(p.types.refundsWhy).toBeNull();
    // A switch that couldn't be read is never read as off.
    const unreadGate = payment("2026-09-21", "2026-10-20", { money: sales }, {}, undefined, null);
    expect(unreadGate.types.rows.find((r) => r.key === "pre")!.line).toBe(
      "Free survey · the €1.99 gate's switch couldn't be read"
    );
    // So does the upgrade's line under Free survey, where only the gate sells the €1.99.
    const unreadFree = payment(
      "2026-10-22",
      "2026-10-28",
      { money: sales },
      { funnel: "free" },
      undefined,
      null
    );
    expect(unreadFree.types.rows.find((r) => r.key === "upgrade")!.line).toBe(
      "Free survey · the €1.99 gate's switch couldn't be read"
    );
    // Not read (an older reader): blank, never 0.
    const unread = payment("2026-09-21", "2026-10-20", { money: sales });
    expect(unread.types.rows[0]).toMatchObject({ sales: 2, refunds: null });
    expect(unread.types.refundsWhy).toBe("Refunds were not read for this range.");
    // Refunds carry no source: blank under a filter.
    const filtered = payment(
      "2026-09-21",
      "2026-10-20",
      { money: sales, refunds: [] },
      { source: "google_ads" }
    );
    expect(filtered.types.rows[0]!.refunds).toBeNull();
    expect(filtered.types.refundsWhy).toMatch(/filter leaves them blank/);
  });

  it("checkout success says how many reached the payment page", () => {
    const p = payment("2026-09-21", "2026-10-20", {
      checkouts: [
        { ...sampleCheckout, n: 3 },
        { ...sampleCheckout, status: "succeeded", attempted: true, n: 1 },
      ],
    });
    expect(p.tiles.find((t) => t.key === "checkout")!.note).toBe("1 of 4 reached the payment page");
  });

  it("over time and checkouts start at paid checkout's start, labelled as the shared buckets", () => {
    const p = payment("2026-03-21", "2026-10-20");
    const months = ["May", "Jun", "Jul", "Aug", "Sep", "Oct (to 20th)"];
    expect(p.overTime.grain).toBe("month");
    expect(p.overTime.rows.map((r) => r.label)).toEqual(months);
    expect(p.checkout.points.map((r) => r.label)).toEqual(months);
    expect(p.overTime.note).toBe(
      "From 1 May 2026, when paid checkout began: nothing was sold before."
    );
    expect(payment("2026-06-01", "2026-10-20").overTime.note).toBeNull();
  });

  it("a live pricing test is cut only by a range that cuts it", () => {
    const note = (from: string, to: string) =>
      payment(from, to).pricing.arms.find((a) => a.arm === "A3")!.note;
    expect(note("2026-09-21", "2026-10-20")).toBe("Live · from 8 Oct 17:23");
    expect(note("2026-10-14", "2026-10-20")).toBe("Live · from 8 Oct 17:23 · cut to this range");
    expect(note("2026-09-21", "2026-10-15")).toBe("Live · from 8 Oct 17:23 · cut to this range");
    const ended = payment("2026-08-01", "2026-10-20").pricing.arms.find(
      (a) => a.test === "Pricing 2.0"
    )!;
    expect(ended.note).toBe("3 Aug 22:09 – 24 Aug 04:43 · ended");
  });

  it("the elasticity fits every whole month since 1 May, whatever the range's start, per person", () => {
    expect(fitMonths("2026-10-20")).toEqual({ from: "2026-05-01", to: "2026-09-30" });
    expect(fitMonths("2026-09-30")).toEqual({ from: "2026-05-01", to: "2026-09-30" });
    expect(fitMonths("2026-05-30")).toBeNull();
    const el = payment("2026-09-21", "2026-10-20", {}, {}, fitFixture()).elasticity;
    expect(el.points.map((x) => [x.label, x.price, x.cvr, x.finishers])).toEqual([
      ["May", 10, 0.5, 4],
      ["Jun", 20, 0.25, 4],
      ["Jul", 40, 0.125, 8],
    ]);
    expect(el.months).toBe("May – Jul");
    expect(el.fit!.e).toBeCloseTo(-1);
    expect(el.why).toBeNull();
    // A month without a full unlock is left out, and named around.
    const gap = payment(
      "2026-09-21",
      "2026-10-20",
      {},
      {},
      fitFixture(["2026-05", "2026-06", "2026-08"])
    );
    expect(gap.elasticity.months).toBe("May, Jun and Aug");
    // Ending before three whole months exist keeps the reason.
    const early = payment("2026-06-15", "2026-07-15", {}, {}, fitFixture());
    expect(early.elasticity.fit).toBeNull();
    expect(early.elasticity.why).toBe(
      "The model needs three whole months from 1 May 2026, when paid checkout began, whose finishers bought a full unlock; up to this range's end there are two."
    );
    // A filter the records can't follow back to May leaves it blank, though the range is fine.
    const google = payment("2026-09-21", "2026-10-20", {}, { source: "google_ads" }, fitFixture());
    expect(google.blocked).toBeNull();
    expect(google.elasticity.why).toBe(
      "The model is fitted on every whole month from 1 May 2026, when paid checkout began, but sources are recorded only from 19 Jul 2026: it can't follow this filter."
    );
  });

  it("leaves out the notes about visits and unfinished starts, which concern other pages", () => {
    const notes = payment("2026-03-21", "2026-10-20").notes;
    expect(notes.some((n) => /visit log/i.test(n))).toBe(false);
    expect(notes.some((n) => /Unfinished survey starts/.test(n))).toBe(false);
    expect(notes.some((n) => /^A person's source is recorded/.test(n))).toBe(true);
  });

  it("orders the device rows by paid sales, Not recorded last", () => {
    const p = payment("2026-09-21", "2026-10-20", {
      subs: [
        sub({ id: 1, device: "Android" }),
        sub({ id: 2, device: "Desktop", sales: 2, revenue: 20, paidAt: "2026-10-01T11:00:00Z" }),
        sub({ id: 3, device: "iOS", sales: 1, revenue: 10, paidAt: "2026-10-01T11:00:00Z" }),
        sub({ id: 4, device: null, sales: 3, revenue: 30, paidAt: "2026-10-01T11:00:00Z" }),
      ],
    });
    expect(p.segments.find((s) => s.key === "device")!.rows.map((r) => r.label)).toEqual([
      "Desktop",
      "iOS",
      "Android",
      "Not recorded",
    ]);
  });
});

const sampleCheckout = {
  day: "2026-10-02",
  sid: null,
  ph: null,
  status: "canceled",
  attempted: false,
  plan: "full_report",
  priceArm: "A3",
  arm: "white_card",
  device: "iOS",
  tier: "tier_1",
  src: "google",
  med: "cpc",
  ads: true,
  n: 1,
};

/** A page from the builder itself: two sales, the model fitted. */
function built(): PaymentPayload {
  return payment(
    "2026-09-21",
    "2026-10-20",
    {
      subs: twice,
      money: [
        money({ sid: 2, amount: 9.99 }),
        money({ sid: 3, amount: 29.99, plan: "all_reports", method: "link" }),
      ],
      refunds: [],
      checkouts: [{ ...sampleCheckout, status: "succeeded", attempted: true, n: 2 }],
    },
    {},
    fitFixture()
  );
}

afterEach(() => cleanup());

describe("Payment page (design sync, 21 Oct 2026)", () => {
  it("puts an info icon, defined, on every figure", () => {
    view.payload = built();
    render(<ApPayment />);
    const icons = screen.getAllByRole("button", { name: /^About / });
    // Nothing undefined: a missing key shows "Not defined yet.".
    expect(icons.filter((b) => b.getAttribute("title") === "Not defined yet.")).toEqual([]);
    const names = new Set(icons.map((b) => b.getAttribute("aria-label")));
    for (const label of [
      "Revenue",
      "Paid sales",
      "Pre-unlocks",
      "Pre-unlock CVR",
      "Full unlocks",
      "Full-unlock CVR",
      "Avg. order value",
      "Payment CVR",
      "Checkout success",
      "Sales",
      "Average price",
      "Share of revenue",
      "Refunds",
      "Refund rate",
      "Pre-unlock and full-unlock payments over time",
      "Pre-unlock sales",
      "Full-unlock avg.",
      "Finishers",
      "a) Reached payment page",
      "b) Filled in and attempted",
      "c) Payment succeeded",
      "Payment methods",
      "AOV",
      "Share of sales",
      "Full CVR",
      "Rev. / finisher",
      "Arm",
      "Base price",
      "Paywall views",
      "Checkout → paid",
      "AOV lift · confidence",
      "Country tier",
      "Discount step",
      "Price elasticity prediction",
      "Price elasticity",
      "Best price (net revenue)",
      // The tiles name the price they read ("At €15.00", "At today’s €29.99 (A3)").
      "At €",
      "At today’s",
    ]) {
      // Named as the page names the figure, which may add its value ("At the price tested · €15").
      expect(
        [...names].some((n) => n === `About ${label}` || n.startsWith(`About ${label}`)),
        label
      ).toBe(true);
    }
    // Every numeric column of every table has one.
    for (const t of screen.getAllByRole("table")) {
      const heads = within(t).getAllByRole("columnheader").slice(1);
      const numeric = heads.filter((h) => h.textContent !== "Arm" && h.textContent !== "Month");
      for (const h of numeric)
        expect(within(h).queryByRole("button"), h.textContent!).not.toBeNull();
    }
  });

  it("payment types once pay to start is live: each sale in one row, by its journey", () => {
    // Pay to start's own purchase carries its journey; every payment on its survey is pay to start's.
    const pts = { journey: "pay_to_start", pts: true };
    const sales = [
      // The free survey's full unlock, and one bought after a paid EUR 1.99 (its upgrade).
      money({ sid: 2, day: "2026-10-24", amount: 19.99 }),
      money({ sid: 3, day: "2026-10-25", amount: 9.99, upgrade: true }),
      // The report's EUR 1.99 gate.
      money({ sid: 3, day: "2026-10-24", amount: 1.99, plan: "initial" }),
      // Pay to start's own purchases: the report in full and the EUR 1.99 first.
      money({ sid: 4, day: "2026-10-24", amount: 29.99, ...pts }),
      money({ sid: 5, day: "2026-10-26", amount: 1.99, plan: "initial", ...pts }),
      // A 100% code's EUR 0 purchase is no sale.
      money({ sid: 6, day: "2026-10-26", amount: 0, method: null, ...pts }),
      // What a pay-to-start reader bought on the report after: its own row, not the free survey's.
      money({ sid: 4, day: "2026-10-27", amount: 9.99, plan: "all_reports", pts: true }),
    ];
    const p = payment(
      "2026-10-22",
      "2026-10-28",
      { money: sales, refunds: [refund({ sid: 7, day: "2026-10-24", amount: 29.99, ...pts })] },
      {},
      undefined,
      true
    );
    const rows = p.types.rows;
    expect(rows.map((r) => [r.key, r.live, r.sales, r.revenue, r.refunds, r.fullRefunds])).toEqual([
      ["full", true, 1, 19.99, 0, 0],
      ["pre", true, 1, 1.99, 0, 0],
      ["pay-full", true, 1, 29.99, 1, 1],
      ["pay-pre", true, 1, 1.99, 0, 0],
      ["pay-later", true, 1, 9.99, 0, 0],
      ["upgrade", true, 1, 9.99, 0, 0],
    ]);
    expect(rows.map((r) => r.line)).toEqual([
      "Free survey · live",
      "Free survey · the €1.99 gate is on",
      "Pay to start · live",
      "Pay to start · live",
      "Pay to start · live",
      "Both funnels · live",
    ]);
    // Every paid sale in one row: the rows add up to the Paid sales tile.
    expect(rows.reduce((n, r) => n + (r.sales ?? 0), 0)).toBe(
      p.tiles.find((t) => t.key === "sales")!.value
    );
    // With the gate switched off and nothing sold through it, its row is blank, never 0.
    const off = payment("2026-10-22", "2026-10-28", { money: sales.filter((m) => m.sid !== 3) });
    expect(off.types.rows.find((r) => r.key === "pre")).toMatchObject({ live: false, sales: null });
    // Only pay to start sells the EUR 1.99 then, so only it can lead to an upgrade.
    expect(off.types.rows.find((r) => r.key === "upgrade")!.line).toBe(
      "Pay to start · live (the report's €1.99 gate is switched off)"
    );
    // Switched off now but sold in the range: shown, so the rows still add up to the sales.
    const offSold = payment("2026-10-22", "2026-10-28", { money: sales });
    expect(offSold.types.rows.find((r) => r.key === "pre")).toMatchObject({ live: true, sales: 1 });
    // "Free survey": pay to start's rows are blank, its refunds out, and the rows still add up.
    const free = payment(
      "2026-10-22",
      "2026-10-28",
      { money: sales, refunds: [refund({ sid: 7, day: "2026-10-24", amount: 29.99, ...pts })] },
      { funnel: "free" },
      undefined,
      true
    );
    const freeRows = free.types.rows;
    for (const key of ["pay-full", "pay-pre", "pay-later"])
      expect(freeRows.find((r) => r.key === key)).toMatchObject({
        live: false,
        sales: null,
        refunds: null,
        line: "Pay to start · left out by the Funnel filter",
      });
    expect(freeRows.find((r) => r.key === "upgrade")).toMatchObject({
      sales: 1,
      line: "Free survey · live",
    });
    expect(freeRows.reduce((n, r) => n + (r.sales ?? 0), 0)).toBe(
      free.tiles.find((t) => t.key === "sales")!.value
    );
  });

  it("blanks the free survey's €1.99 figures, with why, while its gate is off and none was sold in it", () => {
    // Pay to start's €1.99 sold; nothing went through the report's own gate.
    const pts = { journey: "pay_to_start", pts: true };
    const noGateSale = {
      money: [
        money({ sid: 2, day: "2026-10-24", amount: 19.99 }),
        money({ sid: 5, day: "2026-10-26", amount: 1.99, plan: "initial", ...pts }),
      ],
    };
    const at = (gate: boolean | null, funnel = "free") =>
      payment("2026-10-22", "2026-10-28", noGateSale, { funnel }, undefined, gate);
    const tile = (p: ReturnType<typeof at>, k: string) => p.tiles.find((t) => t.key === k)!;
    const off = at(false);
    expect(tile(off, "pre")).toMatchObject({
      value: null,
      note: "Not sold in the free survey: the report's €1.99 gate is switched off.",
      spark: [],
    });
    expect(tile(off, "pre-cvr")).toMatchObject({ value: null, spark: [] });
    expect(off.overTime.preOnSale).toBe(false);
    expect(off.overTime.preWhy).toMatch(/gate is switched off/);
    // A switch that couldn't be read is said so, never read as off.
    expect(tile(at(null), "pre").note).toMatch(/switch couldn't be read/);
    // With the gate on, the free survey's 0 is a real 0.
    expect(tile(at(true), "pre").value).toBe(0);
    // All funnels: pay to start's €1.99 sale counts, as before.
    expect(tile(at(false, "all"), "pre").value).toBeGreaterThan(0);
  });

  it("draws the payment types between the tiles and Over time, with whole euros where drawn", () => {
    view.payload = built();
    render(<ApPayment />);
    const h2 = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent?.trim());
    expect(h2.slice(0, 2)).toEqual([
      "Payment types",
      "Pre-unlock and full-unlock payments over time",
    ]);
    const table = screen.getByRole("table", { name: "Payment types" });
    const cells = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((r) =>
        [...r.querySelectorAll('[role="rowheader"], [role="cell"]')].map((c) => c.textContent)
      );
    expect(cells[0]).toEqual([
      "Full unlock after reportFree survey · live",
      "2",
      "€19.99",
      "€39.98",
      "100.0%",
      "0",
      "0.0%",
    ]);
    expect(cells[1]).toEqual([
      "Pre-unlock after reportFree survey · the €1.99 gate is switched off",
      "—",
      "—",
      "—",
      "—",
      "—",
      "—",
    ]);
    expect(
      screen.getByText(
        "Refunds come from the payment records (refunded in full or in part). Pay to start is live from 22 Oct 2026; the report's €1.99 gate only while it is switched on."
      )
    ).toBeTruthy();
    // The Revenue tile in whole euros; the elasticity's dots too ("May €10").
    expect(
      screen.getAllByText("Revenue")[0]!.parentElement!.textContent!.replace(/\u00a0/g, " ")
    ).toBe("Revenue €4021 Sep – 20 Oct 2026");
    expect(screen.getByText("May €10")).toBeTruthy();
    expect(
      screen.getByText(/fitted to monthly full-unlock price and payment conversion, May – Jul\./)
    ).toBeTruthy();
    expect(screen.getByText(/^Low confidence: three monthly points/)).toBeTruthy();
    // The CSV carries the table first.
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    expect(exported.sections[0]!.name).toBe("Payment types");
    expect(exported.sections[0]!.table.rows[0]!.values).toEqual([
      "Free survey · live",
      2,
      19.99,
      39.98,
      1,
      0,
      0,
    ]);
  });

  it("leaves relationships and countries under 15 finishers out, and says so", () => {
    const base = built();
    const row = (label: string, finishers: number) => ({
      ...base.segments[0]!.rows[0]!,
      label,
      finishers,
    });
    view.payload = {
      ...base,
      segments: base.segments.map((s) =>
        s.key === "country" ? { ...s, rows: [row("United States", 40), row("Malta", 3)] } : s
      ),
    };
    render(<ApPayment />);
    const card = screen.getByRole("region", { name: "Who pays" });
    fireEvent.change(within(card).getByLabelText("Segment by"), { target: { value: "country" } });
    const names = within(within(card).getByRole("table"))
      .getAllByRole("rowheader")
      .map((r) => r.textContent);
    expect(names).toEqual(["United States"]);
    expect(within(card).getByText(/Smaller groups are left out\./)).toBeTruthy();
    // Gender keeps every group.
    fireEvent.change(within(card).getByLabelText("Segment by"), { target: { value: "gender" } });
    expect(within(card).queryByText(/Smaller groups are left out/)).toBeNull();
  });

  it("writes every Payment query whole", () => {
    const keys = Object.keys(FIELDS).filter((x) => x.startsWith("payment."));
    expect(keys.length).toBeGreaterThanOrEqual(60);
    for (const k of keys) expect(FIELDS[k]!.query.text, k).not.toMatch(/undefined|\$\{/);
  });
});
