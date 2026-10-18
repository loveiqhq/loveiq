import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockSend = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => mockSend(...args) };
  },
}));

import {
  buildContinueUrl,
  payToStartConfirmationEmail,
  resolveEmailOrigin,
  sendPayToStartConfirmationEmail,
} from "@features/pay-to-start/server/emails/confirmation";

const TOKEN = `rpp_${"d".repeat(32)}`;

describe("resolveEmailOrigin", () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  afterEach(() => {
    if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  });

  it("keeps our own hosts, so a staging purchase links back to staging", () => {
    expect(resolveEmailOrigin("https://www.loveiq.org")).toBe("https://www.loveiq.org");
    expect(resolveEmailOrigin("https://staging.loveiq.org")).toBe("https://staging.loveiq.org");
  });

  it("allows localhost outside production, for a local sandbox walk", () => {
    expect(resolveEmailOrigin("http://localhost:3107")).toBe("http://localhost:3107");
  });

  it("falls back to the production site for anything else", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    for (const origin of [
      "https://evil.example",
      "http://www.loveiq.org",
      "https://loveiq.org.evil.example",
      "not a url",
      null,
    ]) {
      expect(resolveEmailOrigin(origin)).toBe("https://www.loveiq.org");
    }
  });
});

describe("the confirmation email", () => {
  it("links the button to the continue route with the token", () => {
    const url = buildContinueUrl("https://www.loveiq.org", TOKEN);
    expect(url).toBe(`https://www.loveiq.org/sexual-archetype/continue?t=${TOKEN}`);
    const tpl = payToStartConfirmationEmail({
      amountText: "€29.00",
      continueUrl: url,
      productName: "LoveIQ Survey & Report",
      siteUrl: "https://www.loveiq.org",
    });
    expect(tpl.html).toContain(`href="${url}"`);
    expect(tpl.text).toContain(url);
    expect(tpl.html).toContain("LoveIQ Survey &amp; Report");
    expect(tpl.text).toContain("€29.00 for the LoveIQ Survey & Report");
    expect(tpl.subject).toBe("Payment received: your survey is ready");
    expect(tpl.text).toContain("Start my survey");
  });

  it("tells a buyer whose survey is already done that the report is unlocked", () => {
    const url = buildContinueUrl("https://www.loveiq.org", TOKEN);
    const tpl = payToStartConfirmationEmail({
      amountText: "€29.00",
      continueUrl: url,
      productName: "LoveIQ Survey & Report",
      siteUrl: "https://www.loveiq.org",
      variant: "report",
    });
    expect(tpl.subject).toBe("Payment received: your report is unlocked");
    expect(tpl.html).toContain("Your report is unlocked.");
    expect(tpl.html).toContain(`href="${url}"`);
    expect(tpl.text).toContain(`Open my report: ${url}`);
    for (const body of [tpl.html, tpl.text]) {
      expect(body).not.toContain("Start my survey");
      expect(body).not.toContain("Take the survey");
      expect(body).not.toContain("stop halfway");
    }
  });

  describe("sending", () => {
    beforeEach(() => {
      mockSend.mockReset();
      process.env.RESEND_API_KEY = "re_test";
    });
    afterEach(() => {
      delete process.env.RESEND_API_KEY;
    });

    it("sends to the buyer, tagged as this journey", async () => {
      mockSend.mockResolvedValue({ error: null });
      const sent = await sendPayToStartConfirmationEmail({
        amountText: "€29.00",
        email: "buyer@example.com",
        entitlementId: 7,
        origin: "https://staging.loveiq.org",
        productName: "LoveIQ Survey & Report",
        token: TOKEN,
      });
      expect(sent).toBe(true);
      const payload = mockSend.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(payload.to).toBe("buyer@example.com");
      expect(payload.tags).toEqual([
        { name: "journey", value: "pay_to_start" },
        { name: "email", value: "pts_confirmation" },
      ]);
      expect(String(payload.html)).toContain(
        `https://staging.loveiq.org/sexual-archetype/continue?t=${TOKEN}`
      );
    });

    it("never throws, whatever Resend does", async () => {
      mockSend.mockRejectedValue(new Error("network"));
      expect(
        await sendPayToStartConfirmationEmail({
          amountText: "€29.00",
          email: "buyer@example.com",
          entitlementId: 7,
          origin: null,
          productName: "LoveIQ Survey & Report",
          token: TOKEN,
        })
      ).toBe(false);
    });
  });
});
