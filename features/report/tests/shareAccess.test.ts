import { describe, expect, it } from "vitest";
import {
  generateShareToken,
  REPORT_ACCESS_TOKEN_REGEX,
  REPORT_SHARE_TOKEN_REGEX,
} from "@features/report/server/shareAccess";

describe("generateShareToken", () => {
  it("matches REPORT_SHARE_TOKEN_REGEX", () => {
    for (let i = 0; i < 20; i++) {
      const token = generateShareToken();
      expect(REPORT_SHARE_TOKEN_REGEX.test(token)).toBe(true);
      // Must NOT collide with owner-token format.
      expect(REPORT_ACCESS_TOKEN_REGEX.test(token)).toBe(false);
    }
  });

  it("produces unique tokens across calls", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 50; i++) tokens.add(generateShareToken());
    expect(tokens.size).toBe(50);
  });

  it("starts with rpts_ prefix and is 25 characters long", () => {
    const token = generateShareToken();
    expect(token.startsWith("rpts_")).toBe(true);
    expect(token).toHaveLength(25);
  });
});

describe("REPORT_SHARE_TOKEN_REGEX", () => {
  it("rejects owner tokens", () => {
    expect(REPORT_SHARE_TOKEN_REGEX.test("rpt_abcdefghijklmnopqrst")).toBe(false);
  });

  it("rejects tokens with wrong length", () => {
    expect(REPORT_SHARE_TOKEN_REGEX.test("rpts_short")).toBe(false);
    expect(REPORT_SHARE_TOKEN_REGEX.test("rpts_abcdefghijklmnopqrstu")).toBe(false);
  });

  it("rejects tokens with invalid characters", () => {
    expect(REPORT_SHARE_TOKEN_REGEX.test("rpts_abcdefghij!lmnopqrst")).toBe(false);
  });
});
