import { describe, expect, it } from "vitest";
import {
  buildUnsubscribeUrl,
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  sanitizeCampaign,
  campaignLabel,
  CAMPAIGN_LABELS,
  UNSUBSCRIBE_CAMPAIGNS,
} from "@shared/emails/unsubscribe-token";

describe("unsubscribe token", () => {
  const secret = "test-secret-32-bytes-long-enough!";
  const email = "user@example.com";

  it("round-trips: verify returns email for valid token", () => {
    const token = generateUnsubscribeToken(email, secret);
    expect(verifyUnsubscribeToken(token, secret)).toBe("user@example.com");
  });

  it("returns null for tampered token", () => {
    const token = generateUnsubscribeToken(email, secret) + "x";
    expect(verifyUnsubscribeToken(token, secret)).toBeNull();
  });

  it("returns null for wrong secret", () => {
    const token = generateUnsubscribeToken(email, secret);
    expect(verifyUnsubscribeToken(token, "wrong-secret")).toBeNull();
  });

  it("returns null for missing dot separator", () => {
    expect(verifyUnsubscribeToken("nodot", secret)).toBeNull();
  });

  it("buildUnsubscribeUrl includes token and base path", () => {
    const url = buildUnsubscribeUrl("hello@loveiq.org", "https://loveiq.org", secret);
    expect(url).toMatch(/^https:\/\/loveiq\.org\/api\/unsubscribe\?token=/);
    // Token in URL must be verifiable
    const token = decodeURIComponent(url.split("token=")[1]);
    expect(verifyUnsubscribeToken(token, secret)).toBe("hello@loveiq.org");
  });

  it("buildUnsubscribeUrl omits src when no campaign is given (back-compat)", () => {
    const url = buildUnsubscribeUrl("hello@loveiq.org", "https://loveiq.org", secret);
    expect(url).not.toContain("&src=");
  });

  it("buildUnsubscribeUrl appends the campaign as &src= and keeps the token valid", () => {
    const url = buildUnsubscribeUrl(
      "hello@loveiq.org",
      "https://loveiq.org",
      secret,
      "30h_no_unlock"
    );
    expect(url).toContain("&src=30h_no_unlock");
    // Adding src must not corrupt the token param.
    const token = decodeURIComponent(url.split("token=")[1].split("&")[0]);
    expect(verifyUnsubscribeToken(token, secret)).toBe("hello@loveiq.org");
  });

  it("buildUnsubscribeUrl sanitizes a tampered/unsafe campaign before embedding it", () => {
    const url = buildUnsubscribeUrl(
      "hello@loveiq.org",
      "https://loveiq.org",
      secret,
      "<script>alert(1)</script>"
    );
    // Angle brackets / parens stripped; only the safe slug remains.
    expect(url).toContain("&src=scriptalert1script");
    expect(url).not.toContain("<");
    expect(url).not.toContain(">");
  });
});

describe("sanitizeCampaign", () => {
  it("lowercases and strips characters outside [a-z0-9_]", () => {
    expect(sanitizeCampaign("Survey-Complete!")).toBe("surveycomplete");
    expect(sanitizeCampaign("30h_no_unlock")).toBe("30h_no_unlock");
  });

  it("returns empty string for null/undefined/empty", () => {
    expect(sanitizeCampaign(null)).toBe("");
    expect(sanitizeCampaign(undefined)).toBe("");
    expect(sanitizeCampaign("")).toBe("");
  });

  it("caps length at 40 chars", () => {
    expect(sanitizeCampaign("a".repeat(100))).toHaveLength(40);
  });

  it("is a no-op for every known campaign key (links never get rewritten)", () => {
    for (const key of Object.keys(CAMPAIGN_LABELS)) {
      expect(sanitizeCampaign(key)).toBe(key);
    }
  });
});

describe("campaignLabel", () => {
  it("maps known campaign keys to human labels", () => {
    expect(campaignLabel(UNSUBSCRIBE_CAMPAIGNS.surveyComplete)).toBe(
      "Survey complete (report ready)"
    );
    expect(campaignLabel("30h_no_unlock")).toBe("Nurture 30h (50% off)");
    expect(campaignLabel("invite_reminder_2")).toBe("Invite reminder #2");
  });

  it("falls back to the raw slug for unknown campaigns", () => {
    expect(campaignLabel("some_future_campaign")).toBe("some_future_campaign");
    expect(campaignLabel("")).toBe("");
  });

  it("returns a plain string (not an inherited object) for prototype-chain keys", () => {
    // `__proto__`/`constructor` survive sanitizeCampaign ([a-z0-9_]); a naive
    // CAMPAIGN_LABELS[key] would resolve Object.prototype and leak a non-string.
    expect(campaignLabel("__proto__")).toBe("__proto__");
    expect(campaignLabel("constructor")).toBe("constructor");
    expect(typeof campaignLabel("toString")).toBe("string");
  });

  it("has a label for every fixed campaign constant", () => {
    for (const key of Object.values(UNSUBSCRIBE_CAMPAIGNS)) {
      expect(CAMPAIGN_LABELS[key]).toBeTruthy();
    }
  });
});
