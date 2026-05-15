import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

import { GET } from "@/app/api/admin/revenue/pricing-clusters/route";

function makeRequest(params?: Record<string, string>) {
  const url = new URL("http://localhost/api/admin/revenue/pricing-clusters");
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return new Request(url.toString());
}

function makeRpcResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GET /api/admin/revenue/pricing-clusters", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "viewer@test.com", role: "viewer" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
    mockSupabaseFetch.mockResolvedValue(
      makeRpcResponse([
        {
          plan: "full_report",
          experiment_group: "B",
          pricing_cluster_id: "B-full_report-full_center-tier_2-desktop-google-serious-engaged-d0",
          base_price_bucket: "full_center",
          country_tier: "tier_2",
          device_type: "Desktop",
          traffic_source: "google",
          behavioral_bucket: "serious",
          engagement_band: "engaged",
          discount_step: 0,
          quoted_count: 10,
          checkout_started_count: 4,
          purchased_count: 3,
          conversion_rate: 30,
          revenue_eur: 82.47,
          rpcs_eur: 8.247,
          avg_initial_price_eur: 29.99,
          avg_current_price_eur: 27.49,
          avg_discount_multiplier: 1,
          first_quote_at: "2026-04-01T10:00:00.000Z",
          last_quote_at: "2026-04-14T10:00:00.000Z",
        },
      ])
    );
  });

  it("returns 401 when not authenticated", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);

    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
  });

  it("returns 403 when role is insufficient", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "none@test.com", role: "none" });

    const response = await GET(makeRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden." });
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });

    const response = await GET(makeRequest());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: "Please try again later." });
  });

  it("returns pricing cluster metrics and aggregates", async () => {
    const response = await GET(makeRequest({ days: "30" }));

    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.meta.windowDays).toBe(30);
    expect(json.meta.totals).toMatchObject({
      checkoutStartedCount: 4,
      conversionRatePct: 30,
      purchasedCount: 3,
      quotedCount: 10,
      revenueEur: 82.47,
      rpcsEur: 8.25,
    });
    expect(json.clusters).toEqual([
      expect.objectContaining({
        avgCurrentPriceEur: 27.49,
        behavioralBucket: "serious",
        conversionRatePct: 30,
        experimentGroup: "B",
        plan: "full_report",
        pricingClusterId: "B-full_report-full_center-tier_2-desktop-google-serious-engaged-d0",
        quotedCount: 10,
        revenueEur: 82.47,
      }),
    ]);
    expect(json.experimentGroups).toContainEqual(
      expect.objectContaining({
        experimentGroup: "B",
        purchasedCount: 3,
        quotedCount: 10,
      })
    );
    expect(json.plans).toContainEqual(
      expect.objectContaining({
        plan: "full_report",
        purchasedCount: 3,
        quotedCount: 10,
      })
    );
  });

  it("passes plan and days filters to the RPC", async () => {
    await GET(makeRequest({ days: "14", plan: "full_report" }));

    expect(mockSupabaseFetch).toHaveBeenCalledWith(
      "/rest/v1/rpc/get_report_pricing_metrics",
      expect.objectContaining({
        body: expect.any(String),
        method: "POST",
      })
    );

    const body = JSON.parse(mockSupabaseFetch.mock.calls[0][1].body);
    expect(body.plan_filter).toBe("full_report");
    expect(body.since_ts).not.toBeNull();
  });

  it("returns 500 when the RPC fails", async () => {
    mockSupabaseFetch.mockResolvedValue(makeRpcResponse({ error: "boom" }, 500));

    const response = await GET(makeRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Unable to load pricing metrics.",
    });
  });
});
