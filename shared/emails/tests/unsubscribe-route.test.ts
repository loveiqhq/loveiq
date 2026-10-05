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

/** The page's Unsubscribe button: an HTML form posting confirm=1. */
function confirmed(url: string): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "confirm=1",
  });
}

/** A mail client's RFC 8058 one-click request. */
function oneClick(url: string): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
  });
}

describe("/api/unsubscribe route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.UNSUBSCRIBE_SECRET = SECRET;
    mockAddToSuppression.mockResolvedValue(true);
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

  /**
   * The footer link only shows a page. Mail scanners (Safe Links, Mimecast, Proofpoint)
   * open every link in a message, and Next answers HEAD with GET, so a GET that
   * unsubscribed took people off the list without a click.
   */
  it("GET shows an Unsubscribe button and unsubscribes nobody", async () => {
    const url = buildUnsubscribeUrl(EMAIL, "https://loveiq.org", SECRET, "survey_complete");
    const res = await GET(new Request(url));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    const html = await res.text();
    const { pathname, search } = new URL(url);
    expect(html).toContain('<form method="post"');
    expect(html).toContain(`action="${(pathname + search).replace(/&/g, "&amp;")}"`);
    expect(html).toContain('name="confirm" value="1"');
    expect(html).toContain(">Unsubscribe</button>");
    expect(mockAddToSuppression).not.toHaveBeenCalled();
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("GET escapes the link it posts back to", async () => {
    const token = generateUnsubscribeToken(EMAIL, SECRET, "invite");
    const res = await GET(
      new Request(
        `https://loveiq.org/api/unsubscribe?token=${encodeURIComponent(token)}&src="><script>x</script>`
      )
    );
    const html = await res.text();
    expect(html).not.toContain("<script>");
    expect(html).not.toMatch(/action="[^"]*"[^ >]*"/);
  });

  it("attributes a footer click from the campaign baked into the token (no &src= needed)", async () => {
    // Build the real link, then strip &src= to simulate a client dropping it.
    const url = buildUnsubscribeUrl(EMAIL, "https://loveiq.org", SECRET, "survey_complete");
    const tokenOnly = url.split("&src=")[0];
    const res = await POST(confirmed(tokenOnly));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("You've been unsubscribed");
    expect(mockAddToSuppression).toHaveBeenCalledWith(EMAIL, "unsubscribed", {
      campaign: "survey_complete",
      channel: "footer",
    });
    expect(slackText()).toContain("Unsubscribe (footer)");
    expect(slackText()).toContain("via *Survey complete (report ready)*");
  });

  it("falls back to the &src= param for an in-flight token that has no embedded campaign", async () => {
    // 3-part token (no campaign) + a manually appended &src= — the deploy→change window case.
    const token = generateUnsubscribeToken(EMAIL, SECRET);
    const res = await POST(
      confirmed(`https://loveiq.org/api/unsubscribe?token=${encodeURIComponent(token)}&src=invite`)
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
    const res = await POST(
      confirmed(`https://loveiq.org/api/unsubscribe?token=${encodeURIComponent(token)}`)
    );
    expect(res.status).toBe(200);
    expect(slackText()).toContain("(sent before source tracking)");
    expect(slackText()).not.toContain("(source unknown)");
  });

  it("attributes a one-click POST from the token campaign", async () => {
    const url = buildUnsubscribeUrl(EMAIL, "https://loveiq.org", SECRET, "30h_no_unlock");
    const tokenOnly = url.split("&src=")[0];
    const res = await POST(oneClick(tokenOnly));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockAddToSuppression).toHaveBeenCalledWith(EMAIL, "unsubscribed", {
      campaign: "30h_no_unlock",
      channel: "one-click",
    });
    expect(slackText()).toContain("(one-click)");
    expect(slackText()).toContain("via *Nurture 30h (50% off)*");
  });

  it("a one-click POST in multipart form still counts as one-click", async () => {
    const url = buildUnsubscribeUrl(EMAIL, "https://loveiq.org", SECRET, "invite");
    const body = new FormData();
    body.set("List-Unsubscribe", "One-Click");
    const res = await POST(new Request(url, { method: "POST", body }));
    expect(res.status).toBe(200);
    expect(mockAddToSuppression).toHaveBeenCalledWith(
      EMAIL,
      "unsubscribed",
      expect.objectContaining({ channel: "one-click" })
    );
  });

  /** A refused write used to show the same "You've been unsubscribed" page. */
  it("says so, and offers Try again, when the address could not be written — the button", async () => {
    mockAddToSuppression.mockResolvedValue(false);
    const url = buildUnsubscribeUrl(EMAIL, "https://loveiq.org", SECRET, "invite");
    const res = await POST(confirmed(url));
    expect(res.status).toBe(503);
    const html = await res.text();
    expect(html).toContain("We couldn't unsubscribe you just now");
    expect(html).not.toContain("You've been unsubscribed");
    expect(html).toContain(">Try again</button>");
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });

  it("503s a one-click POST when the address could not be written, so the client retries", async () => {
    mockAddToSuppression.mockResolvedValue(false);
    const url = buildUnsubscribeUrl(EMAIL, "https://loveiq.org", SECRET, "invite");
    const res = await POST(oneClick(url));
    expect(res.status).toBe(503);
    expect(mockNotifySlack).not.toHaveBeenCalled();
  });
});
