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

const mockBuildTechIntelligenceSnapshot = vi.fn();
vi.mock("../../lib/admin/tech-intelligence", async () => {
  const actual = await vi.importActual<typeof import("../../lib/admin/tech-intelligence")>(
    "../../lib/admin/tech-intelligence"
  );
  return {
    ...actual,
    buildTechIntelligenceSnapshot: (...args: unknown[]) =>
      mockBuildTechIntelligenceSnapshot(...args),
  };
});

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "../../app/api/admin/tech-intelligence/route";

describe("GET /api/admin/tech-intelligence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: new Date() });
  });

  it("returns 401 when unauthenticated", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/tech-intelligence"));
    expect(res.status).toBe(401);
  });

  it("returns the tech intelligence snapshot", async () => {
    mockBuildTechIntelligenceSnapshot.mockResolvedValue({
      generatedAt: "2026-04-01T12:00:00.000Z",
      days: 30,
      surface: "health",
      title: "Tech Root-Cause Intelligence",
      headline: "Headline",
      summary: "Summary",
      prompts: [],
      sections: [],
    });

    const res = await GET(
      new Request("http://localhost/api/admin/tech-intelligence?surface=health&days=45")
    );
    expect(res.status).toBe(200);
    expect(mockBuildTechIntelligenceSnapshot).toHaveBeenCalledWith("health", 45, "admin@test.com");
  });
});
