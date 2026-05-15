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

const mockBuildTechIntelligenceSnapshot = vi.fn();
vi.mock("@features/admin/server/tech-intelligence", async () => {
  const actual = await vi.importActual<typeof import("@features/admin/server/tech-intelligence")>(
    "@features/admin/server/tech-intelligence"
  );
  return {
    ...actual,
    buildTechIntelligenceSnapshot: (...args: unknown[]) =>
      mockBuildTechIntelligenceSnapshot(...args),
  };
});

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/admin/tech-intelligence/route";

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

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(new Request("http://localhost/api/admin/tech-intelligence"));
    expect(res.status).toBe(429);
    expect(mockBuildTechIntelligenceSnapshot).not.toHaveBeenCalled();
  });
});
