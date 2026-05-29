/**
 * Unit tests for `fetchExtendedSparklines` — parses the get_funnel_sparklines_v2
 * RPC response into typed snapshots. The fetcher is responsible for:
 *   - returning null when the RPC fails or returns a malformed envelope
 *   - coercing every per-bucket numeric to a finite non-negative int
 *   - dropping malformed chapter keys (only zero-padded 2-digit strings kept)
 *   - preserving zero-filled days so downstream renderers see a fixed-width N
 *
 * Mocks `supabaseFetch` directly so we don't reach the real Supabase URL in CI.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { fetchExtendedSparklines } from "@features/admin/server/digest-metrics";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchExtendedSparklines", () => {
  it("returns null when the RPC responds non-2xx", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const snap = await fetchExtendedSparklines(
      "2026-05-01T00:00:00.000Z",
      "2026-05-02T00:00:00.000Z"
    );
    expect(snap).toBeNull();
  });

  it("returns null when the RPC throws", async () => {
    mockSupabaseFetch.mockRejectedValueOnce(new Error("network"));
    const snap = await fetchExtendedSparklines(
      "2026-05-01T00:00:00.000Z",
      "2026-05-02T00:00:00.000Z"
    );
    expect(snap).toBeNull();
  });

  it("returns null when `days` is missing or not an array", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ days: null }),
    });
    expect(
      await fetchExtendedSparklines("2026-05-01T00:00:00.000Z", "2026-05-02T00:00:00.000Z")
    ).toBeNull();

    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    expect(
      await fetchExtendedSparklines("2026-05-01T00:00:00.000Z", "2026-05-02T00:00:00.000Z")
    ).toBeNull();
  });

  it("parses a well-formed day into the typed shape", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        days: [
          {
            day: "2026-05-28",
            intro: { s1: 12, s2: 9, s3: 8, s4: 7 },
            survey: { "00": 7, "01": 5, "15": 1 },
            wizard: {
              s1: 4,
              s2: 3,
              s3: 3,
              s4: 2,
              s5: 2,
              s6: 1,
              report_viewed: 1,
            },
            monetize: {
              report_viewed: 1,
              engagement_5min: 1,
              paywall_init: 1,
              begin_checkout: 0,
              purchased: 0,
            },
          },
        ],
      }),
    });

    const snap = await fetchExtendedSparklines(
      "2026-05-28T00:00:00.000Z",
      "2026-05-29T00:00:00.000Z"
    );
    expect(snap).not.toBeNull();
    expect(snap!.days).toHaveLength(1);
    const d = snap!.days[0]!;
    expect(d.day).toBe("2026-05-28");
    expect(d.intro).toEqual({ s1: 12, s2: 9, s3: 8, s4: 7 });
    expect(d.survey).toEqual({ "00": 7, "01": 5, "15": 1 });
    expect(d.wizard.s6).toBe(1);
    expect(d.wizard.report_viewed).toBe(1);
    expect(d.monetize.purchased).toBe(0);
  });

  it("coerces non-numeric counts to 0", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        days: [
          {
            day: "2026-05-28",
            intro: { s1: "12", s2: null, s3: NaN, s4: -3 },
            survey: { "01": "abc" },
            wizard: {},
            monetize: {},
          },
        ],
      }),
    });
    const snap = await fetchExtendedSparklines(
      "2026-05-28T00:00:00.000Z",
      "2026-05-29T00:00:00.000Z"
    );
    const d = snap!.days[0]!;
    // String numeric coerces, null/NaN/negative all become 0.
    expect(d.intro).toEqual({ s1: 12, s2: 0, s3: 0, s4: 0 });
    expect(d.survey).toEqual({ "01": 0 });
    expect(d.wizard.s1).toBe(0);
    expect(d.monetize.report_viewed).toBe(0);
  });

  it("drops malformed chapter keys", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        days: [
          {
            day: "2026-05-28",
            intro: { s1: 0, s2: 0, s3: 0, s4: 0 },
            survey: {
              "00": 1, // ok
              "1": 1, // not 2-digit → dropped
              "001": 1, // 3-digit → dropped
              ZZ: 1, // non-numeric → dropped
              "15": 2, // ok
            },
            wizard: {},
            monetize: {},
          },
        ],
      }),
    });
    const snap = await fetchExtendedSparklines(
      "2026-05-28T00:00:00.000Z",
      "2026-05-29T00:00:00.000Z"
    );
    expect(snap!.days[0]!.survey).toEqual({ "00": 1, "15": 2 });
  });

  it("skips rows missing a `day` field", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        days: [
          { intro: {}, survey: {}, wizard: {}, monetize: {} }, // missing day
          {
            day: "2026-05-28",
            intro: { s1: 1, s2: 1, s3: 1, s4: 1 },
            survey: {},
            wizard: {},
            monetize: {},
          },
          null, // not an object
        ],
      }),
    });
    const snap = await fetchExtendedSparklines(
      "2026-05-28T00:00:00.000Z",
      "2026-05-29T00:00:00.000Z"
    );
    expect(snap!.days).toHaveLength(1);
    expect(snap!.days[0]!.day).toBe("2026-05-28");
  });

  it("preserves zero-traffic days (renderer needs fixed-width N)", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        days: [
          {
            day: "2026-05-27",
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
          },
          {
            day: "2026-05-28",
            intro: { s1: 5, s2: 5, s3: 5, s4: 5 },
            survey: { "00": 5 },
            wizard: {
              s1: 5,
              s2: 5,
              s3: 5,
              s4: 5,
              s5: 5,
              s6: 5,
              report_viewed: 5,
            },
            monetize: {
              report_viewed: 5,
              engagement_5min: 5,
              paywall_init: 5,
              begin_checkout: 5,
              purchased: 5,
            },
          },
        ],
      }),
    });
    const snap = await fetchExtendedSparklines(
      "2026-05-27T00:00:00.000Z",
      "2026-05-29T00:00:00.000Z"
    );
    expect(snap!.days).toHaveLength(2);
    expect(snap!.days[0]!.day).toBe("2026-05-27");
    expect(snap!.days[1]!.day).toBe("2026-05-28");
  });
});
