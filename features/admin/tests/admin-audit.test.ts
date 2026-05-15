import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/admin/audit/route";

function makeRequest(url = "https://example.test/api/admin/audit"): Request {
  return new Request(url, { method: "GET" });
}

describe("admin audit log route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
  });

  it("returns 401 when no admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized." });
  });

  it("returns 403 when admin lacks 'admin' role", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "view@test.com", role: "viewer" });
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden." });
  });

  it("returns 429 when rate-limited", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("returns paginated entries with total count from Content-Range", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockSupabaseFetch.mockResolvedValue({
      ok: true,
      headers: { get: (k: string) => (k.toLowerCase() === "content-range" ? "0-1/247" : null) },
      json: async () => [
        {
          id: 1,
          admin_email: "admin@test.com",
          action: "update_changelog_entry",
          resource_type: "product_changelog",
          resource_id: "5",
          metadata: null,
          ip: "127.0.0.1",
          created_at: "2026-05-10T00:00:00.000Z",
        },
      ],
    });
    const res = await GET(makeRequest("https://example.test/api/admin/audit?page=1&limit=50"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(247);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(50);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].action).toBe("update_changelog_entry");
  });

  it("forwards filter params (admin, action, resourceType, dateFrom, dateTo) to Supabase query", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockSupabaseFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => "0-0/0" },
      json: async () => [],
    });
    await GET(
      makeRequest(
        "https://example.test/api/admin/audit?admin=alice%40test.com&action=delete_x&resourceType=submission&dateFrom=2026-01-01&dateTo=2026-12-31"
      )
    );
    const calledUrl = String(mockSupabaseFetch.mock.calls[0][0]);
    expect(calledUrl).toContain("admin_email=eq.alice%40test.com");
    expect(calledUrl).toContain("action=eq.delete_x");
    expect(calledUrl).toContain("resource_type=eq.submission");
    expect(calledUrl).toContain("created_at=gte.2026-01-01");
    expect(calledUrl).toContain("created_at=lte.2026-12-31");
  });

  it("returns 500 when Supabase responds with non-ok", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockSupabaseFetch.mockResolvedValue({
      ok: false,
      status: 503,
      headers: { get: () => null },
      json: async () => ({}),
    });
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Unable to process request." });
  });
});
