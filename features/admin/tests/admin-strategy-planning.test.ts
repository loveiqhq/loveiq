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

const mockVerifyCsrfToken = vi.fn();
vi.mock("@shared/http/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockVerifyCsrfToken(...(args as [])),
}));

vi.mock("@features/admin/server/audit", () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: 1 }] }),
}));

vi.mock("@features/admin/server/strategy-planning", () => ({
  buildStrategyPlanningSnapshot: vi.fn().mockResolvedValue({
    generatedAt: "2026-04-01T00:00:00.000Z",
    summary: {},
    initiatives: [],
    bets: [],
    competitiveWatch: [],
    dependencies: [],
    goals: [],
    metrics: [],
  }),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET, POST } from "@/app/api/admin/strategy-planning/route";

function makeRequest(body?: unknown, method: "GET" | "POST" = "GET"): Request {
  return new Request("http://localhost/api/admin/strategy-planning", {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

const validInitiative = {
  action: "create",
  resourceType: "initiative",
  title: "Bigger funnel test",
};

describe("admin strategy-planning route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
    mockVerifyCsrfToken.mockResolvedValue(true);
  });

  it("GET returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("GET returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
  });

  it("POST returns 403 for viewer role", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "v@test.com", role: "viewer" });
    const res = await POST(makeRequest(validInitiative, "POST"));
    expect(res.status).toBe(403);
  });

  it("POST returns 403 when CSRF invalid", async () => {
    mockVerifyCsrfToken.mockResolvedValue(false);
    const res = await POST(makeRequest(validInitiative, "POST"));
    expect(res.status).toBe(403);
  });

  it("POST returns 400 when resourceType is not in enum", async () => {
    const res = await POST(
      makeRequest({ action: "create", resourceType: "junk", title: "x" }, "POST")
    );
    expect(res.status).toBe(400);
  });

  it("POST returns 400 when bet hypothesis is missing", async () => {
    const res = await POST(
      makeRequest({ action: "create", resourceType: "bet", title: "Big bet" }, "POST")
    );
    expect(res.status).toBe(400);
  });

  it("POST returns 400 when competitive-watch move_type is invalid", async () => {
    const res = await POST(
      makeRequest(
        {
          action: "create",
          resourceType: "competitive-watch",
          competitor_name: "X",
          move_type: "telepathy",
          title: "t",
          detail: "d",
        },
        "POST"
      )
    );
    expect(res.status).toBe(400);
  });
});
