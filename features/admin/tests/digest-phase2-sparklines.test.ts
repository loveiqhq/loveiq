/**
 * Unit tests for Phase 2 funnel-digest fetchers:
 *   - fetchExtendedSparklinesV3     (v3 superset RPC)
 *   - fetchChannelSparklines        (per-source per-day funnel)
 *   - fetchArchetypeSparklines      (per-archetype per-day funnel)
 *   - fetchVelocityPercentiles      (p50/p75/p90 trend)
 *   - fetchQuestionAbandonmentTopN  (weekly only)
 *
 * Each fetcher must:
 *   - return null on RPC failure / malformed envelope
 *   - coerce non-numerics to 0 (or 0.0 for percentiles)
 *   - drop malformed dynamic keys (e.g. survey chapters that aren't 2-digit)
 *   - preserve zero-traffic days so renderer sees fixed-width N
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  fetchExtendedSparklinesV3,
  fetchChannelSparklines,
  fetchArchetypeSparklines,
  fetchVelocityPercentiles,
  fetchQuestionAbandonmentTopN,
} from "@features/admin/server/digest-metrics";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchExtendedSparklinesV3", () => {
  it("returns null on RPC non-2xx", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    expect(
      await fetchExtendedSparklinesV3("2026-05-01T00:00:00.000Z", "2026-05-02T00:00:00.000Z")
    ).toBeNull();
  });

  it("returns null on malformed envelope (missing days)", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    expect(
      await fetchExtendedSparklinesV3("2026-05-01T00:00:00.000Z", "2026-05-02T00:00:00.000Z")
    ).toBeNull();
  });

  it("parses a well-formed day across every v3 bucket", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        days: [
          {
            day: "2026-05-28",
            intro: { s1: 10, s2: 8, s3: 7, s4: 5 },
            survey: { "00": 4, "01": 3 },
            wizard: {
              s1: 5,
              s2: 5,
              s3: 4,
              s4: 3,
              s5: 2,
              s6: 1,
              report_viewed: 1,
            },
            monetize: {
              report_viewed: 1,
              engagement_5min: 1,
              paywall_init: 1,
              begin_checkout: 1,
              purchased: 1,
            },
            pricing: {
              paywall_initiated: 1,
              price_shown: 1,
              begin_checkout: 1,
              purchased: 1,
            },
            ux: { rage_click: 2, scroll_depth_50: 30, scroll_depth_100: 12 },
            payment_health: {
              refunds: 0,
              disputes: 0,
              failed: 1,
              promo_redemptions: 1,
            },
            invite: { sent: 3, partner_completed: 1, partner_purchased: 0 },
          },
        ],
      }),
    });
    const snap = await fetchExtendedSparklinesV3(
      "2026-05-28T00:00:00.000Z",
      "2026-05-29T00:00:00.000Z"
    );
    expect(snap!.days).toHaveLength(1);
    const d = snap!.days[0]!;
    expect(d.pricing.price_shown).toBe(1);
    expect(d.ux.rage_click).toBe(2);
    expect(d.payment_health.promo_redemptions).toBe(1);
    expect(d.invite.partner_completed).toBe(1);
  });

  it("coerces non-numeric and negative values to 0 across all v3 buckets", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        days: [
          {
            day: "2026-05-28",
            intro: { s1: 0, s2: 0, s3: 0, s4: 0 },
            survey: {},
            wizard: {
              s1: 0,
              s2: 0,
              s3: 0,
              s4: 0,
              s5: 0,
              s6: 0,
              report_viewed: 0,
            },
            monetize: {
              report_viewed: 0,
              engagement_5min: 0,
              paywall_init: 0,
              begin_checkout: 0,
              purchased: 0,
            },
            pricing: { paywall_initiated: "abc", price_shown: -5, begin_checkout: null },
            ux: { rage_click: NaN, scroll_depth_50: "12" },
            payment_health: {},
            invite: { sent: "3" },
          },
        ],
      }),
    });
    const snap = await fetchExtendedSparklinesV3(
      "2026-05-28T00:00:00.000Z",
      "2026-05-29T00:00:00.000Z"
    );
    const d = snap!.days[0]!;
    expect(d.pricing.paywall_initiated).toBe(0);
    expect(d.pricing.price_shown).toBe(0);
    expect(d.pricing.begin_checkout).toBe(0);
    expect(d.ux.rage_click).toBe(0);
    expect(d.ux.scroll_depth_50).toBe(12);
    expect(d.payment_health.refunds).toBe(0);
    expect(d.invite.sent).toBe(3);
  });
});

describe("fetchChannelSparklines", () => {
  it("returns null on RPC failure", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    expect(
      await fetchChannelSparklines("2026-05-01T00:00:00.000Z", "2026-05-02T00:00:00.000Z")
    ).toBeNull();
  });

  it("parses dynamic source keys into typed shape", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        days: [
          {
            day: "2026-05-28",
            sources: {
              google: { starts: 20, completions: 10, purchases: 2 },
              direct: { starts: 5, completions: 3, purchases: 1 },
            },
          },
        ],
      }),
    });
    const snap = await fetchChannelSparklines(
      "2026-05-28T00:00:00.000Z",
      "2026-05-29T00:00:00.000Z"
    );
    expect(snap!.days[0]!.sources.google).toEqual({
      starts: 20,
      completions: 10,
      purchases: 2,
    });
    expect(snap!.days[0]!.sources.direct).toEqual({
      starts: 5,
      completions: 3,
      purchases: 1,
    });
  });

  it("coerces non-numeric source counts to 0", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        days: [
          {
            day: "2026-05-28",
            sources: {
              fb: { starts: "abc", completions: -2, purchases: null },
            },
          },
        ],
      }),
    });
    const snap = await fetchChannelSparklines(
      "2026-05-28T00:00:00.000Z",
      "2026-05-29T00:00:00.000Z"
    );
    expect(snap!.days[0]!.sources.fb).toEqual({
      starts: 0,
      completions: 0,
      purchases: 0,
    });
  });
});

describe("fetchArchetypeSparklines", () => {
  it("returns null on RPC failure", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    expect(
      await fetchArchetypeSparklines("2026-05-01T00:00:00.000Z", "2026-05-02T00:00:00.000Z")
    ).toBeNull();
  });

  it("parses dynamic archetype names", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        days: [
          {
            day: "2026-05-28",
            archetypes: {
              "Tender Devotee": { completions: 10, purchases: 2 },
              "Radiant Performer": { completions: 5, purchases: 1 },
            },
          },
        ],
      }),
    });
    const snap = await fetchArchetypeSparklines(
      "2026-05-28T00:00:00.000Z",
      "2026-05-29T00:00:00.000Z"
    );
    expect(snap!.days[0]!.archetypes["Tender Devotee"]).toEqual({
      completions: 10,
      purchases: 2,
    });
  });
});

describe("fetchVelocityPercentiles", () => {
  it("returns null on RPC failure", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    expect(
      await fetchVelocityPercentiles("2026-05-01T00:00:00.000Z", "2026-05-02T00:00:00.000Z")
    ).toBeNull();
  });

  it("parses percentile floats (not integer-coerced)", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        days: [{ day: "2026-05-28", n: 4, p50: "2.5", p75: "4.1", p90: "8.7" }],
      }),
    });
    const snap = await fetchVelocityPercentiles(
      "2026-05-28T00:00:00.000Z",
      "2026-05-29T00:00:00.000Z"
    );
    expect(snap!.days[0]).toEqual({ day: "2026-05-28", n: 4, p50: 2.5, p75: 4.1, p90: 8.7 });
  });

  it("preserves zero-sample days (n=0, all percentiles 0)", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        days: [
          { day: "2026-05-27", n: 0, p50: 0, p75: 0, p90: 0 },
          { day: "2026-05-28", n: 3, p50: 1.5, p75: 3, p90: 5 },
        ],
      }),
    });
    const snap = await fetchVelocityPercentiles(
      "2026-05-27T00:00:00.000Z",
      "2026-05-29T00:00:00.000Z"
    );
    expect(snap!.days).toHaveLength(2);
    expect(snap!.days[0]!.n).toBe(0);
  });
});

describe("fetchQuestionAbandonmentTopN", () => {
  it("returns null on RPC failure", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    expect(
      await fetchQuestionAbandonmentTopN("2026-05-01T00:00:00.000Z", "2026-05-15T00:00:00.000Z")
    ).toBeNull();
  });

  it("parses top_questions array with per-day series", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        top_questions: [
          {
            q_id: "01002",
            total: 12,
            days: [
              { day: "2026-05-27", n: 5 },
              { day: "2026-05-28", n: 7 },
            ],
          },
          {
            q_id: "03005",
            total: 8,
            days: [
              { day: "2026-05-27", n: 3 },
              { day: "2026-05-28", n: 5 },
            ],
          },
        ],
      }),
    });
    const snap = await fetchQuestionAbandonmentTopN(
      "2026-05-27T00:00:00.000Z",
      "2026-05-29T00:00:00.000Z",
      10
    );
    expect(snap!.top_questions).toHaveLength(2);
    expect(snap!.top_questions[0]!.q_id).toBe("01002");
    expect(snap!.top_questions[0]!.total).toBe(12);
    expect(snap!.top_questions[0]!.days).toHaveLength(2);
  });

  it("drops malformed rows (missing q_id, non-array days)", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        top_questions: [
          { total: 5 }, // missing q_id → dropped
          { q_id: "00000", total: 5, days: "not-array" }, // bad days → empty
          { q_id: "01002", total: 3, days: [{ day: "2026-05-28", n: 3 }] },
        ],
      }),
    });
    const snap = await fetchQuestionAbandonmentTopN(
      "2026-05-27T00:00:00.000Z",
      "2026-05-29T00:00:00.000Z",
      10
    );
    expect(snap!.top_questions).toHaveLength(2);
    expect(snap!.top_questions[0]!.q_id).toBe("00000");
    expect(snap!.top_questions[0]!.days).toHaveLength(0);
    expect(snap!.top_questions[1]!.q_id).toBe("01002");
  });
});
