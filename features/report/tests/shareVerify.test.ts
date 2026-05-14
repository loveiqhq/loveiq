import { describe, expect, it, beforeAll } from "vitest";

beforeAll(() => {
  process.env.SHARE_VERIFY_SECRET = "test-secret-with-enough-entropy-for-vitest-runs";
});

import {
  buildVerifyCookieHeader,
  cookieNameForShare,
  isVerifyTokenValid,
  maskEmail,
  signVerifyToken,
  verifyCookieForShare,
} from "@features/report/server/shareVerify";

describe("signVerifyToken", () => {
  it("produces deterministic 64-hex output", () => {
    const a = signVerifyToken(42, "person@loveiq.org");
    const b = signVerifyToken(42, "person@loveiq.org");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("normalises email casing + whitespace", () => {
    const a = signVerifyToken(7, "Marie@LoveIQ.org");
    const b = signVerifyToken(7, "  marie@loveiq.org  ");
    expect(a).toBe(b);
  });

  it("yields different tokens for different shares", () => {
    expect(signVerifyToken(1, "x@x.io")).not.toBe(signVerifyToken(2, "x@x.io"));
  });
});

describe("isVerifyTokenValid", () => {
  it("accepts the matching token", () => {
    const token = signVerifyToken(99, "ada@loveiq.org");
    expect(isVerifyTokenValid(token, 99, "ada@loveiq.org")).toBe(true);
  });

  it("rejects mismatched email", () => {
    const token = signVerifyToken(99, "ada@loveiq.org");
    expect(isVerifyTokenValid(token, 99, "bob@loveiq.org")).toBe(false);
  });

  it("rejects mismatched share id", () => {
    const token = signVerifyToken(99, "ada@loveiq.org");
    expect(isVerifyTokenValid(token, 100, "ada@loveiq.org")).toBe(false);
  });

  it("rejects empty / undefined token", () => {
    expect(isVerifyTokenValid("", 1, "x@x.io")).toBe(false);
    expect(isVerifyTokenValid(undefined, 1, "x@x.io")).toBe(false);
    expect(isVerifyTokenValid(null, 1, "x@x.io")).toBe(false);
  });

  it("rejects truncated token (different length)", () => {
    const token = signVerifyToken(99, "ada@loveiq.org");
    expect(isVerifyTokenValid(token.slice(0, 30), 99, "ada@loveiq.org")).toBe(false);
  });
});

describe("verifyCookieForShare", () => {
  it("validates request whose Cookie header contains the matching token", () => {
    const token = signVerifyToken(8, "ada@loveiq.org");
    const req = new Request("http://localhost/api/report?token=rpts_aaaaaaaaaaaaaaaaaaaa", {
      headers: { cookie: `${cookieNameForShare(8)}=${token}; other=foo` },
    });
    expect(verifyCookieForShare(req, 8, "ada@loveiq.org")).toBe(true);
  });

  it("rejects when cookie header missing", () => {
    const req = new Request("http://localhost/x");
    expect(verifyCookieForShare(req, 8, "ada@loveiq.org")).toBe(false);
  });

  it("rejects when cookie value belongs to a different share", () => {
    const token = signVerifyToken(2, "ada@loveiq.org");
    const req = new Request("http://localhost/x", {
      headers: { cookie: `${cookieNameForShare(8)}=${token}` },
    });
    expect(verifyCookieForShare(req, 8, "ada@loveiq.org")).toBe(false);
  });
});

describe("buildVerifyCookieHeader", () => {
  it("includes HttpOnly, Path=/, SameSite=Lax, Max-Age", () => {
    const header = buildVerifyCookieHeader(5, "ada@loveiq.org");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Path=/");
    expect(header).toContain("SameSite=Lax");
    expect(header).toMatch(/Max-Age=\d+/);
  });

  it("starts with the share-scoped cookie name + signed value", () => {
    const header = buildVerifyCookieHeader(5, "ada@loveiq.org");
    const expected = `${cookieNameForShare(5)}=${signVerifyToken(5, "ada@loveiq.org")}`;
    expect(header.startsWith(expected)).toBe(true);
  });
});

describe("maskEmail", () => {
  it.each([
    ["marie@loveiq.org", "m***@loveiq.org"],
    ["a@x.io", "a***@x.io"],
    ["UPPERCASE@LoveIQ.org", "u***@loveiq.org"],
  ])("masks %s → %s", (input, expected) => {
    expect(maskEmail(input)).toBe(expected);
  });

  it("returns *** when email malformed", () => {
    expect(maskEmail("no-at-sign")).toBe("***");
    expect(maskEmail("@nope")).toBe("***");
  });
});
