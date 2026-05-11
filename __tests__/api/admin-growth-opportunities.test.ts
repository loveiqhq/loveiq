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

const mockBuildGrowthOpportunitySnapshot = vi.fn();
vi.mock("../../lib/admin/growth-opportunities", async () => {
  const actual = await vi.importActual<typeof import("../../lib/admin/growth-opportunities")>(
    "../../lib/admin/growth-opportunities"
  );
  return {
    ...actual,
    buildGrowthOpportunitySnapshot: (...args: unknown[]) =>
      mockBuildGrowthOpportunitySnapshot(...args),
  };
});

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "../../app/api/admin/growth-opportunities/route";

describe("GET /api/admin/growth-opportunities", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: new Date() });
  });

  it("returns 401 when unauthenticated", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/growth-opportunities"));
    expect(res.status).toBe(401);
  });

  it("returns the growth opportunity snapshot", async () => {
    mockBuildGrowthOpportunitySnapshot.mockResolvedValue({
      generatedAt: "2026-04-01T12:00:00.000Z",
      days: 30,
      surface: "growth",
      title: "Growth Opportunity Intelligence",
      headline: "Headline",
      summary: "Summary",
      prompts: [],
      sections: [],
    });

    const res = await GET(new Request("http://localhost/api/admin/growth-opportunities?days=45"));
    expect(res.status).toBe(200);
    expect(mockBuildGrowthOpportunitySnapshot).toHaveBeenCalledWith(45, "admin@test.com");
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(new Request("http://localhost/api/admin/growth-opportunities"));
    expect(res.status).toBe(429);
    expect(mockBuildGrowthOpportunitySnapshot).not.toHaveBeenCalled();
  });
});
