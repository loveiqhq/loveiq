import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockAddToSuppression = vi.fn();
vi.mock("@shared/emails/suppression", () => ({
  addToSuppression: (...args: unknown[]) => mockAddToSuppression(...args),
}));

const mockNotifySlack = vi.fn();
vi.mock("@shared/observability/slack", () => ({
  notifySlack: (...args: unknown[]) => mockNotifySlack(...args),
  // Identity passthroughs so assertions can read the raw text.
  maskEmail: (e: string) => e,
  escapeSlack: (s: string) => s,
}));

vi.mock("@shared/emails/site-url", () => ({
  getEmailSiteUrl: () => "https://loveiq.org",
}));

const mockLogger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@shared/observability/logger", () => ({ default: mockLogger }));

// Real token module — we want genuine sign/verify + describeUnsubscribeSource.
import {
  generateUnsubscribeToken,
  buildUnsubscribeUrl,
  SOURCE_TRACKING_SINCE,
} from "@shared/emails/unsubscribe-token";
import { GET, POST } from "@/app/api/unsubscribe/route";

const SECRET = "test-secret-32-bytes-long-enough!";
const EMAIL = "user@example.com";

function slackText(): string {
  return mockNotifySlack.mock.calls[0]?.[0]?.text ?? "";
}

describe("/api/unsubscribe route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.UNSUBSCRIBE_SECRET = SECRET;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("503s and logs (not a silent 400) when UNSUBSCRIBE_SECRET is unset — GET", async () => {
    delete process.env.UNSUBSCRIBE_SECRET;
    const res = await GET(new Request("https://loveiq.org/api/unsubscribe?token=anything"));
    expect(res.status).toBe(503);
    expect(mockLogger.error).toHaveBeenCalled();
    expect(mockAddToSuppression).not.toHaveBeenCalled();
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("503s and logs when UNSUBSCRIBE_SECRET is unset — one-click POST", async () => {
    delete process.env.UNSUBSCRIBE_SECRET;
    const res = await POST(
      new Request("https://loveiq.org/api/unsubscribe?token=anything", { method: "POST" })
    );
    expect(res.status).toBe(503);
    expect(mockLogger.error).toHaveBeenCalled();
    expect(mockAddToSuppression).not.toHaveBeenCalled();
  });

  it("400s an invalid token without recording anything — GET", async () => {
    const res = await GET(new Request("https://loveiq.org/api/unsubscribe?token=garbage"));
    expect(res.status).toBe(400);
    expect(mockAddToSuppression).not.toHaveBeenCalled();
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("400s an invalid token without recording anything — POST (guard ordered after secret check)", async () => {
    const res = await POST(
      new Request("https://loveiq.org/api/unsubscribe?token=garbage", { method: "POST" })
    );
    expect(res.status).toBe(400);
    expect(mockAddToSuppression).not.toHaveBeenCalled();
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("attributes a footer click from the campaign baked into the token (no &src= needed)", async () => {
    // Build the real link, then strip &src= to simulate a client dropping it.
    const url = buildUnsubscribeUrl(EMAIL, "https://loveiq.org", SECRET, "survey_complete");
    const tokenOnly = url.split("&src=")[0];
    const res = await GET(new Request(tokenOnly));
    expect(res.status).toBe(200);
    expect(mockAddToSuppression).toHaveBeenCalledWith(EMAIL, "unsubscribed", {
      campaign: "survey_complete",
      channel: "footer",
    });
    expect(slackText()).toContain("via *Survey complete (report ready)*");
  });

  it("falls back to the &src= param for an in-flight token that has no embedded campaign", async () => {
    // 3-part token (no campaign) + a manually appended &src= — the deploy→change window case.
    const token = generateUnsubscribeToken(EMAIL, SECRET);
    const res = await GET(
      new Request(
        `https://loveiq.org/api/unsubscribe?token=${encodeURIComponent(token)}&src=invite`
      )
    );
    expect(res.status).toBe(200);
    expect(mockAddToSuppression).toHaveBeenCalledWith(EMAIL, "unsubscribed", {
      campaign: "invite",
      channel: "footer",
    });
    expect(slackText()).toContain("via *Partner invite*");
  });

  it("labels a campaign-less link minted before tracking as benign backlog", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(SOURCE_TRACKING_SINCE - 7 * 24 * 60 * 60 * 1000)); // a week before
    const token = generateUnsubscribeToken(EMAIL, SECRET); // 3-part, no campaign
    vi.useRealTimers();
    const res = await GET(
      new Request(`https://loveiq.org/api/unsubscribe?token=${encodeURIComponent(token)}`)
    );
    expect(res.status).toBe(200);
    expect(slackText()).toContain("(sent before source tracking)");
    expect(slackText()).not.toContain("(source unknown)");
  });

  it("attributes a one-click POST from the token campaign", async () => {
    const url = buildUnsubscribeUrl(EMAIL, "https://loveiq.org", SECRET, "30h_no_unlock");
    const tokenOnly = url.split("&src=")[0];
    const res = await POST(new Request(tokenOnly, { method: "POST" }));
    expect(res.status).toBe(200);
    expect(mockAddToSuppression).toHaveBeenCalledWith(EMAIL, "unsubscribed", {
      campaign: "30h_no_unlock",
      channel: "one-click",
    });
    expect(slackText()).toContain("(one-click)");
    expect(slackText()).toContain("via *Nurture 30h (50% off)*");
  });
});
