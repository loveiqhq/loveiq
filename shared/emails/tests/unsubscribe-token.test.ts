import { createHmac } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildUnsubscribeUrl,
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  sanitizeCampaign,
  campaignLabel,
  describeUnsubscribeSource,
  SOURCE_TRACKING_SINCE,
  CAMPAIGN_LABELS,
  UNSUBSCRIBE_CAMPAIGNS,
} from "@shared/emails/unsubscribe-token";

describe("unsubscribe token", () => {
  const secret = "test-secret-32-bytes-long-enough!";
  const email = "user@example.com";

  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips: verify returns the email for a valid token", () => {
    const token = generateUnsubscribeToken(email, secret);
    expect(verifyUnsubscribeToken(token, secret)?.email).toBe("user@example.com");
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

  it("exposes issuedAt close to now for a fresh token", () => {
    const before = Date.now();
    const token = generateUnsubscribeToken(email, secret);
    const result = verifyUnsubscribeToken(token, secret);
    expect(result?.issuedAt).toBeGreaterThanOrEqual(
      // base36 second-or-ms truncation tolerance
      before - 1000
    );
    expect(result?.issuedAt).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("still enforces the 180-day TTL on a campaign-bearing token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = generateUnsubscribeToken(email, secret, "30h_no_unlock");
    // valid immediately
    expect(verifyUnsubscribeToken(token, secret)?.email).toBe(email);
    // expired 181 days later
    vi.setSystemTime(new Date("2026-07-02T00:00:00Z"));
    expect(verifyUnsubscribeToken(token, secret)).toBeNull();
  });

  describe("campaign embedded in the signed token", () => {
    it("carries the campaign through verify when one is supplied", () => {
      const token = generateUnsubscribeToken(email, secret, "30h_no_unlock");
      const result = verifyUnsubscribeToken(token, secret);
      expect(result?.email).toBe(email);
      expect(result?.campaign).toBe("30h_no_unlock");
    });

    it("returns an empty campaign when none is supplied (3-part token)", () => {
      const token = generateUnsubscribeToken(email, secret);
      expect(token.split(".")).toHaveLength(3);
      expect(verifyUnsubscribeToken(token, secret)?.campaign).toBe("");
    });

    it("uses a 4-part token only when a campaign is present", () => {
      expect(generateUnsubscribeToken(email, secret, "invite").split(".")).toHaveLength(4);
    });

    it("sanitizes the campaign before embedding it", () => {
      const token = generateUnsubscribeToken(email, secret, "Survey-Complete!");
      expect(verifyUnsubscribeToken(token, secret)?.campaign).toBe("surveycomplete");
    });

    it("rejects a token whose campaign segment was tampered with", () => {
      const [enc, ts, , sig] = generateUnsubscribeToken(email, secret, "invite").split(".");
      const forged = [enc, ts, Buffer.from("report_unlocked").toString("base64url"), sig].join(".");
      expect(verifyUnsubscribeToken(forged, secret)).toBeNull();
    });
  });

  it("accepts a legacy 2-part token with a null issuedAt (no campaign)", () => {
    const enc = Buffer.from(email).toString("base64url");
    // nosemgrep: javascript.lang.security.audit.hardcoded-hmac-key.hardcoded-hmac-key -- test-only secret; mirrors the lib's internal sign() to forge a legacy 2-part token
    const sig = createHmac("sha256", secret).update(email).digest("base64url");
    const legacy = `${enc}.${sig}`;
    const result = verifyUnsubscribeToken(legacy, secret);
    expect(result?.email).toBe(email);
    expect(result?.campaign).toBe("");
    expect(result?.issuedAt).toBeNull();
  });

  it("buildUnsubscribeUrl includes token and base path", () => {
    const url = buildUnsubscribeUrl("hello@loveiq.org", "https://loveiq.org", secret);
    expect(url).toMatch(/^https:\/\/loveiq\.org\/api\/unsubscribe\?token=/);
    const token = decodeURIComponent(url.split("token=")[1]);
    expect(verifyUnsubscribeToken(token, secret)?.email).toBe("hello@loveiq.org");
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
    const token = decodeURIComponent(url.split("token=")[1].split("&")[0]);
    expect(verifyUnsubscribeToken(token, secret)?.email).toBe("hello@loveiq.org");
  });

  it("buildUnsubscribeUrl bakes the campaign into the token itself (survives &src= loss)", () => {
    const url = buildUnsubscribeUrl("hello@loveiq.org", "https://loveiq.org", secret, "invite");
    // Take ONLY the token param, dropping &src= entirely — simulating a mail
    // client that strips the trailing query param.
    const token = decodeURIComponent(url.split("token=")[1].split("&")[0]);
    expect(verifyUnsubscribeToken(token, secret)?.campaign).toBe("invite");
  });

  it("buildUnsubscribeUrl sanitizes a tampered/unsafe campaign before embedding it", () => {
    const url = buildUnsubscribeUrl(
      "hello@loveiq.org",
      "https://loveiq.org",
      secret,
      "<script>alert(1)</script>"
    );
    expect(url).toContain("&src=scriptalert1script");
    expect(url).not.toContain("<");
    expect(url).not.toContain(">");
  });
});

describe("describeUnsubscribeSource", () => {
  it("attributes a known campaign to its human label", () => {
    expect(describeUnsubscribeSource("30h_no_unlock", Date.now())).toEqual({
      attributed: true,
      label: "Nurture 30h (50% off)",
    });
  });

  it("labels a campaign-less link issued before tracking started as backlog", () => {
    const result = describeUnsubscribeSource("", SOURCE_TRACKING_SINCE - 1);
    expect(result).toEqual({ attributed: false, note: "(sent before source tracking)" });
  });

  it("flags a campaign-less link issued after tracking started as a real gap", () => {
    const result = describeUnsubscribeSource("", SOURCE_TRACKING_SINCE + 1);
    expect(result).toEqual({ attributed: false, note: "(source missing — investigate)" });
  });

  it("labels a legacy link (no timestamp) as source-unavailable", () => {
    const result = describeUnsubscribeSource("", null);
    expect(result).toEqual({ attributed: false, note: "(legacy link — source unavailable)" });
  });

  it("SOURCE_TRACKING_SINCE is the e1d5261 deploy instant (2026-06-12 15:10 UTC)", () => {
    expect(SOURCE_TRACKING_SINCE).toBe(Date.UTC(2026, 5, 12, 15, 10, 0));
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
