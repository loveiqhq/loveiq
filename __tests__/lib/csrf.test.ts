import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/headers before importing the module under test
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

import { verifyCsrfToken } from "@shared/http/csrf";
import { cookies } from "next/headers";

const mockedCookies = vi.mocked(cookies);

function makeRequest(headerToken?: string): Request {
  const headers = new Headers();
  if (headerToken !== undefined) {
    headers.set("x-csrf-token", headerToken);
  }
  return new Request("http://localhost/api/test", { headers });
}

function mockCookieStore(cookieValue?: string) {
  mockedCookies.mockResolvedValue({
    get: vi.fn().mockReturnValue(cookieValue !== undefined ? { value: cookieValue } : undefined),
  } as never);
}

describe("verifyCsrfToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when cookie is missing", async () => {
    mockCookieStore(undefined);
    const result = await verifyCsrfToken(makeRequest("some-token"));
    expect(result).toBe(false);
  });

  it("returns false when header is missing", async () => {
    mockCookieStore("some-token");
    const result = await verifyCsrfToken(makeRequest());
    expect(result).toBe(false);
  });

  it("returns false when both are missing", async () => {
    mockCookieStore(undefined);
    const result = await verifyCsrfToken(makeRequest());
    expect(result).toBe(false);
  });

  it("returns false when lengths differ", async () => {
    mockCookieStore("short");
    const result = await verifyCsrfToken(makeRequest("much-longer-token"));
    expect(result).toBe(false);
  });

  it("returns false when tokens do not match", async () => {
    mockCookieStore("abc123def456");
    const result = await verifyCsrfToken(makeRequest("abc123def789"));
    expect(result).toBe(false);
  });

  it("returns true when tokens match", async () => {
    const token = "valid-csrf-token-12345";
    mockCookieStore(token);
    const result = await verifyCsrfToken(makeRequest(token));
    expect(result).toBe(true);
  });

  it("uses constant-time comparison (same length, different content)", async () => {
    // Both same length but different — should still return false
    mockCookieStore("aaaa");
    const result = await verifyCsrfToken(makeRequest("bbbb"));
    expect(result).toBe(false);
  });
});
