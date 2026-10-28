import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

type Page = Array<Record<string, unknown>>;
const paths: string[] = [];
let tables: Record<string, Page | number> = {};
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: async (path: string) => {
    paths.push(path);
    const table = /^\/rest\/v1\/(?:rpc\/)?(\w+)/.exec(path)?.[1] ?? "";
    const rows = tables[table];
    if (typeof rows === "number") return { ok: false, status: rows, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => rows ?? [] };
  },
}));

import {
  dealtArm,
  loadArmOutcomes,
  loadPriceListChanges,
} from "@features/admin/server/experiment-readouts";
import { clearTeamCache } from "@features/admin/server/ap/team";

const sub = (id: number) => ({
  id,
  created_date_time: "2026-08-10T10:00:00Z",
  utm_tracker: null,
  app_user: { email: `reader${id}@example.com` },
});
const quote = (
  sid: number,
  arm: string,
  createdAt: string,
  history: Array<{ old_experiment_group: string }> = []
) => ({
  survey_submission_id: sid,
  experiment_group: arm,
  base_price_bucket: arm,
  checkout_started_at: null,
  created_date_time: createdAt,
  report_price_quote_arm_history: history,
});

beforeEach(() => {
  paths.length = 0;
  tables = {};
  clearTeamCache();
});

describe("dealtArm: the price list a quote was dealt, not the one it carries now", () => {
  it("is the old arm of its first change, else the arm on the row", () => {
    // A 2.x quote the Pricing 3.0 re-sync moved from A to B3, then list B3's lowering.
    expect(
      dealtArm({
        experiment_group: "B3",
        base_price_bucket: "B3",
        report_price_quote_arm_history: [
          { old_experiment_group: "A" },
          { old_experiment_group: "B3" },
        ],
      })
    ).toBe("A");
    expect(
      dealtArm({
        experiment_group: "A3",
        base_price_bucket: "A3",
        report_price_quote_arm_history: [],
      })
    ).toBe("A3");
    expect(
      dealtArm({
        experiment_group: null,
        base_price_bucket: "B",
        report_price_quote_arm_history: null,
      })
    ).toBe("B");
  });
});

describe("loadArmOutcomes: a window's readers in the list they were dealt", () => {
  it("reads a re-synced quote in its old arm, and ignores a quote first made after the window", async () => {
    tables = {
      survey_submission: [sub(1), sub(2), sub(3)],
      report_price_quote: [
        // Dealt A in August, moved to B3 on 6 Oct.
        quote(1, "B3", "2026-08-10T10:05:00Z", [{ old_experiment_group: "A" }]),
        // Never moved: it is still on the list it was dealt.
        quote(2, "B", "2026-08-11T09:00:00Z"),
        // First opened after the test ended, so priced by what came next.
        quote(3, "B", "2026-09-02T09:00:00Z"),
      ],
      payment: [{ amount: "19.99", personal_report: { survey_submission_id: 1 } }],
    };
    const o = await loadArmOutcomes("2026-08-02T22:00:00.000Z", "2026-08-31T22:00:00.000Z");
    expect(o.bySubmission.get(1)).toMatchObject({ pricing: "A", purchased: true, revenue: 19.99 });
    expect(o.bySubmission.get(2)?.pricing).toBe("B");
    expect(o.bySubmission.get(3)?.pricing).toBeNull();

    const subs = paths.find((p) => p.startsWith("/rest/v1/survey_submission?"));
    const quotes = paths.find((p) => p.startsWith("/rest/v1/report_price_quote?"));
    expect(subs).toContain("created_date_time=gte.2026-08-02T22:00:00.000Z");
    expect(subs).toContain("created_date_time=lt.2026-08-31T22:00:00.000Z");
    // The history comes with each quote, oldest change first, for the window's ids only.
    expect(quotes).toContain("report_price_quote_arm_history(old_experiment_group)");
    expect(quotes).toContain("report_price_quote_arm_history.order=changed_at.asc,id.asc");
    expect(quotes).toContain("survey_submission_id=gte.1&survey_submission_id=lte.3");
  });

  it("leaves the team's test-coupon accounts out, as AP-Analytics does (ap_team_user)", async () => {
    tables = {
      survey_submission: [
        { ...sub(1), user_id: 11 },
        // Redeemed the team's test coupon from an outside address.
        { ...sub(2), user_id: 12 },
        { ...sub(3), user_id: null },
      ],
      ap_team_user: [{ id: 12 }],
      report_price_quote: [],
      payment: [],
    };
    const o = await loadArmOutcomes("2026-10-08T15:23:00Z");
    expect(o.submissions.map((s) => s.id)).toEqual([1, 3]);
    expect(paths.find((p) => p.startsWith("/rest/v1/survey_submission?"))).toContain(
      "select=id,user_id,"
    );
  });

  it("fails rather than count the team when the team can't be read", async () => {
    tables = { survey_submission: [{ ...sub(1), user_id: 11 }], ap_team_user: 500 };
    await expect(loadArmOutcomes("2026-10-08T15:23:00Z")).rejects.toThrow("ap_team_user");
  });

  it("takes a reader's first quote when two disagree, and a live window has no end", async () => {
    tables = {
      survey_submission: [sub(7)],
      report_price_quote: [
        quote(7, "A3", "2026-10-10T10:00:00Z"),
        quote(7, "B3", "2026-10-10T10:00:01Z"),
      ],
      payment: [],
    };
    const o = await loadArmOutcomes("2026-10-08T15:23:00Z");
    expect(o.bySubmission.get(7)?.pricing).toBe("A3");
    expect(paths[0]).not.toContain("created_date_time=lt.");
  });

  it("leaves surveys bought before they were taken out of every arm", async () => {
    // Pay to start: a buyer's EUR 29 would count as a purchase in whatever arm their
    // session fell into. Known by the entitlement they claimed (3), or by the server's
    // tracker label when no claim is readable (4).
    tables = {
      survey_submission: [
        sub(1),
        sub(3),
        {
          ...sub(4),
          utm_tracker: JSON.stringify({ utm_source: "google", journey: "pay_to_start" }),
        },
      ],
      prepaid_report_access: [{ consumed_submission_id: 3 }],
      report_price_quote: [quote(1, "A3", "2026-08-10T10:05:00Z")],
      payment: [
        { amount: "29", personal_report: { survey_submission_id: 3 } },
        { amount: "29", personal_report: { survey_submission_id: 4 } },
      ],
    };
    const o = await loadArmOutcomes("2026-08-02T22:00:00.000Z");
    expect(o.submissions.map((s) => s.id)).toEqual([1]);
    expect(o.bySubmission.has(3)).toBe(false);
    expect(o.bySubmission.has(4)).toBe(false);
    expect(paths.find((p) => p.startsWith("/rest/v1/prepaid_report_access?"))).toContain(
      "consumed_submission_id=gte.1&consumed_submission_id=lte.4"
    );
  });

  it("leaves the EUR 1.99 gate's readers out of the price lists, and in every other test", async () => {
    // Pricing pins them to A3: their list was not drawn. A landing arm meets the gate alike.
    tables = {
      survey_submission: [
        sub(1),
        { ...sub(3), utm_tracker: JSON.stringify({ arms: { landing: "v3" } }) },
      ],
      personal_report: [{ survey_submission_id: 3 }],
      report_price_quote: [
        quote(1, "A3", "2026-10-10T10:05:00Z"),
        quote(3, "A3", "2026-10-10T10:06:00Z"),
      ],
      payment: [],
    };
    const o = await loadArmOutcomes("2026-10-08T15:23:00Z");
    expect(o.submissions.map((s) => s.id)).toEqual([1, 3]);
    expect(o.bySubmission.get(1)?.pricing).toBe("A3");
    expect(o.bySubmission.get(3)?.pricing).toBeNull();
    const gated = paths.find((p) => p.startsWith("/rest/v1/personal_report?"));
    expect(gated).toContain("survey_submission_id=gte.1&survey_submission_id=lte.3");
    expect(gated).toContain("initial_gate_cohort_at=not.is.null");
  });

  it("never counts the EUR 1.99 Core Archetype as a report bought", async () => {
    tables = {
      survey_submission: [sub(1), sub(2)],
      report_price_quote: [
        quote(1, "A3", "2026-10-10T10:05:00Z"),
        quote(2, "A3", "2026-10-10T10:06:00Z"),
      ],
      payment: [
        { amount: "1.99", plan: "initial", personal_report: { survey_submission_id: 1 } },
        { amount: "19.99", plan: "full_report", personal_report: { survey_submission_id: 2 } },
      ],
    };
    const o = await loadArmOutcomes("2026-10-08T15:23:00Z");
    expect(o.bySubmission.get(1)?.purchased).toBe(false);
    expect(o.bySubmission.get(2)).toMatchObject({ purchased: true, revenue: 19.99 });
    expect(paths.find((p) => p.startsWith("/rest/v1/payment?"))).toContain("plan:metadata->>plan");
  });

  it("fails loudly when a read fails, rather than reading everyone as unattributed", async () => {
    tables = { survey_submission: [sub(1)], report_price_quote: 400 };
    await expect(loadArmOutcomes("2026-08-02T22:00:00.000Z")).rejects.toThrow(
      "report_price_quote: 400"
    );
  });
});

describe("loadPriceListChanges: when each price list changed", () => {
  it("reads get_price_list_changes, and fails loudly rather than reading no changes", async () => {
    tables = { get_price_list_changes: [] };
    await expect(loadPriceListChanges()).resolves.toEqual([]);
    expect(paths).toEqual(["/rest/v1/rpc/get_price_list_changes"]);
    tables = { get_price_list_changes: 500 };
    await expect(loadPriceListChanges()).rejects.toThrow("get_price_list_changes: 500");
  });
});

describe("20261016170000: the 2.x changes it pins, and its rollback", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  const sql = read("supabase/migrations/20261016170000_report_price_quote_arm_history.sql");

  it("pins each 2.x list at exactly the prices the re-sync of the time wrote", () => {
    // (moment, arm, plan, price) as pinned in get_price_list_changes.
    const pinned = [...sql.matchAll(/\(timestamptz '([^']+)', '(A|B)', '(\w+)', ([\d.]+)\)/g)].map(
      ([, at, arm, plan, price]) => `${at} ${arm} ${plan} ${Number(price)}`
    );
    // (plan, arm, msrp, starting) rows of a re-sync: its arm's selling prices.
    const resync = (file: string, arm: string) =>
      [
        ...read(`supabase/migrations/${file}`).matchAll(
          /\('(\w+)'(?:::text)?,\s*(?:'(A|B)'(?:::text)?,\s*)?[\d.]+(?:::numeric)?,\s*([\d.]+)/g
        ),
      ]
        .filter(([, plan, rowArm]) => plan !== "essentials" && (rowArm ?? arm) === arm)
        .map(([, plan, , starting]) => `${plan} ${Number(starting)}`)
        .sort();
    const at = (moment: string, arm: string) =>
      pinned
        .filter((p) => p.startsWith(`${moment} ${arm} `))
        .map((p) => p.split(" ").slice(-2).join(" "))
        .sort();
    expect(pinned).toHaveLength(12);
    // 2.0, both lists; 2.1, list A raised; the retirement, list A on list B's prices.
    expect(at("2026-08-03 20:09:45+00", "A")).toEqual(
      resync("20260727130000_pricing_2_resync_quotes.sql", "A")
    );
    expect(at("2026-08-03 20:09:45+00", "B")).toEqual(
      resync("20260727130000_pricing_2_resync_quotes.sql", "B")
    );
    expect(at("2026-08-24 02:43:12+00", "A")).toEqual(
      resync("20260824120000_pricing_2_1_resync_quotes.sql", "A")
    );
    expect(at("2026-08-31 10:09:20+00", "A")).toEqual(
      resync("20260831101238_retire_pricing_bucket_a.sql", "A")
    );
  });

  it("rolls back without queueing paygate writes behind its lock", () => {
    const down = read("supabase/rollbacks/20261016170000_report_price_quote_arm_history_down.sql");
    expect(down).toMatch(/^BEGIN;\nSET LOCAL lock_timeout = '3s';\n/m);
    expect(down).toContain("DROP FUNCTION IF EXISTS public.get_price_list_changes();");
  });
});
