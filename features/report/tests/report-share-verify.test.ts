import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockVerifyCsrf = vi.fn<() => Promise<boolean>>();
vi.mock("@/lib/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockVerifyCsrf(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
const mockGetClientIp = vi.fn();
vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: (...args: unknown[]) => mockGetClientIp(...args),
}));

const mockResolveShare = vi.fn();
vi.mock("@features/report/server/shareAccess", async () => {
  const actual = await vi.importActual<typeof import("@features/report/server/shareAccess")>(
    "@features/report/server/shareAccess"
  );
  return {
    ...actual,
    resolveShareFromToken: (...args: unknown[]) => mockResolveShare(...args),
  };
});

beforeAll(() => {
  process.env.SHARE_VERIFY_SECRET = "test-secret-with-enough-entropy-for-vitest";
});

import { POST } from "@/app/api/report/share/verify/route";

const VALID_SHARE_TOKEN = "rpts_abcdefghijklmnopqrst";

function postRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/report/share/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-csrf-token": "t" },
    body: JSON.stringify(body),
  });
}

function allowCsrf() {
  mockVerifyCsrf.mockResolvedValue(true);
}
function allowRateLimit() {
  mockCheckRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 9,
    resetAt: new Date(Date.now() + 60_000),
  });
}

describe("POST /api/report/share/verify", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetClientIp.mockReturnValue("1.2.3.4");
  });

  it("403 on CSRF failure", async () => {
    mockVerifyCsrf.mockResolvedValue(false);
    const res = await POST(postRequest({ shareToken: VALID_SHARE_TOKEN, email: "a@x.io" }));
    expect(res.status).toBe(403);
  });

  it("429 when rate-limit blocks", async () => {
    allowCsrf();
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 30_000),
    });
    const res = await POST(postRequest({ shareToken: VALID_SHARE_TOKEN, email: "a@x.io" }));
    expect(res.status).toBe(429);
  });

  it("400 on invalid share-token format", async () => {
    allowCsrf();
    allowRateLimit();
    const res = await POST(postRequest({ shareToken: "bogus", email: "a@x.io" }));
    expect(res.status).toBe(400);
  });

  it("400 on invalid email", async () => {
    allowCsrf();
    allowRateLimit();
    const res = await POST(postRequest({ shareToken: VALID_SHARE_TOKEN, email: "no-at" }));
    expect(res.status).toBe(400);
  });

  it("404 when share missing or revoked", async () => {
    allowCsrf();
    allowRateLimit();
    mockResolveShare.mockResolvedValue(null);
    const res = await POST(postRequest({ shareToken: VALID_SHARE_TOKEN, email: "a@x.io" }));
    expect(res.status).toBe(404);
  });

  it("404 when email mismatches share recipient (unified with missing-token shape to prevent token enumeration)", async () => {
    allowCsrf();
    allowRateLimit();
    mockResolveShare.mockResolvedValue({
      share: { id: 1, recipient_email: "owner@example.com" },
    });
    const res = await POST(postRequest({ shareToken: VALID_SHARE_TOKEN, email: "wrong@x.io" }));
    expect(res.status).toBe(404);
  });

  it("200 + Set-Cookie on email match (case-insensitive)", async () => {
    allowCsrf();
    allowRateLimit();
    mockResolveShare.mockResolvedValue({
      share: { id: 12, recipient_email: "marie@loveiq.org" },
    });
    const res = await POST(
      postRequest({ shareToken: VALID_SHARE_TOKEN, email: "Marie@LoveIQ.org" })
    );
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("Set-Cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Path=/");
  });
});
