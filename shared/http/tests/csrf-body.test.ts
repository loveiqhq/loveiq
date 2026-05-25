import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

// Logger is mocked so we can assert that the storm counter is/isn't bumped
// (logCsrfFail is the only call site that writes the warn log). `vi.hoisted`
// lifts `warnMock` above the hoisted `vi.mock` factory so the reference is
// initialized before the factory runs.
const { warnMock } = vi.hoisted(() => ({ warnMock: vi.fn() }));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: warnMock, error: vi.fn() },
}));

vi.mock("@shared/http/ratelimit", () => ({
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

import { verifyCsrfHeaderOrBody, verifyCsrfTokenFromBody } from "@shared/http/csrf";
import { cookies } from "next/headers";

const mockedCookies = vi.mocked(cookies);

function mockCookieStore(cookieValue?: string) {
  mockedCookies.mockResolvedValue({
    get: vi.fn().mockReturnValue(cookieValue !== undefined ? { value: cookieValue } : undefined),
  } as never);
}

function makeRequest(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({}),
  });
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

describe("verifyCsrfHeaderOrBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when header matches cookie (header-present path)", async () => {
    const token = "valid-csrf-token-12345";
    mockCookieStore(token);
    const req = makeRequest({ "x-csrf-token": token });
    const result = await verifyCsrfHeaderOrBody(req, undefined);
    expect(result).toBe(true);
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("returns false and logs when header value is wrong (real attack signal)", async () => {
    mockCookieStore("expected-token-xyz");
    const req = makeRequest({ "x-csrf-token": "wrong-token-zzz123" });
    const result = await verifyCsrfHeaderOrBody(req, undefined);
    expect(result).toBe(false);
    // logCsrfFail fires — the storm counter SHOULD increment for this case.
    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({ csrf_fail: true }),
      expect.any(String)
    );
  });

  it("returns true via body fallback when header absent (beacon path)", async () => {
    const token = "valid-csrf-token-12345";
    mockCookieStore(token);
    const req = makeRequest(); // no x-csrf-token header
    const result = await verifyCsrfHeaderOrBody(req, token);
    expect(result).toBe(true);
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("returns false WITHOUT logging when header absent and body token is missing", async () => {
    mockCookieStore("some-cookie-value");
    const req = makeRequest();
    const result = await verifyCsrfHeaderOrBody(req, undefined);
    expect(result).toBe(false);
    // Critical: no log, no counter increment. This was the false-positive
    // path that triggered the CSRF-storm Slack alert.
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("returns false WITHOUT logging when header absent and body token is wrong", async () => {
    mockCookieStore("expected-token-xyz");
    const req = makeRequest();
    const result = await verifyCsrfHeaderOrBody(req, "wrong-token-zzz123");
    expect(result).toBe(false);
    expect(warnMock).not.toHaveBeenCalled();
  });
});
