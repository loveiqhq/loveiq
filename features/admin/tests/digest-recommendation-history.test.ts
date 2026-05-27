import { describe, it, expect, beforeEach, vi } from "vitest";

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  persistRecommendations,
  fetchRecommendationHistory,
} from "@features/admin/server/digest-recommendation-history";
import type { Recommendation } from "@features/admin/server/digest-recommendations";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("persistRecommendations", () => {
  it("posts a payload with merge-duplicates Prefer header", async () => {
    mockSupabaseFetch.mockResolvedValue({ ok: true });
    const recs: Recommendation[] = [
      {
        severity: "high",
        rule: "wizard_slide_drop_4_5",
        message: "Test",
        evidence: "n=10",
        fingerprint: { kept_pct: 62 },
      },
    ];
    await persistRecommendations("2026-W22", recs);
    expect(mockSupabaseFetch).toHaveBeenCalledOnce();
    const [path, options] = mockSupabaseFetch.mock.calls[0] as [string, RequestInit];
    expect(path).toContain("/rest/v1/digest_recommendation_history");
    expect(options.method).toBe("POST");
    expect((options.headers as Record<string, string>)["Prefer"]).toContain(
      "resolution=merge-duplicates"
    );
    const body = JSON.parse(options.body as string);
    expect(body[0]).toMatchObject({
      week_key: "2026-W22",
      rule: "wizard_slide_drop_4_5",
      severity: "high",
      fingerprint: { kept_pct: 62 },
    });
  });

  it("is a no-op when recs is empty", async () => {
    await persistRecommendations("2026-W22", []);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("does NOT throw when Supabase returns non-2xx (warns instead)", async () => {
    mockSupabaseFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "internal_error",
    });
    await expect(
      persistRecommendations("2026-W22", [
        {
          severity: "high",
          rule: "x",
          message: "m",
          evidence: "e",
          fingerprint: {},
        },
      ])
    ).resolves.toBeUndefined();
  });

  it("does NOT throw when Supabase throws (warns instead)", async () => {
    mockSupabaseFetch.mockRejectedValue(new Error("network"));
    await expect(
      persistRecommendations("2026-W22", [
        {
          severity: "high",
          rule: "x",
          message: "m",
          evidence: "e",
          fingerprint: {},
        },
      ])
    ).resolves.toBeUndefined();
  });

  it("defaults fingerprint to empty object when undefined", async () => {
    mockSupabaseFetch.mockResolvedValue({ ok: true });
    const recs = [
      {
        severity: "high" as const,
        rule: "x",
        message: "m",
        evidence: "e",
      } as Recommendation,
    ];
    await persistRecommendations("2026-W22", recs);
    const [, options] = mockSupabaseFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body[0].fingerprint).toEqual({});
  });
});

describe("fetchRecommendationHistory", () => {
  it("returns parsed rows with valid severity", async () => {
    mockSupabaseFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          week_key: "2026-W22",
          rule: "wizard_slide_drop_4_5",
          severity: "high",
          message: "msg",
          evidence: "ev",
          fingerprint: { kept_pct: 65 },
          created_at: "2026-05-25T00:00:00Z",
        },
      ],
    });
    const out = await fetchRecommendationHistory(4);
    expect(out).toHaveLength(1);
    expect(out[0]!.rule).toBe("wizard_slide_drop_4_5");
    expect(out[0]!.fingerprint).toEqual({ kept_pct: 65 });
  });

  it("filters out rows with invalid severity (schema drift defense)", async () => {
    mockSupabaseFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          week_key: "W1",
          rule: "x",
          severity: "ULTRA",
          message: "m",
          evidence: "e",
          fingerprint: {},
          created_at: "2026-05-25T00:00:00Z",
        },
        {
          week_key: "W2",
          rule: "y",
          severity: "low",
          message: "m",
          evidence: "e",
          fingerprint: {},
          created_at: "2026-05-25T00:00:00Z",
        },
      ],
    });
    const out = await fetchRecommendationHistory(4);
    expect(out).toHaveLength(1);
    expect(out[0]!.rule).toBe("y");
  });

  it("returns [] on fetch failure", async () => {
    mockSupabaseFetch.mockResolvedValue({ ok: false, status: 500 });
    const out = await fetchRecommendationHistory(4);
    expect(out).toEqual([]);
  });

  it("returns [] when fetch throws", async () => {
    mockSupabaseFetch.mockRejectedValue(new Error("network"));
    const out = await fetchRecommendationHistory(4);
    expect(out).toEqual([]);
  });

  it("returns [] for non-positive weeks", async () => {
    expect(await fetchRecommendationHistory(0)).toEqual([]);
    expect(await fetchRecommendationHistory(-1)).toEqual([]);
    expect(await fetchRecommendationHistory(NaN)).toEqual([]);
  });

  it("coerces fingerprint to plain number|string values, drops nested objects", async () => {
    mockSupabaseFetch.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          week_key: "W1",
          rule: "x",
          severity: "high",
          message: "m",
          evidence: "e",
          fingerprint: { good_n: 5, bad_obj: { nested: true }, good_str: "label", bad_arr: [1, 2] },
          created_at: "2026-05-25T00:00:00Z",
        },
      ],
    });
    const out = await fetchRecommendationHistory(4);
    expect(out[0]!.fingerprint).toEqual({ good_n: 5, good_str: "label" });
  });
});
