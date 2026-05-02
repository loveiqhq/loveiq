import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/csrf", () => ({
  verifyCsrfToken: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../lib/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 59, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("../../lib/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("../../lib/pricing/reportPricing", () => ({
  getReportPriceQuoteForContext: vi.fn(),
  getReportPriceQuotesForContext: vi.fn(),
}));

import { GET } from "../../app/api/price/route";
import { verifyCsrfToken } from "../../lib/csrf";
import { checkRateLimit } from "../../lib/ratelimit";
import {
  getReportPriceQuoteForContext,
  getReportPriceQuotesForContext,
} from "../../lib/pricing/reportPricing";

describe("GET /api/price", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyCsrfToken).mockResolvedValue(true);
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 59,
      resetAt: new Date(),
    });
  });

  it("returns a single quote for a valid plan and report session", async () => {
    vi.mocked(getReportPriceQuoteForContext).mockResolvedValueOnce({
      id: 1,
      plan: "full_report",
      currency: "EUR",
      experimentGroup: "B",
      basePriceBucket: "full_center",
      basePriceCents: 2999,
      currentPriceCents: 2749,
      initialPriceCents: 2999,
      discountMultiplier: 1,
      discountStep: 0,
      pricingClusterId: "cluster",
      countryTier: "tier_2",
      countryMultiplier: 1,
      deviceType: "Desktop",
      deviceMultiplier: 1.05,
      trafficSource: "google",
      trafficMultiplier: 1.1,
      behavioralBucket: "serious",
      behavioralMultiplier: 1.2,
      engagementScore: 40,
      engagementMultiplier: 1.1,
      reportPreviewViews: 2,
      fantasySignalCount: 1,
      surveyDurationMs: 600000,
      initialPriceTimestamp: "2026-04-14T10:00:00.000Z",
      expiresAt: "2026-05-05T10:00:00.000Z",
      checkoutStartedAt: null,
      purchasedAt: null,
      viewCount: 1,
    });

    const res = await GET(
      new Request(
        "http://localhost/api/price?plan=full_report&reportSessionId=02d88f31-eceb-4402-940d-c8cd98d01848",
        {
          headers: {
            "x-csrf-token": "valid",
            "user-agent": "Mozilla/5.0",
          },
        }
      )
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      quote: expect.objectContaining({
        currentPriceCents: 2749,
        plan: "full_report",
      }),
    });
  });

  it("returns all plan quotes when plan is omitted", async () => {
    vi.mocked(getReportPriceQuotesForContext).mockResolvedValueOnce({
      essentials: {
        id: 1,
        plan: "essentials",
        currency: "EUR",
        experimentGroup: "A",
        basePriceBucket: "essentials_center",
        basePriceCents: 1499,
        currentPriceCents: 1499,
        initialPriceCents: 1499,
        discountMultiplier: 1,
        discountStep: 0,
        pricingClusterId: "a1",
        countryTier: "tier_2",
        countryMultiplier: 1,
        deviceType: "Desktop",
        deviceMultiplier: 1.05,
        trafficSource: "direct",
        trafficMultiplier: 1.1,
        behavioralBucket: "moderate",
        behavioralMultiplier: 1,
        engagementScore: 20,
        engagementMultiplier: 1,
        reportPreviewViews: 1,
        fantasySignalCount: 0,
        surveyDurationMs: 400000,
        initialPriceTimestamp: "2026-04-14T10:00:00.000Z",
        expiresAt: "2026-05-05T10:00:00.000Z",
        checkoutStartedAt: null,
        purchasedAt: null,
        viewCount: 1,
      },
      full_report: {
        id: 2,
        plan: "full_report",
        currency: "EUR",
        experimentGroup: "A",
        basePriceBucket: "full_center",
        basePriceCents: 2999,
        currentPriceCents: 2999,
        initialPriceCents: 2999,
        discountMultiplier: 1,
        discountStep: 0,
        pricingClusterId: "a2",
        countryTier: "tier_2",
        countryMultiplier: 1,
        deviceType: "Desktop",
        deviceMultiplier: 1.05,
        trafficSource: "direct",
        trafficMultiplier: 1.1,
        behavioralBucket: "moderate",
        behavioralMultiplier: 1,
        engagementScore: 20,
        engagementMultiplier: 1,
        reportPreviewViews: 1,
        fantasySignalCount: 0,
        surveyDurationMs: 400000,
        initialPriceTimestamp: "2026-04-14T10:00:00.000Z",
        expiresAt: "2026-05-05T10:00:00.000Z",
        checkoutStartedAt: null,
        purchasedAt: null,
        viewCount: 1,
      },
      all_reports: {
        id: 3,
        plan: "all_reports",
        currency: "EUR",
        experimentGroup: "A",
        basePriceBucket: "all_center",
        basePriceCents: 12999,
        currentPriceCents: 12999,
        initialPriceCents: 12999,
        discountMultiplier: 1,
        discountStep: 0,
        pricingClusterId: "a3",
        countryTier: "tier_2",
        countryMultiplier: 1,
        deviceType: "Desktop",
        deviceMultiplier: 1.05,
        trafficSource: "direct",
        trafficMultiplier: 1.1,
        behavioralBucket: "moderate",
        behavioralMultiplier: 1,
        engagementScore: 20,
        engagementMultiplier: 1,
        reportPreviewViews: 1,
        fantasySignalCount: 0,
        surveyDurationMs: 400000,
        initialPriceTimestamp: "2026-04-14T10:00:00.000Z",
        expiresAt: "2026-05-05T10:00:00.000Z",
        checkoutStartedAt: null,
        purchasedAt: null,
        viewCount: 1,
      },
    });

    const res = await GET(
      new Request("http://localhost/api/price?token=rpt_ABCDEFGHIJKLMNOPQRST", {
        headers: { "user-agent": "Mozilla/5.0" },
      })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      quotes: expect.objectContaining({
        all_reports: expect.objectContaining({ currentPriceCents: 12999 }),
      }),
    });
  });
});
