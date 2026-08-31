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
  getReportPriceQuoteForContext: vi.fn(),
  getReportPriceQuotesForContext: vi.fn(),
}));

// Run the deferred work inline so the journey ping is observable in the test.
// Swallows like the real helper, which logs rather than rejecting.
vi.mock("@shared/http/after-response", () => ({
  scheduleAfterResponse: vi.fn((_key: string, fn: () => Promise<void>) => {
    void fn().catch(() => {});
  }),
}));

vi.mock("@features/report/server/personalReport", () => ({
  resolveSubmissionAccessContext: vi.fn().mockResolvedValue({ submissionId: 4242 }),
}));

vi.mock("@features/attribution/server/journey-message", () => ({
  refreshJourneyMessage: vi.fn().mockResolvedValue(undefined),
}));

import { GET, POST } from "@/app/api/price/route";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit } from "@shared/http/ratelimit";
import { refreshJourneyMessage } from "@features/attribution/server/journey-message";
import {
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
/**
 * The POST used to arm a three-minute urgency window that added 2 EUR to every plan.
 * That surcharge and its countdown were removed on 2026-08-31; the endpoint survives
 * for the one thing only it can do — tell the server, consent-independently, that a
 * reader reached the paywall, so the Slack journey message can fill "Paywall hit".
 */
describe("POST /api/price", () => {
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

  it("advances the journey message to Paywall hit", async () => {
    const res = await POST(armRequest({ token: "rpt_ABCDEFGHIJKLMNOPQRST" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
    expect(refreshJourneyMessage).toHaveBeenCalledWith(4242, "paywall");
  });

  it("returns no price or deadline — this endpoint no longer moves money", async () => {
    const res = await POST(armRequest({ token: "rpt_ABCDEFGHIJKLMNOPQRST" }));
    const body = (await res.json()) as Record<string, unknown>;

    expect(Object.keys(body)).toEqual(["success"]);
  });

  it("refuses a request without a CSRF token", async () => {
    vi.mocked(verifyCsrfToken).mockResolvedValue(false);

    const res = await POST(armRequest({ token: "rpt_ABCDEFGHIJKLMNOPQRST" }));

    expect(res.status).toBe(403);
    expect(refreshJourneyMessage).not.toHaveBeenCalled();
  });

  it("refuses a request with no report context", async () => {
    const res = await POST(armRequest({}));

    expect(res.status).toBe(400);
    expect(refreshJourneyMessage).not.toHaveBeenCalled();
  });

  it("never fails the reader when the journey write throws", async () => {
    vi.mocked(refreshJourneyMessage).mockRejectedValueOnce(new Error("supabase down"));

    const res = await POST(armRequest({ token: "rpt_ABCDEFGHIJKLMNOPQRST" }));

    expect(res.status).toBe(200);
  });
});
