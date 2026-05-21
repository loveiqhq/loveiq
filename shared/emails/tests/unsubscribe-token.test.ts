import { describe, expect, it } from "vitest";
import {
  buildUnsubscribeUrl,
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
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
});
