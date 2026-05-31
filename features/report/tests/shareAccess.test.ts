import { describe, expect, it, vi, beforeEach } from "vitest";

// R-06: F-17 token-expiry filter on the token lookup path. shareAccess.ts
// has its own internal supabaseFetch wrapper around fetchWithTimeout —
// mock at that boundary. Assert the outgoing URL contains the
// `or=(expires_at.is.null,expires_at.gt.<now>)` filter so an expired
// token can never resolve. The other 3 read sites use the same pattern.
const mockFetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
}));

import {
  generateShareToken,
  REPORT_ACCESS_TOKEN_REGEX,
  REPORT_SHARE_TOKEN_REGEX,
  resolveOwnerFromAccessToken,
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

describe("resolveOwnerFromAccessToken — F-17 expires_at filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  });

  it("token lookup URL includes the expires_at OR filter", async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    await resolveOwnerFromAccessToken("rpt_AbCdEfGhIjKlMnOpQrSt");

    // First call is the token lookup. URL is the full Supabase URL.
    const tokenLookupUrl = mockFetchWithTimeout.mock.calls[0][0] as string;
    expect(tokenLookupUrl).toContain("/rest/v1/report_access_token");
    expect(tokenLookupUrl).toContain("revoked_at=is.null");
    // The OR clause filters out tokens whose expires_at is in the past.
    expect(tokenLookupUrl).toContain("or=(expires_at.is.null,expires_at.gt.");
  });

  it("returns null for an invalid token format (does not hit Supabase)", async () => {
    const result = await resolveOwnerFromAccessToken("not-a-token");
    expect(result).toBeNull();
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });
});
