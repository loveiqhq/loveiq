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
  buildPriceTest,
  priceArmOf,
  PRICE_TEST_NAME,
  readPriceTestChoices,
  readPriceTestRows,
  type PriceTestRow,
} from "@features/admin/server/ap/gate-price-test";
import type { ChoosePriceOption } from "@features/report/logic/choosePrice";
import { FIELDS } from "@features/admin/ui/ap/fields";

import { sub } from "./ap-fixtures";

const DAY = "2026-11-25";
const at = (minute: number) => new Date(Date.parse(`${DAY}T09:00:00Z`) + minute * 60_000);
const paid = (amount: number): [number, number, string] => [
  Math.floor(at(30).getTime() / 1000),
  amount,
  "initial",
];
const finisher = (id: number, over: Partial<SubFact> = {}) =>
  sub({ id, day: DAY, at: at(id).toISOString(), ...over });
const row = (id: number, arm: string | null, over: Partial<PriceTestRow> = {}): PriceTestRow => ({
  id,
  utm_tracker: JSON.stringify(arm ? { utm_source: "google", gate_reveal_arm: arm } : {}),
  ...over,
});
const build = (
  subs: SubFact[],
  rows: PriceTestRow[] | null,
  choices: Map<number, ChoosePriceOption> | null = new Map(),
  over: Partial<Parameters<typeof buildPriceTest>[0]> = {}
) => buildPriceTest({ subs, rows, choices, gateSeen: new Set(), blocked: null, to: DAY, ...over });

beforeEach(() => mockFetchAllRows.mockReset());

describe("AP Payment · the pre-unlock price test", () => {
  it("files finishers by the test's own stamp only: #11's halves and no stamp stay out", () => {
    expect(priceArmOf(row(1, "fixed"))).toBe("fixed");
    expect(priceArmOf(row(1, "choose"))).toBe("choose");
    for (const arm of ["control", "reveal", null]) expect(priceArmOf(row(1, arm))).toBeNull();
    expect(priceArmOf({ utm_tracker: "not json" })).toBeNull();
  });

  it("leaves out a survey bought before it was taken, either way the records say so", () => {
    const block = build(
      [finisher(1, { pts: true }), finisher(2), finisher(3)],
      [
        row(1, "choose"),
        row(2, "choose", {
          utm_tracker: JSON.stringify({ journey: "pay_to_start", gate_reveal_arm: "choose" }),
        }),
        row(3, "choose"),
      ]
    );
    expect(block.arms.map((a) => a.finishers)).toEqual([0, 1]);
  });

  it("counts EUR 0 as a free claim, never a sale, and files each sale under its pick", () => {
    const block = build(
      [
        finisher(1, { pays: [paid(1.99)] }),
        finisher(2, { pays: [paid(6.99)] }),
        finisher(3, { pays: [paid(19.99)] }),
        finisher(4, { pays: [paid(3)] }),
        // A sale with no pick recorded: the reader's own amount.
        finisher(5, { pays: [paid(5)] }),
        finisher(6),
      ],
      [1, 2, 3, 4, 5, 6].map((id) => row(id, id === 1 ? "fixed" : "choose")),
      new Map<number, ChoosePriceOption>([
        [2, "fair"],
        [3, "support"],
        [4, "custom"],
        [6, "free"],
      ])
    );
    const [a, b] = block.arms;
    expect([a!.paid, a!.free, b!.paid, b!.free]).toEqual([1, 0, 4, 1]);
    expect(block.options.map((o) => [o.option, o.n, Math.round(o.revenue * 100)])).toEqual([
      ["fair", 1, 699],
      ["support", 1, 1999],
      ["custom", 2, 800],
    ]);
    // The options' names are the page's tiles'.
    expect(block.options.map((o) => o.name)).toEqual([
      "€6.99 · Recommended",
      "€19.99 · Support our research",
      "Your own amount",
    ]);
    expect(block.arms.map((x) => [x.name, x.sub])).toEqual([
      ["A · Fixed €1.99", "Control: today’s page"],
      ["B · Choose your price", "€6.99 recommended"],
    ]);
  });

  it("says too early under 50 finishers, and leads with revenue per finisher", () => {
    const block = build(
      [finisher(1, { pays: [paid(1.99)] }), finisher(2, { pays: [paid(6.99)] })],
      [row(1, "fixed"), row(2, "choose")]
    );
    expect(block.verdict).toBe(
      "Choose your price earns €6.99 per free finisher against €1.99 on today’s page; 100.0% paid against 100.0%, and 0 readers took it for €0. Too early to call: the smaller half has 1 free finisher, so treat any gap as noise for now."
    );
  });

  it("compares the pay rates by the shared readouts' rules once there are enough", () => {
    const subs: SubFact[] = [];
    const rows: PriceTestRow[] = [];
    for (let i = 1; i <= 120; i += 1) {
      const choose = i > 60;
      // 6 of 60 paid EUR 1.99; 20 of 60 chose a price.
      const pays = choose ? (i <= 80 ? [paid(6.99)] : []) : i <= 6 ? [paid(1.99)] : [];
      subs.push(finisher(i, { pays }));
      rows.push(row(i, choose ? "choose" : "fixed"));
    }
    const block = build(subs, rows);
    expect(block.verdict).toMatch(
      /^Choose your price earns €2\.33 per free finisher against €0\.20/
    );
    expect(block.verdict).toMatch(/The pay-rate gap is real \(/);
    expect(block.verdict).toMatch(/Revenue per finisher decides it/);
  });

  it("says why it is blank: before the test, a filter it can't follow, or a failed read", () => {
    expect(build([], [], new Map(), { to: "2026-11-23" }).why).toMatch(
      /^Not running in this range: the test starts with its switch, from 24 Nov 2026/
    );
    expect(build([], [], new Map(), { blocked: "Tablets aren't recorded" }).why).toBe(
      "Tablets aren't recorded"
    );
    expect(build([], null).why).toBe("Who is in which half could not be read just now.");
    expect(build([], [], null).why).toBe("Who is in which half could not be read just now.");
    expect(build([], []).verdict).toBe("No data yet.");
    expect(build([], []).test).toBe(PRICE_TEST_NAME);
  });

  it("reads from the range's first day, never before the test could stamp anyone", async () => {
    mockFetchAllRows.mockResolvedValue([]);
    await readPriceTestRows("2026-11-01");
    await readPriceTestChoices("2026-11-26");
    const [rows, choices] = mockFetchAllRows.mock.calls.map(([p]) => decodeURIComponent(p));
    // Berlin midnight, 24 and 26 Nov.
    expect(rows).toContain("created_date_time=gte.2026-11-23T23:00:00.000Z");
    expect(choices).toContain("created_date_time=gte.2026-11-25T23:00:00.000Z");
    expect(choices).toContain("metadata->>priceOption=not.is.null");
    expect(choices).toContain("is_test=is.false");
  });

  it("keeps each survey's first pick", async () => {
    mockFetchAllRows.mockResolvedValue([
      { option: "fair", personal_report: { survey_submission_id: 7 } },
      { option: "custom", personal_report: { survey_submission_id: 7 } },
      { option: "bogus", personal_report: { survey_submission_id: 8 } },
      { option: "free", personal_report: null },
    ]);
    expect([...(await readPriceTestChoices(DAY))!]).toEqual([[7, "fair"]]);
  });

  // As on every AP number: its info card's query counts it as the page does.
  it("shows the query behind each figure, the team, pay to start and #11 left out", () => {
    const keys = [
      "payment.gp-arm",
      "payment.gp-finishers",
      "payment.gp-reached",
      "payment.gp-paid",
      "payment.gp-rate",
      "payment.gp-avg",
      "payment.gp-revenue",
      "payment.gp-full",
    ];
    for (const k of keys) expect(FIELDS[k]?.query.lang, k).toBe("SQL");
    const q = FIELDS["payment.gp-revenue"]!.query.text;
    expect(new Set(keys.map((k) => FIELDS[k]!.query.text)).size).toBe(1);
    expect(q).toContain("j->>'gate_reveal_arm' in ('fixed', 'choose')");
    expect(q).toContain("and not exists (select 1 from ap_team_user t where t.id = s.user_id)");
    expect(q).toContain("pa.consumed_submission_id = s.id and pa.offer is not null");
    expect(q).toContain("coalesce(j->>'journey', '') <> 'pay_to_start'");
    expect(q).toContain("p.metadata->>'priceOption' = 'free'");
    expect(q).toContain("p.metadata->>'plan' = 'initial'");
    // #11's own query keeps the price test's finishers out of both its halves.
    expect(FIELDS["payment.gt-rate"]!.query.text).toContain(
      "coalesce(j->>'gate_reveal_arm', '') not in ('fixed', 'choose')"
    );
  });
});
