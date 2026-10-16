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
    const table = /^\/rest\/v1\/(\w+)\?/.exec(path)?.[1] ?? "";
    const rows = tables[table];
    if (typeof rows === "number") return { ok: false, status: rows, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => rows ?? [] };
  },
}));

import { dealtArm, loadArmOutcomes } from "@features/admin/server/experiment-readouts";

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

    const [subs, quotes] = paths;
    expect(subs).toContain("created_date_time=gte.2026-08-02T22:00:00.000Z");
    expect(subs).toContain("created_date_time=lt.2026-08-31T22:00:00.000Z");
    // The history comes with each quote, oldest change first, for the window's ids only.
    expect(quotes).toContain("report_price_quote_arm_history(old_experiment_group)");
    expect(quotes).toContain("report_price_quote_arm_history.order=changed_at.asc,id.asc");
    expect(quotes).toContain("survey_submission_id=gte.1&survey_submission_id=lte.3");
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

  it("fails loudly when a read fails, rather than reading everyone as unattributed", async () => {
    tables = { survey_submission: [sub(1)], report_price_quote: 400 };
    await expect(loadArmOutcomes("2026-08-02T22:00:00.000Z")).rejects.toThrow(
      "report_price_quote: 400"
    );
  });
});
