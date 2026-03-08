import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

import { verifyAdminSession } from "../../../lib/admin/auth";
import { cookies } from "next/headers";

const mockedCookies = vi.mocked(cookies);

function mockCookieStore(cookieValue?: string) {
  mockedCookies.mockResolvedValue({
    get: vi.fn().mockReturnValue(cookieValue !== undefined ? { value: cookieValue } : undefined),
  } as never);
}

// SHA-256 of "test-password"
async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("verifyAdminSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ADMIN_PASSWORD;
  });

  it("returns false when ADMIN_PASSWORD is not set", async () => {
    mockCookieStore("some-value");
    const result = await verifyAdminSession();
    expect(result).toBe(false);
  });

  it("returns false when cookie is missing", async () => {
    process.env.ADMIN_PASSWORD = "test-password";
    mockCookieStore(undefined);
    const result = await verifyAdminSession();
    expect(result).toBe(false);
  });

  it("returns false when cookie does not match hash", async () => {
    process.env.ADMIN_PASSWORD = "test-password";
    mockCookieStore("wrong-hash");
    const result = await verifyAdminSession();
    expect(result).toBe(false);
  });

  it("returns true when cookie matches SHA-256 of password", async () => {
    const password = "test-password";
    process.env.ADMIN_PASSWORD = password;
    const hash = await sha256(password);
    mockCookieStore(hash);
    const result = await verifyAdminSession();
    expect(result).toBe(true);
  });
});
