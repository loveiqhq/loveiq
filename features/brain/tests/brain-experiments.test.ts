import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

type Call = { path: string; init?: { method?: string; body?: string } };
const calls: Call[] = [];
let rows: Array<Record<string, unknown>> = [];
let upsertStatus = 200;
const mockSupabaseFetch = vi.fn(async (path: string, init?: { method?: string; body?: string }) => {
  calls.push({ path, init });
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

import { listExperiments, recordExperiment } from "@features/brain/server/experiments";
import type { ArmOutcomes } from "@features/admin/server/experiment-readouts";

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

beforeEach(() => {
  calls.length = 0;
  rows = [];
  upsertStatus = 200;
});
afterEach(() => mockSupabaseFetch.mockClear());

describe("experiments: the registry, read", () => {
  it("says nothing is running, lists the tests that ended before the registry, and how to start one", async () => {
    const load = vi.fn();
    const text = await listExperiments(NOW, load);
    expect(text).toContain("RUNNING NOW\n- None. No test is being randomised right now.");
    expect(text).toContain(
      "- Landing page design (V1 vs V2) (before the registry): Finished on 19 September 2026"
    );
    expect(text).toContain("- Report pricing (A vs B) (before the registry):");
    expect(text).toContain("- Paywall style (before the registry):");
    expect(text).toContain("- Survey design (white vs dark) (before the registry):");
    expect(text).toContain("Before the next test starts, record it with record_experiment");
    // Archived tests are left out by the query itself; nothing live was loaded.
    expect(calls[0]!.path).toContain("status=neq.archived");
    expect(load).not.toHaveBeenCalled();
  });

  it("reads a running test live from its own start, in /admin's words", async () => {
    rows = [row()];
    const arms: Array<[string, boolean]> = [
      ...Array.from({ length: 40 }, (): [string, boolean] => ["white", false]),
      ...Array.from({ length: 5 }, (): [string, boolean] => ["white", true]),
    ];
    const load = vi.fn(async () => outcomes(arms));
    const text = await listExperiments(NOW, load);
    expect(load).toHaveBeenCalledWith("2026-09-20T00:00:00Z");
    expect(text).toContain(
      "- #3 Guarantee badge on the paywall (active, Landing page design, 2026-09-20 onwards). " +
        "Hypothesis: A money-back badge makes more report openers pay. Decided by: share of report openers who pay. Expected: +1 point"
    );
    expect(text).toMatch(/ {2}So far: .*5 of 45 bought \(11\.1%\)/);
    expect(text).not.toContain("- None. No test is being randomised");
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
    const text = await listExperiments(NOW, vi.fn());
    expect(text).toMatch(/PLANNED\n- #8 .*\(draft, Landing page design, 2026-10-05 onwards\)/);
    expect(text).toMatch(
      /- #9 .*2026-09-20 to 2026-09-25\)[^\n]*\n {2}Outcome: Badge won by 2 points\./
    );
    expect(text).toContain("  Outcome: not recorded");
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
