import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/http/csrf", () => ({
  verifyCsrfToken: vi.fn().mockResolvedValue(true),
}));

vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 59, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@features/pricing/logic/reportPricing", () => ({
  armReportUrgencyWindow: vi.fn(),
  getReportPriceQuoteForContext: vi.fn(),
  getReportPriceQuotesForContext: vi.fn(),
}));

import { GET, POST } from "@/app/api/price/route";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit } from "@shared/http/ratelimit";
import {
  armReportUrgencyWindow,
  getReportPriceQuoteForContext,
  getReportPriceQuotesForContext,
} from "@features/pricing/logic/reportPricing";

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
      urgencyDeadlineAt: null,
      surchargeCents: 0,
      chargedPriceCents: 2749,
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
        urgencyDeadlineAt: null,
        surchargeCents: 0,
        chargedPriceCents: 2749,
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
        urgencyDeadlineAt: null,
        surchargeCents: 0,
        chargedPriceCents: 1499,
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
        urgencyDeadlineAt: null,
        surchargeCents: 0,
        chargedPriceCents: 2999,
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
        urgencyDeadlineAt: null,
        surchargeCents: 0,
        chargedPriceCents: 12999,
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

/**
 * Arming the urgency window — the three minutes after which every plan costs two euros
 * more.
 *
 * A POST rather than a flag on the GET: the GET is fetched by things that are not
 * readers (a shared report link unfurling in Slack), and arming has a price
 * consequence, so it must only be reachable from our own page.
 */
describe("POST /api/price", () => {
  const armed = "2026-08-23T12:03:00.000Z";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyCsrfToken).mockResolvedValue(true);
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 59,
      resetAt: new Date(),
    });
  });

  function armRequest(body: unknown) {
    return new Request("http://localhost/api/price", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "valid" },
      body: JSON.stringify(body),
    });
  }

  it("arms the window and returns the deadline", async () => {
    vi.mocked(armReportUrgencyWindow).mockResolvedValue(armed);

    const res = await POST(armRequest({ token: "rpt_ABCDEFGHIJKLMNOPQRST" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ urgencyDeadlineAt: armed });
  });

  it("returns the same deadline when called again — it is never re-armed or extended", async () => {
    // Re-arming would hand a reader the lower price back by reopening the report.
    vi.mocked(armReportUrgencyWindow).mockResolvedValue(armed);

    const first = await POST(armRequest({ token: "rpt_ABCDEFGHIJKLMNOPQRST" }));
    const second = await POST(armRequest({ token: "rpt_ABCDEFGHIJKLMNOPQRST" }));

    await expect(first.json()).resolves.toEqual({ urgencyDeadlineAt: armed });
    await expect(second.json()).resolves.toEqual({ urgencyDeadlineAt: armed });
  });

  it("refuses a request without a CSRF token", async () => {
    vi.mocked(verifyCsrfToken).mockResolvedValue(false);

    const res = await POST(armRequest({ token: "rpt_ABCDEFGHIJKLMNOPQRST" }));

    expect(res.status).toBe(403);
    expect(armReportUrgencyWindow).not.toHaveBeenCalled();
  });

  it("refuses a request with no report context", async () => {
    const res = await POST(armRequest({}));

    expect(res.status).toBe(400);
    expect(armReportUrgencyWindow).not.toHaveBeenCalled();
  });

  it("reports no deadline rather than failing when arming throws", async () => {
    // The reader keeps the base price; they never see an error for this.
    vi.mocked(armReportUrgencyWindow).mockRejectedValue(new Error("supabase down"));

    const res = await POST(armRequest({ token: "rpt_ABCDEFGHIJKLMNOPQRST" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ urgencyDeadlineAt: null });
  });
});
