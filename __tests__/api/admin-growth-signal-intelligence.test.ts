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

const mockBuildGrowthSignalIntelligenceSnapshot = vi.fn();
vi.mock("../../lib/admin/growth-signal-intelligence", async () => {
  const actual = await vi.importActual<typeof import("../../lib/admin/growth-signal-intelligence")>(
    "../../lib/admin/growth-signal-intelligence"
  );
  return {
    ...actual,
    buildGrowthSignalIntelligenceSnapshot: (...args: unknown[]) =>
      mockBuildGrowthSignalIntelligenceSnapshot(...args),
  };
});

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "../../app/api/admin/growth-signal-intelligence/route";

describe("GET /api/admin/growth-signal-intelligence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: new Date() });
  });

  it("returns 401 when unauthenticated", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/growth-signal-intelligence"));
    expect(res.status).toBe(401);
  });

  it("returns growth signal intelligence snapshot", async () => {
    mockBuildGrowthSignalIntelligenceSnapshot.mockResolvedValue({
      generatedAt: "2026-04-01T12:00:00.000Z",
      days: 30,
      surface: "growth",
      title: "Growth Signal Intelligence",
      headline: "Headline",
      summary: "Summary",
      prompts: [],
      sections: [],
    });

    const res = await GET(
      new Request("http://localhost/api/admin/growth-signal-intelligence?surface=research&days=45")
    );
    expect(res.status).toBe(200);
    expect(mockBuildGrowthSignalIntelligenceSnapshot).toHaveBeenCalledWith("research", 45);
  });
});
