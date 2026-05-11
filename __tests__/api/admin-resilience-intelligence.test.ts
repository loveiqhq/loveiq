import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
vi.mock("../../lib/admin/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("../../lib/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockBuildResilienceIntelligenceSnapshot = vi.fn();
vi.mock("../../lib/admin/resilience-intelligence", async () => {
  const actual = await vi.importActual<typeof import("../../lib/admin/resilience-intelligence")>(
    "../../lib/admin/resilience-intelligence"
  );
  return {
    ...actual,
    buildResilienceIntelligenceSnapshot: (...args: unknown[]) =>
      mockBuildResilienceIntelligenceSnapshot(...args),
  };
});

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "../../app/api/admin/resilience-intelligence/route";

describe("GET /api/admin/resilience-intelligence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: new Date() });
  });

  it("returns 401 when unauthenticated", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/resilience-intelligence"));
    expect(res.status).toBe(401);
  });

  it("returns the resilience intelligence snapshot", async () => {
    mockBuildResilienceIntelligenceSnapshot.mockResolvedValue({
      generatedAt: "2026-04-01T12:00:00.000Z",
      days: 30,
      surface: "growth",
      title: "Growth Resilience Intelligence",
      headline: "Headline",
      summary: "Summary",
      prompts: [],
      sections: [],
    });

    const res = await GET(
      new Request("http://localhost/api/admin/resilience-intelligence?surface=health&days=45")
    );
    expect(res.status).toBe(200);
    expect(mockBuildResilienceIntelligenceSnapshot).toHaveBeenCalledWith(
      "health",
      45,
      "admin@test.com"
    );
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(new Request("http://localhost/api/admin/resilience-intelligence"));
    expect(res.status).toBe(429);
    expect(mockBuildResilienceIntelligenceSnapshot).not.toHaveBeenCalled();
  });
});
