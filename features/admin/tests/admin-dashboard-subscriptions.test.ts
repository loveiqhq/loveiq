import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockVerifyCsrfToken = vi.fn();
vi.mock("@/lib/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockVerifyCsrfToken(...(args as [])),
}));

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

vi.mock("@features/admin/server/audit", () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@features/admin/server/dashboard-subscriptions", () => ({
  DASHBOARD_SUBSCRIPTION_OPTIONS: [
    { key: "executive-memo", label: "Executive Memo" },
    { key: "trust-radar", label: "Trust Radar" },
  ],
  fetchDashboardSubscriptions: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET, POST } from "@/app/api/admin/dashboard-subscriptions/route";

function makeRequest(body?: unknown, method: "GET" | "POST" = "GET"): Request {
  return new Request("https://example.test/api/admin/dashboard-subscriptions", {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("admin dashboard-subscriptions route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
    mockVerifyCsrfToken.mockResolvedValue(true);
  });

  it("GET returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("GET returns 429 when rate-limited", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "a@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("POST returns 403 when CSRF token invalid", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "a@test.com", role: "admin" });
    mockVerifyCsrfToken.mockResolvedValue(false);
    const res = await POST(
      makeRequest(
        {
          dashboard_key: "executive-memo",
          audience_role: "leadership",
          cadence: "weekly",
          subscriber_emails: ["v@test.com"],
        },
        "POST"
      )
    );
    expect(res.status).toBe(403);
  });

  it("POST returns 400 when audience_role not in enum", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "a@test.com", role: "admin" });
    const res = await POST(
      makeRequest(
        {
          dashboard_key: "executive-memo",
          audience_role: "INVALID_ROLE",
          cadence: "weekly",
          subscriber_emails: ["v@test.com"],
        },
        "POST"
      )
    );
    expect(res.status).toBe(400);
  });

  it("POST returns 400 when subscriber_emails empty", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "a@test.com", role: "admin" });
    const res = await POST(
      makeRequest(
        {
          dashboard_key: "executive-memo",
          audience_role: "leadership",
          cadence: "weekly",
          subscriber_emails: [],
        },
        "POST"
      )
    );
    expect(res.status).toBe(400);
  });

  it("POST returns 400 when cadence not in enum", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "a@test.com", role: "admin" });
    const res = await POST(
      makeRequest(
        {
          dashboard_key: "executive-memo",
          audience_role: "leadership",
          cadence: "EVERY_FORTNIGHT",
          subscriber_emails: ["v@test.com"],
        },
        "POST"
      )
    );
    expect(res.status).toBe(400);
  });
});
