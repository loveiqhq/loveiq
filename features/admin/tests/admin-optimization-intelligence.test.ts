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

const mockBuildOptimizationIntelligenceSnapshot = vi.fn();
vi.mock("@features/admin/server/optimization-intelligence", async () => {
  const actual = await vi.importActual<
    typeof import("@features/admin/server/optimization-intelligence")
  >("@features/admin/server/optimization-intelligence");
  return {
    ...actual,
    buildOptimizationIntelligenceSnapshot: (...args: unknown[]) =>
      mockBuildOptimizationIntelligenceSnapshot(...args),
  };
});

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/admin/optimization-intelligence/route";

describe("GET /api/admin/optimization-intelligence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: new Date() });
  });

  it("returns 401 when unauthenticated", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/optimization-intelligence"));
    expect(res.status).toBe(401);
  });

  it("returns the optimization intelligence snapshot", async () => {
    mockBuildOptimizationIntelligenceSnapshot.mockResolvedValue({
      generatedAt: "2026-04-01T12:00:00.000Z",
      days: 30,
      surface: "growth",
      title: "Growth Pricing Intelligence",
      headline: "Headline",
      summary: "Summary",
      prompts: [],
      sections: [],
    });

    const res = await GET(
      new Request("http://localhost/api/admin/optimization-intelligence?surface=research&days=45")
    );
    expect(res.status).toBe(200);
    expect(mockBuildOptimizationIntelligenceSnapshot).toHaveBeenCalledWith(
      "research",
      45,
      "admin@test.com"
    );
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(new Request("http://localhost/api/admin/optimization-intelligence"));
    expect(res.status).toBe(429);
    expect(mockBuildOptimizationIntelligenceSnapshot).not.toHaveBeenCalled();
  });
});
