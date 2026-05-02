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

const mockBuildAdminPathIntelligenceSnapshot = vi.fn();
vi.mock("../../lib/admin/path-intelligence", async () => {
  const actual = await vi.importActual<typeof import("../../lib/admin/path-intelligence")>(
    "../../lib/admin/path-intelligence"
  );
  return {
    ...actual,
    buildAdminPathIntelligenceSnapshot: (...args: unknown[]) =>
      mockBuildAdminPathIntelligenceSnapshot(...args),
  };
});

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "../../app/api/admin/path-intelligence/route";

describe("GET /api/admin/path-intelligence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: new Date() });
  });

  it("returns 401 when unauthenticated", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/path-intelligence"));
    expect(res.status).toBe(401);
  });

  it("returns the path-intelligence snapshot", async () => {
    mockBuildAdminPathIntelligenceSnapshot.mockResolvedValue({
      generatedAt: "2026-04-01T12:00:00.000Z",
      days: 30,
      surface: "growth",
      title: "Growth Path Intelligence",
      headline: "Headline",
      summary: "Summary",
      prompts: [],
      sections: [],
    });

    const res = await GET(
      new Request("http://localhost/api/admin/path-intelligence?surface=growth&days=45")
    );
    expect(res.status).toBe(200);
    expect(mockBuildAdminPathIntelligenceSnapshot).toHaveBeenCalledWith(
      "growth",
      45,
      "admin@test.com"
    );
  });
});
