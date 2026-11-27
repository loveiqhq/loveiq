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

// The test's switch-on day.
const DAY = "2026-11-26";
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
    // Named as Marcus's board names the picks, with this page's amounts.
    expect(block.options.map((o) => [o.name, o.sub])).toEqual([
      ["Fair price · €6.99", "recommended"],
      ["Support our research · €19.99", ""],
      ["Own amount · from €0.50", "avg. of what they typed"],
    ]);
    expect(block.arms.map((x) => [x.name, x.sub])).toEqual([
      ["A · Fixed €1.99", "Control: today’s page"],
      ["B · Choose your price", "Suggested €6.99"],
    ]);
  });

  it("says too early under 50 finishers, in the board's words", () => {
    const block = build(
      [finisher(1, { pays: [paid(1.99)] }), finisher(2, { pays: [paid(6.99)] })],
      [row(1, "fixed"), row(2, "choose")]
    );
    expect(block.verdict).toBe(
      "Choose your price earns €6.99 per finisher against €1.99, with the same pay rate (100.0% vs 100.0%) and 0 free claims. Too early to call: the smaller half has 1 free finisher, so treat any gap as noise for now. Watch the free claims and the share choosing the lowest amounts: if they grow, the average price falls. To call it, each arm needs at least 5 paying readers per price option."
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
      /^Choose your price earns €2\.33 per finisher against €0\.20, with a higher pay rate \(33\.3% vs 10\.0%\) and 0 free claims\. The pay-rate gap is real \(/
    );
    expect(block.verdict).toMatch(
      /Watch the free claims and the share choosing the lowest amounts: if they grow, the average price falls\. To call it, each arm needs at least 5 paying readers per price option\.$/
    );
  });

  it("drops the board's bar once every price has five paying readers in its half", () => {
    const subs: SubFact[] = [];
    const rows: PriceTestRow[] = [];
    const choices = new Map<number, ChoosePriceOption>();
    // A: 6 of 60 paid EUR 1.99. B: five each paid 6.99, 19.99 and their own 3; 3 took it free.
    const five = (pick: ChoosePriceOption) => Array.from({ length: 5 }, () => pick);
    const picks: ChoosePriceOption[] = [
      ...five("fair"),
      ...five("support"),
      ...five("custom"),
      "free",
      "free",
      "free",
    ];
    const price: Record<ChoosePriceOption, number> = {
      fair: 6.99,
      support: 19.99,
      custom: 3,
      free: 0,
    };
    for (let i = 1; i <= 120; i += 1) {
      const choose = i > 60;
      const pick = choose ? picks[i - 61] : undefined;
      const amount = pick ? price[pick] : i <= 6 ? 1.99 : 0;
      subs.push(finisher(i, { pays: amount > 0 ? [paid(amount)] : [] }));
      rows.push(row(i, choose ? "choose" : "fixed"));
      if (pick) choices.set(i, pick);
    }
    const block = build(subs, rows, choices);
    expect(block.options.map((o) => o.n)).toEqual([5, 5, 5]);
    expect(block.verdict).toMatch(/ and 3 free claims\. /);
    expect(block.verdict).toMatch(/the average price falls\.$/);
    expect(block.verdict).not.toContain("To call it");
  });

  it("says a lower pay rate when the choosing half pays less often, and leaves the bar to say why", () => {
    const subs: SubFact[] = [];
    const rows: PriceTestRow[] = [];
    for (let i = 1; i <= 80; i += 1) {
      const choose = i > 40;
      // 8 of 40 paid EUR 1.99; 3 of 40 paid 6.99, too few payments to compare the rates.
      const pays = choose ? (i <= 43 ? [paid(6.99)] : []) : i <= 8 ? [paid(1.99)] : [];
      subs.push(finisher(i, { pays }));
      rows.push(row(i, choose ? "choose" : "fixed"));
    }
    expect(build(subs, rows).verdict).toBe(
      "Choose your price earns €0.52 per finisher against €0.40, with a lower pay rate (7.5% vs 20.0%) and 0 free claims. Watch the free claims and the share choosing the lowest amounts: if they grow, the average price falls. To call it, each arm needs at least 5 paying readers per price option."
    );
  });

  it("says why it is blank: before the test, a filter it can't follow, or a failed read", () => {
    // Up to the day before its switch-on.
    expect(build([], [], new Map(), { to: "2026-11-25" }).why).toMatch(
      /^Not running in this range: the test starts with its switch, from 26 Nov 2026/
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
    // Berlin midnight, 26 Nov, for both: the halves never from before the switch-on.
    expect(rows).toContain("created_date_time=gte.2026-11-25T23:00:00.000Z");
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
