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

const mockBuildStrategyIntelligenceSnapshot = vi.fn();
vi.mock("../../lib/admin/strategy-intelligence", async () => {
  const actual = await vi.importActual<typeof import("../../lib/admin/strategy-intelligence")>(
    "../../lib/admin/strategy-intelligence"
  );
  return {
    ...actual,
    buildStrategyIntelligenceSnapshot: (...args: unknown[]) =>
      mockBuildStrategyIntelligenceSnapshot(...args),
  };
});

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "../../app/api/admin/strategy-intelligence/route";

describe("GET /api/admin/strategy-intelligence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: new Date() });
  });

  it("returns 401 when unauthenticated", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/strategy-intelligence"));
    expect(res.status).toBe(401);
  });

  it("returns the strategy intelligence snapshot", async () => {
    mockBuildStrategyIntelligenceSnapshot.mockResolvedValue({
      generatedAt: "2026-04-01T12:00:00.000Z",
      days: 30,
      surface: "strategy",
      title: "Strategy Intelligence",
      headline: "Headline",
      summary: "Summary",
      prompts: [],
      sections: [],
    });

    const res = await GET(
      new Request("http://localhost/api/admin/strategy-intelligence?surface=strategy&days=45")
    );
    expect(res.status).toBe(200);
    expect(mockBuildStrategyIntelligenceSnapshot).toHaveBeenCalledWith("strategy", 45);
  });
});
