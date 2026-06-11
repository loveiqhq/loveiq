import { describe, it, expect } from "vitest";
import { classifyChannel, CHANNEL_BUCKETS } from "@features/admin/server/next-level";

const t = (obj: Record<string, string>) => JSON.stringify(obj);

describe("classifyChannel", () => {
  it("returns Direct for missing / empty trackers", () => {
    expect(classifyChannel(null)).toBe("Direct");
    expect(classifyChannel("")).toBe("Direct");
    expect(classifyChannel("{}")).toBe("Direct");
  });

  it("classifies Google Ads (paid search)", () => {
    expect(classifyChannel(t({ utm_source: "google", utm_medium: "cpc" }))).toBe("Google Ads");
    expect(classifyChannel(t({ utm_source: "adwords", utm_medium: "ppc" }))).toBe("Google Ads");
    expect(classifyChannel(t({ utm_source: "bing", utm_medium: "cpc" }))).toBe("Google Ads");
  });

  it("classifies Paid Social", () => {
    expect(classifyChannel(t({ utm_source: "facebook", utm_medium: "paid_social" }))).toBe(
      "Paid Social"
    );
    expect(classifyChannel(t({ utm_source: "instagram", utm_medium: "cpc" }))).toBe("Paid Social");
    expect(classifyChannel(t({ utm_source: "tiktok", utm_medium: "paid" }))).toBe("Paid Social");
  });

  it("classifies Organic Search", () => {
    expect(classifyChannel(t({ utm_source: "google", utm_medium: "organic" }))).toBe(
      "Organic Search"
    );
    expect(classifyChannel(t({ utm_source: "bing" }))).toBe("Organic Search");
    // GA placeholder medium "(none)" / "none" must not bump organic to "Other".
    expect(classifyChannel(t({ utm_source: "google", utm_medium: "none" }))).toBe("Organic Search");
    expect(classifyChannel(t({ utm_source: "google", utm_medium: "(none)" }))).toBe(
      "Organic Search"
    );
  });

  it("treats GA (direct)/(none) placeholders as Direct", () => {
    expect(classifyChannel(t({ utm_source: "(direct)", utm_medium: "(none)" }))).toBe("Direct");
  });

  it("classifies Organic Social", () => {
    expect(classifyChannel(t({ utm_source: "instagram" }))).toBe("Organic Social");
    expect(classifyChannel(t({ utm_source: "tiktok", utm_medium: "social" }))).toBe(
      "Organic Social"
    );
  });

  it("classifies Email", () => {
    expect(classifyChannel(t({ utm_medium: "email" }))).toBe("Email");
    expect(classifyChannel(t({ utm_source: "newsletter" }))).toBe("Email");
    expect(classifyChannel(t({ utm_source: "klaviyo", utm_medium: "email" }))).toBe("Email");
  });

  it("classifies Referral", () => {
    expect(classifyChannel(t({ utm_source: "somesite.com", utm_medium: "referral" }))).toBe(
      "Referral"
    );
  });

  it("returns Other for an unplaceable source", () => {
    expect(classifyChannel(t({ utm_source: "taboola", utm_medium: "cpc" }))).toBe("Other");
    expect(classifyChannel(t({ utm_source: "partnerblog" }))).toBe("Other");
  });

  it("only ever returns a known bucket", () => {
    const samples = [
      null,
      "{}",
      t({ utm_source: "google", utm_medium: "cpc" }),
      t({ utm_source: "weird", utm_medium: "weird" }),
      "not-json",
    ];
    for (const s of samples) {
      expect(CHANNEL_BUCKETS).toContain(classifyChannel(s));
    }
  });
});
