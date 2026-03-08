import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

import { verifyCsrfTokenFromBody } from "../../lib/csrf";
import { cookies } from "next/headers";

const mockedCookies = vi.mocked(cookies);

function mockCookieStore(cookieValue?: string) {
  mockedCookies.mockResolvedValue({
    get: vi.fn().mockReturnValue(cookieValue !== undefined ? { value: cookieValue } : undefined),
  } as never);
}

describe("verifyCsrfTokenFromBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when body token is undefined", async () => {
    mockCookieStore("some-token");
    const result = await verifyCsrfTokenFromBody(undefined);
    expect(result).toBe(false);
  });

  it("returns false when cookie is missing", async () => {
    mockCookieStore(undefined);
    const result = await verifyCsrfTokenFromBody("some-token");
    expect(result).toBe(false);
  });

  it("returns false when lengths differ", async () => {
    mockCookieStore("short");
    const result = await verifyCsrfTokenFromBody("much-longer-token");
    expect(result).toBe(false);
  });

  it("returns false when tokens do not match", async () => {
    mockCookieStore("abc123def456");
    const result = await verifyCsrfTokenFromBody("abc123def789");
    expect(result).toBe(false);
  });

  it("returns true when tokens match", async () => {
    const token = "valid-csrf-token-12345";
    mockCookieStore(token);
    const result = await verifyCsrfTokenFromBody(token);
    expect(result).toBe(true);
  });
});
