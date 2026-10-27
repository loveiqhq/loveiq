import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

type Call = { path: string; init?: { method?: string; body?: string } };
const calls: Call[] = [];
let rows: Array<Record<string, unknown>> = [];
let upsertStatus = 200;
/** get_price_list_changes as production returns it: the pinned 2.x changes, then the history's. */
const list = (changed_at: string, arm: string, prices: Record<string, number>) =>
  Object.entries(prices).map(([plan, starting_price]) => ({
    changed_at,
    arm,
    plan,
    starting_price,
  }));
const PRICE_LISTS = [
  ...list("2026-08-03T20:09:45+00:00", "A", { full_report: 9.99, core: 19.99, all_reports: 29.99 }),
  ...list("2026-08-03T20:09:45+00:00", "B", { full_report: 29, core: 39, all_reports: 49 }),
  ...list("2026-08-24T02:43:12+00:00", "A", { full_report: 39.99, core: 49.99, all_reports: 59 }),
  ...list("2026-08-31T10:09:20+00:00", "A", { full_report: 29, core: 39, all_reports: 49 }),
  ...list("2026-10-06T18:18:28.684862+00:00", "A3", { full_report: 29.99, all_reports: 39.99 }),
  ...list("2026-10-06T18:18:28.684862+00:00", "B3", { full_report: 14.99, all_reports: 19.99 }),
  ...list("2026-10-08T15:23:00.289392+00:00", "B3", { full_report: 4.99, all_reports: 6.99 }),
];
const mockSupabaseFetch = vi.fn(async (path: string, init?: { method?: string; body?: string }) => {
  calls.push({ path, init });
  if (path.startsWith("/rest/v1/rpc/get_price_list_changes")) {
    return { ok: true, status: 200, json: async () => PRICE_LISTS, text: async () => "" };
  }
  if (path.startsWith("/rest/v1/rpc/admin_upsert_experiment")) {
    // The upsert returns the id it wrote: the one it was given, or a new one.
    const id =
      (JSON.parse(init?.body ?? "{}") as { p_experiment_id?: number }).p_experiment_id ?? 7;
    return upsertStatus === 200
      ? { ok: true, status: 200, json: async () => id, text: async () => String(id) }
      : {
          ok: false,
          status: upsertStatus,
          json: async () => ({}),
          text: async () => "name is required",
        };
  }
  if (path.startsWith("/rest/v1/admin_experiment") && init?.method === "PATCH") {
    return { ok: true, status: 204, json: async () => null, text: async () => "" };
  }
  if (path.startsWith("/rest/v1/admin_experiment")) {
    const id = /id=eq\.(\d+)/.exec(path)?.[1];
    const out = id ? rows.filter((r) => String(r.id) === id) : rows;
    return { ok: true, status: 200, json: async () => out, text: async () => "" };
  }
  throw new Error(`unexpected fetch ${path}`);
});
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (path: string, init?: { method?: string; body?: string }) =>
    mockSupabaseFetch(path, init),
}));
vi.mock("@features/brain/server/people", () => {
  const eman = { canonical: "Eman Cickusic", kind: "person" };
  const marcus = { canonical: "Marcus Börner", kind: "person" };
  return {
    loadPeople: async () =>
      new Map<string, unknown>([
        ["eman cickusic", eman],
        ["eman@gmail.com", eman],
        ["eman@loveiq.org", eman],
        ["marcus börner", marcus],
        ["mb@loveiq.org", marcus],
      ]),
  };
});

import {
  listExperiments,
  perArmSample,
  priceStretches,
  recordExperiment,
} from "@features/brain/server/experiments";
import type { ArmOutcomes } from "@features/admin/server/experiment-readouts";
import { PRICE_TEST_START_AT } from "@features/checkout/server/reportPurchase";

const NOW = Date.parse("2026-09-26T09:00:00Z");
const row = (over: Record<string, unknown> = {}) => ({
  id: 3,
  owner_email: "mb@loveiq.org",
  name: "Guarantee badge on the paywall",
  hypothesis: "A money-back badge makes more report openers pay.",
  segment_id: null,
  primary_metric_key: "share of report openers who pay",
  guardrail_metric_keys: ["refund rate"],
  status: "active",
  start_date: "2026-09-20",
  decision_date: null,
  expected_impact: "+1 point",
  result_summary: "entered in /admin",
  outcome: null,
  readout_method: "conversion-rate",
  control_sample_size: 120,
  control_success_count: 3,
  variant_sample_size: 118,
  variant_success_count: 5,
  control_metric_value: null,
  variant_metric_value: null,
  control_stddev_value: null,
  variant_stddev_value: null,
  readout_notes: "typed by hand",
  axis: "landing",
  ...over,
});
/** Submissions stamped with landing arms, and which of them bought. */
function outcomes(arms: Array<[string, boolean]>): ArmOutcomes {
  const submissions = arms.map(([arm], i) => ({
    id: i + 1,
    created_date_time: "2026-09-21T10:00:00Z",
    utm_tracker: JSON.stringify({ landing_variant: arm }),
  }));
  const bySubmission = new Map(
    arms.map(([, bought], i) => [
      i + 1,
      { pricing: null, purchased: bought, startedCheckout: bought, revenue: bought ? 19 : 0 },
    ])
  );
  return { submissions, bySubmission, truncated: false };
}
const body = (c: Call) => JSON.parse(c.init?.body ?? "{}") as Record<string, unknown>;
/** No completed submissions in the window. */
const nobody = (): ArmOutcomes => ({ submissions: [], bySubmission: new Map(), truncated: false });

beforeEach(() => {
  calls.length = 0;
  rows = [];
  upsertStatus = 200;
});
afterEach(() => mockSupabaseFetch.mockClear());

describe("experiments: the registry, read", () => {
  it("times an unregistered landing test's pace from its restart, as /admin counts it", async () => {
    // 70 readers per arm before the restart at the condensed phone hero and 70 after.
    const at = (day: string, arm: string, i: number) => ({
      id: i,
      created_date_time: `${day}T10:00:00Z`,
      utm_tracker: JSON.stringify({ landing_variant: arm }),
    });
    const submissions = (["2026-10-08", "2026-10-17"] as const).flatMap((day, d) =>
      (["white_card", "white_video"] as const).flatMap((arm, a) =>
        Array.from({ length: 70 }, (_, i) => at(day, arm, d * 1000 + a * 100 + i + 1))
      )
    );
    const load = vi.fn(async (): Promise<ArmOutcomes> => ({
      submissions,
      bySubmission: new Map(
        submissions.map((s) => [
          s.id,
          { pricing: null, purchased: false, startedCheckout: false, revenue: 0 },
        ])
      ),
      truncated: false,
    }));
    const text = await listExperiments(Date.parse("2026-10-20T09:00:00Z"), load);
    // 70 a side in the 2.96 days since 17 Oct; from 8 Oct's readers it would read 5.9.
    expect(text).toContain("At 23.7 a day per arm");
    expect(text).not.toContain("At 5.9 a day per arm");
  });

  it("names the landing test as running unregistered, lists the tests that ended before the registry, and how to start one", async () => {
    const load = vi.fn(async () => nobody());
    const text = await listExperiments(NOW, load);
    // The landing split is randomised with nothing registered against it, so it is named.
    expect(text).toContain(
      "RUNNING NOW\n- Landing page design: being randomised with no hypothesis on record; register it with record_experiment."
    );
    // Pricing 3.0 ended when the EUR 1.99 gate went on (27.10): it draws no new readers.
    expect(text).not.toContain("Report pricing: being randomised");
    expect(text).not.toContain("No test is being randomised");
    expect(text).toContain(
      "- Landing page design (V1 vs V2) (before the registry): Finished on 19 September 2026"
    );
    expect(text).toContain("- Report pricing (A vs B) (before the registry):");
    expect(text).toContain("- Paywall style (before the registry):");
    expect(text).toContain("- Survey design (white vs dark) (before the registry):");
    expect(text).toContain("Before the next test starts, record it with record_experiment");
    // Archived tests are left out by the query itself; the live split's last 30 days were read.
    expect(calls[0]!.path).toContain("status=neq.archived");
    expect(load).toHaveBeenCalledWith("2026-08-27T00:00:00Z");
  });

  it("reads a running test live from its own start, in /admin's words", async () => {
    rows = [row()];
    // Round 3's arm A: a live arm, so the live readout counts it.
    const arms: Array<[string, boolean]> = [
      ...Array.from({ length: 40 }, (): [string, boolean] => ["white_card", false]),
      ...Array.from({ length: 5 }, (): [string, boolean] => ["white_card", true]),
    ];
    const load = vi.fn(async () => outcomes(arms));
    const text = await listExperiments(NOW, load);
    // From its first day's Berlin midnight, as /admin cuts (CEST: 22:00 UTC the day before).
    expect(load).toHaveBeenCalledWith("2026-09-19T22:00:00.000Z");
    expect(text).toContain(
      "- #3 Guarantee badge on the paywall (active, Landing page design, 2026-09-20 onwards). " +
        "Hypothesis: A money-back badge makes more report openers pay. Decided by: share of report openers who pay. Expected: +1 point"
    );
    expect(text).toMatch(/ {2}So far: .*5 of 45 bought \(11\.1%\)/);
    expect(text).not.toContain("- None. No test is being randomised");
  });

  it("counts a paused test as running, and reads a pricing test from the arm on its quote", async () => {
    rows = [row({ id: 6, status: "paused", axis: "pricing", start_date: "2026-09-22" })];
    // Pricing 3.0's arm, on readers who finished once it was live.
    const priced: ArmOutcomes = {
      submissions: [1, 2, 3].map((id) => ({
        id,
        created_date_time: PRICE_TEST_START_AT,
        utm_tracker: null,
      })),
      bySubmission: new Map([
        [1, { pricing: "B3", purchased: true, startedCheckout: true, revenue: 19.99 }],
        [2, { pricing: "B3", purchased: false, startedCheckout: false, revenue: 0 }],
        [3, { pricing: "B3", purchased: false, startedCheckout: false, revenue: 0 }],
      ]),
      truncated: false,
    };
    const text = await listExperiments(
      NOW,
      vi.fn(async () => priced)
    );
    expect(text).toMatch(/RUNNING NOW\n- #6 .*\(paused, Report pricing, 2026-09-22 onwards\)/);
    expect(text).toMatch(/ {2}So far: .*Pricing 3\.0 lower 1 of 3 bought \(33\.3%\)/);
  });

  /** Readers dealt `arm`, `bought` of them buying: what `load` returns for one stretch. */
  const dealtOutcomes = (groups: Array<[string | null, number, number]>): ArmOutcomes => {
    const dealt = groups.flatMap(([arm, n, bought]) =>
      Array.from({ length: n }, (_, i): [string | null, boolean] => [arm, i < bought])
    );
    return {
      submissions: dealt.map((_, i) => ({
        id: i + 1,
        created_date_time: "2026-08-10T10:00:00Z",
        utm_tracker: null,
      })),
      bySubmission: new Map(
        dealt.map(([pricing, bought], i) => [
          i + 1,
          { pricing, purchased: bought, startedCheckout: bought, revenue: bought ? 29 : 0 },
        ])
      ),
      truncated: false,
    };
  };

  it("splits a finished pricing test where a list changed, naming each letter's prices then", async () => {
    rows = [
      row({
        id: 11,
        status: "completed",
        axis: "pricing",
        start_date: "2026-08-03",
        decision_date: "2026-08-31",
        outcome: "Dropped the dearer list.",
      }),
    ];
    // Before list A rose, after it: the readers each stretch dealt, one with no quote.
    const load = vi.fn(async (since: string) =>
      since.startsWith("2026-08-24")
        ? dealtOutcomes([
            ["A", 60, 0],
            ["B", 64, 1],
          ])
        : dealtOutcomes([
            ["A", 98, 2],
            ["B", 101, 3],
            [null, 1, 0],
          ])
    );
    const text = await listExperiments(NOW, load);
    // From the 2.0 deploy (a change on its first day starts it) to the retirement deploy (one
    // on its last day ends it), split where list A rose; not 3 Aug to 1 Sep, Berlin midnights.
    expect(load).toHaveBeenCalledWith("2026-08-03T20:09:45.000Z", "2026-08-24T02:43:12.000Z");
    expect(load).toHaveBeenCalledWith("2026-08-24T02:43:12.000Z", "2026-08-31T10:09:20.000Z");
    expect(load).not.toHaveBeenCalledWith("2026-08-02T22:00:00.000Z", expect.anything());
    const finished = text.slice(text.indexOf("- #11 "));
    expect(finished).toContain(
      "  Outcome: Dropped the dearer list.\n" +
        "  Final numbers, each reader on the price list they were dealt (Berlin time):\n" +
        "  - 2026-08-03 22:09 to 2026-08-24 04:43, when Pricing A was full_report €9.99, core " +
        "€19.99, all_reports €29.99; Pricing B was full_report €29, core €39, all_reports €49: " +
        "Pricing A 2 of 98 bought (2%); Pricing B 3 of 101 bought (3%)."
    );
    expect(finished).toContain(
      "  - 2026-08-24 04:43 to 2026-08-31 12:09, when Pricing A was full_report €39.99, core " +
        "€49.99, all_reports €59; Pricing B was full_report €29, core €39, all_reports €49: " +
        "Pricing A 0 of 60 bought (0%); Pricing B 1 of 64 bought (1.6%)."
    );
    expect(finished).toContain("1 person is not attributable to an arm.");
    // The 2.x test from before the registry is read the same way, over its recorded dates.
    expect(text).toMatch(
      /- Report pricing \(A vs B\) \(before the registry\): [^\n]*\n {2}Final numbers, each reader on the price list they were dealt \(Berlin time\):\n {2}- 2026-08-03 22:09 to 2026-08-24 04:43, when Pricing A was full_report €9\.99/
    );
  });

  it("starts a finished pricing test where its list began, not before (registry #5)", async () => {
    // #5 starts on 8 Oct, but list B3 took its new prices at 15:23 UTC that day: the 13
    // readers who finished that morning saw the old ones, so they are not in its numbers.
    rows = [
      row({
        id: 5,
        status: "completed",
        axis: "pricing",
        start_date: "2026-10-08",
        decision_date: "2026-10-20",
      }),
    ];
    const load = vi.fn(async () =>
      dealtOutcomes([
        ["A3", 40, 1],
        ["B3", 41, 2],
      ])
    );
    const text = await listExperiments(NOW, load);
    expect(load).toHaveBeenCalledWith("2026-10-08T15:23:00.289Z", "2026-10-20T22:00:00.000Z");
    expect(load).not.toHaveBeenCalledWith("2026-10-07T22:00:00.000Z", expect.anything());
    expect(text).toContain(
      "  - 2026-10-08 17:23 to 2026-10-21 00:00, when Pricing 3.0 higher was full_report " +
        "€29.99, all_reports €39.99; Pricing 3.0 lower was full_report €4.99, all_reports €6.99: "
    );
  });

  it("gives no final numbers to a finished test on another axis or without its dates", async () => {
    rows = [
      row({ id: 12, status: "completed", axis: "landing", decision_date: "2026-09-25" }),
      row({ id: 13, status: "completed", axis: "pricing", decision_date: null }),
    ];
    const load = vi.fn(async () => nobody());
    const text = await listExperiments(NOW, load);
    expect(text).not.toMatch(/- #1[23] [^\n]*\n {2}Outcome: [^\n]*\n {2}Final numbers/);
    // Only the 2.x test's own two stretches were read, beside the live split's last 30 days.
    expect(load.mock.calls.filter((c) => (c as unknown[]).length === 2)).toEqual([
      ["2026-08-03T20:09:45.000Z", "2026-08-24T02:43:12.000Z"],
      ["2026-08-24T02:43:12.000Z", "2026-08-31T10:09:20.000Z"],
    ]);
  });

  describe("priceStretches: a finished test's stretches of unchanged prices", () => {
    const at = (iso: string) => Date.parse(iso);
    it("keeps the whole window when no list changed in it", () => {
      expect(priceStretches("2026-10-10", "2026-10-20", PRICE_LISTS)).toEqual([
        [at("2026-10-09T22:00:00Z"), at("2026-10-20T22:00:00Z")],
      ]);
    });
    it("splits at a change in the middle, and only there", () => {
      expect(priceStretches("2026-08-10", "2026-08-28", PRICE_LISTS)).toEqual([
        [at("2026-08-09T22:00:00Z"), at("2026-08-24T02:43:12Z")],
        [at("2026-08-24T02:43:12Z"), at("2026-08-28T22:00:00Z")],
      ]);
    });
    it("starts at a change on the first day and ends at one on the last day", () => {
      expect(priceStretches("2026-10-06", "2026-10-08", PRICE_LISTS)).toEqual([
        [at("2026-10-06T18:18:28.684Z"), at("2026-10-08T15:23:00.289Z")],
      ]);
    });
  });

  it("says why a running test has no live numbers when it has no axis, or one nothing stamps", async () => {
    rows = [row({ id: 4, axis: null }), row({ id: 5, axis: "paywall" })];
    const text = await listExperiments(
      NOW,
      vi.fn(async () => outcomes([]))
    );
    expect(text).toContain("  No axis is recorded for it, so there are no stamped arms to read");
    expect(text).toContain("  Nothing stamps an arm for Paywall style any more");
  });

  it("files a draft under planned and a finished test under finished, with its outcome", async () => {
    rows = [
      row({ id: 8, status: "draft", start_date: "2026-10-05" }),
      row({
        id: 9,
        status: "completed",
        decision_date: "2026-09-25",
        outcome: "Badge won by 2 points.",
      }),
      row({ id: 10, status: "completed", outcome: null, result_summary: null }),
    ];
    const text = await listExperiments(
      NOW,
      vi.fn(async () => nobody())
    );
    expect(text).toMatch(/PLANNED\n- #8 .*\(draft, Landing page design, 2026-10-05 onwards\)/);
    expect(text).toMatch(
      /- #9 .*2026-09-20 to 2026-09-25\)[^\n]*\n {2}Outcome: Badge won by 2 points\./
    );
    expect(text).toContain("  Outcome: not recorded");
  });

  describe("how many people a running test needs, and when it gets them", () => {
    /** `n` people in each landing arm of round 3, `card` and `video` of them bought. */
    const split = (n: number, card: number, video: number) =>
      outcomes([
        ...Array.from({ length: n }, (_, i): [string, boolean] => ["white_card", i < card]),
        ...Array.from({ length: n }, (_, i): [string, boolean] => ["white_video", i < video]),
      ]);
    const needed = async (o: ArmOutcomes) => {
      rows = [row()];
      const text = await listExperiments(
        NOW,
        vi.fn(async () => o)
      );
      return text.split("\n").find((l) => l.startsWith("  Needed"));
    };

    it("sizes a test the textbook way: 435 a side to tell 10% from 5%", () => {
      expect(perArmSample(0.1, 0.05)).toBe(435);
    });

    it("gives the people per arm for the gap so far, and the day at the pace so far", async () => {
      // 100 a side arrived from 21 Sep 10:00 to 26 Sep 09:00: 20.2 a day per arm.
      expect(await needed(split(100, 10, 5))).toBe(
        "  Needed, for a difference in purchases (what the readout above counts): about 435 " +
          "people per arm to tell 10.0% from 5.0% apart, at 95% confidence and 80% power; the " +
          "smaller arm has 100. At 20.2 a day per arm, that is around 2026-10-13, if the gap holds."
      );
    });

    it("sizes level arms for a 50% lift, since no number of people shows a gap of zero", async () => {
      expect(await needed(split(100, 10, 10))).toContain(
        "about 686 people per arm to see a 50% lift on 10.0%, since the arms are level so far"
      );
    });

    it("never says enough while an arm is short of the buyers the readout needs", async () => {
      // 10 of 100 against 0 of 100: the formula is content with 74 a side, the readout is not.
      const line = await needed(split(100, 10, 0));
      expect(line).not.toContain("Both have enough");
      expect(line).toContain(
        "The people are there, but the readout needs 5 buyers in every arm before it judges, " +
          "and Landing Page V3 (Video in Hero) has 0."
      );
      // Short of people too: the date, then the buyers.
      expect(await needed(split(60, 6, 0))).toMatch(
        /that is around \d{4}-\d{2}-\d{2}, if the gap holds\. Also, the readout needs 5 buyers in every arm/
      );
    });

    it("says when the arms already have enough, or when it is out of reach", async () => {
      expect(await needed(split(500, 50, 25))).toContain(
        "the smaller arm has 500. Both have enough, so the verdict above is the answer."
      );
      expect(await needed(split(100, 11, 10))).toContain(
        "that is more than a year away, so purchases alone will not settle it"
      );
    });

    it("never asks for fewer people than five buyers an arm need, as the readout requires", async () => {
      // 50% against 1.25%: the formula alone says 13 a side, but at 1.25% five buyers take 400.
      expect(await needed(split(80, 40, 1))).toContain("about 400 people per arm");
    });

    it("does not project a pace from less than a day of traffic", async () => {
      const o = split(100, 10, 5);
      for (const sub of o.submissions) sub.created_date_time = "2026-09-26T08:00:00Z";
      // An hour old: counted as a day, so 100 a day per arm, not 2,400.
      expect(await needed(o)).toContain("At 100.0 a day per arm, that is around 2026-09-30");
    });

    it("sizes level arms above two thirds for halfway to 100%, never NaN", async () => {
      // 80% a side: a 50% lift would be 120%, which no rate can be.
      const line = await needed(split(100, 80, 80));
      expect(line).toContain("to see 80.0% rise halfway to 100%, since the arms are level so far");
      expect(line).not.toContain("NaN");
      expect(line).toMatch(/about \d+ people per arm/);
    });

    it("gives the day as Berlin reads it", async () => {
      const o = split(100, 10, 5);
      for (const sub of o.submissions) sub.created_date_time = "2026-09-26T08:00:00Z";
      rows = [row()];
      // 23:30 UTC on the 26th is the 27th in Berlin; four days on is the 1st there, the 30th in UTC.
      const text = await listExperiments(
        Date.parse("2026-09-26T23:30:00Z"),
        vi.fn(async () => o)
      );
      expect(text).toContain("that is around 2026-10-01, if the gap holds");
    });

    it("before anyone buys, gives a yardstick and how long it takes at today's pace", async () => {
      // Every running test had 0 buyers on 2026-10-11; "cannot be worked out" told Marcus nothing.
      expect(await needed(split(100, 0, 0))).toBe(
        "  Needed, for a difference in purchases (what the readout above counts): nobody has " +
          "bought yet, so there is no rate to size against. As a yardstick, telling 1.0% from " +
          "1.5% takes about 7750 people per arm, at 95% confidence and 80% power; the smaller " +
          "arm has 100. At 20.2 a day per arm that is more than a year away, so purchases alone " +
          "will not settle it: test a bigger change, or decide on an earlier step such as checkout starts."
      );
      // At a pace that gets there, the day it does, with no gap to hold.
      expect(await needed(split(2000, 0, 0))).toMatch(/that is around 2026-10-11\.$/);
    });

    it("counts only the arms being compared, so an older arm does not slow the pace", async () => {
      const o = split(100, 10, 5);
      // A round-2 visitor from long before: a retired arm, not counted, so not the start.
      o.submissions.push({
        id: 999,
        created_date_time: "2026-08-01T00:00:00Z",
        utm_tracker: JSON.stringify({ landing_variant: "white" }),
      });
      expect(await needed(o)).toContain("At 20.2 a day per arm");
    });
  });

  it("throws when the registry cannot be read, so the tool can call it an outage", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({ ok: false, status: 500 } as never);
    await expect(listExperiments(NOW, vi.fn())).rejects.toThrow(/admin_experiment: 500/);
  });
});

describe("record_experiment: the registry, written", () => {
  const good = {
    name: "Guarantee badge on the paywall",
    hypothesis: "A money-back badge makes more report openers pay.",
    metric: "share of report openers who pay",
    axis: "landing",
    start_date: "2026-09-26",
    recorded_by: "Eman Cickusic",
  };

  it("registers a test through the panel's own upsert, as the person, and sets its axis", async () => {
    const r = await recordExperiment(good, NOW);
    expect(r).toMatchObject({ ok: true, id: 7 });
    const upsert = calls.find((c) => c.path.includes("rpc/admin_upsert_experiment"))!;
    expect(body(upsert)).toMatchObject({
      p_admin_email: "eman@loveiq.org",
      p_owner_email: "eman@loveiq.org",
      p_experiment_id: null,
      p_name: good.name,
      p_hypothesis: good.hypothesis,
      p_primary_metric_key: good.metric,
      // Starts today, so it is running.
      p_status: "active",
      p_start_date: "2026-09-26",
    });
    const patch = calls.find((c) => c.init?.method === "PATCH")!;
    expect(patch.path).toBe("/rest/v1/admin_experiment?id=eq.7");
    expect(body(patch)).toEqual({ axis: "landing" });
    expect(r.ok && r.text).toContain(
      "Registered experiment #7: Guarantee badge on the paywall (active, Landing page design)."
    );
  });

  it("files a test that has not started yet as a draft", async () => {
    await recordExperiment({ ...good, start_date: "2026-10-05", axis: undefined }, NOW);
    const upsert = calls.find((c) => c.path.includes("rpc/admin_upsert_experiment"))!;
    expect(body(upsert).p_status).toBe("draft");
    expect(calls.some((c) => c.init?.method === "PATCH")).toBe(false);
  });

  it("hands every field it does not change back as it was, the figures typed into /admin included", async () => {
    rows = [row()];
    const r = await recordExperiment(
      {
        experiment_id: 3,
        status: "completed",
        outcome: "Badge won by 2 points.",
        recorded_by: "Eman Cickusic",
      },
      NOW
    );
    expect(r).toMatchObject({ ok: true });
    const upsert = calls.find((c) => c.path.includes("rpc/admin_upsert_experiment"))!;
    expect(body(upsert)).toMatchObject({
      p_experiment_id: 3,
      p_status: "completed",
      p_outcome: "Badge won by 2 points.",
      // Untouched, exactly as stored:
      p_name: "Guarantee badge on the paywall",
      p_hypothesis: "A money-back badge makes more report openers pay.",
      p_primary_metric_key: "share of report openers who pay",
      p_owner_email: "mb@loveiq.org",
      p_guardrail_metric_keys: ["refund rate"],
      p_start_date: "2026-09-20",
      p_expected_impact: "+1 point",
      p_result_summary: "entered in /admin",
      p_readout_method: "conversion-rate",
      p_control_sample_size: 120,
      p_control_success_count: 3,
      p_variant_sample_size: 118,
      p_variant_success_count: 5,
      p_readout_notes: "typed by hand",
    });
    // The axis did not change, so it is not rewritten.
    expect(calls.some((c) => c.init?.method === "PATCH")).toBe(false);
    expect(r.ok && r.text).toContain("Updated experiment #3");
    expect(r.ok && r.text).toContain("Record the decision it led to with record_decision");
  });

  it("records someone the registry has no address for under the shared mailbox", async () => {
    await recordExperiment({ ...good, recorded_by: "A Visitor" }, NOW);
    const upsert = calls.find((c) => c.path.includes("rpc/admin_upsert_experiment"))!;
    expect(body(upsert).p_admin_email).toBe("teamwork@loveiq.org");
  });

  it("refuses a test with no hypothesis or metric, naming what is missing, before writing anything", async () => {
    const r = await recordExperiment({ name: "x", recorded_by: "Eman Cickusic" }, NOW);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/`hypothesis`.*`metric`/);
    expect(calls).toHaveLength(0);
  });

  it("refuses a missing recorder, an unknown axis or status, a bad day, and a test that is not there", async () => {
    const msg = async (input: Record<string, unknown>) => {
      const r = await recordExperiment(input, NOW);
      return r.ok ? "OK" : r.message;
    };
    expect(await msg({ ...good, recorded_by: undefined })).toMatch(/`recorded_by` is required/);
    expect(await msg({ ...good, axis: "homepage" })).toMatch(
      /`axis` is one of landing, survey, pricing, paywall/
    );
    expect(await msg({ ...good, status: "live" })).toMatch(/`status` is one of draft, active/);
    expect(await msg({ ...good, start_date: "2026-02-30" })).toMatch(
      /`start_date` must be a real day/
    );
    expect(await msg({ ...good, experiment_id: "abc" })).toMatch(/`experiment_id` is the number/);
    expect(await msg({ ...good, experiment_id: 99 })).toMatch(/No experiment #99 is registered/);
    expect(calls.some((c) => c.path.includes("rpc/"))).toBe(false);
  });

  it("throws when the upsert refuses, so nothing reads as saved", async () => {
    upsertStatus = 400;
    await expect(recordExperiment(good, NOW)).rejects.toThrow(
      /admin_upsert_experiment: 400 name is required/
    );
    expect(calls.some((c) => c.init?.method === "PATCH")).toBe(false);
  });
});
