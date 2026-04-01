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

const mockBuildLifecycleIntelligenceSnapshot = vi.fn();
vi.mock("../../lib/admin/lifecycle-intelligence", async () => {
  const actual = await vi.importActual<typeof import("../../lib/admin/lifecycle-intelligence")>(
    "../../lib/admin/lifecycle-intelligence"
  );
  return {
    ...actual,
    buildLifecycleIntelligenceSnapshot: (...args: unknown[]) =>
      mockBuildLifecycleIntelligenceSnapshot(...args),
  };
});

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "../../app/api/admin/lifecycle-intelligence/route";

describe("GET /api/admin/lifecycle-intelligence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: new Date() });
  });

  it("returns 401 when unauthenticated", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/lifecycle-intelligence"));
    expect(res.status).toBe(401);
  });

  it("returns lifecycle intelligence snapshot", async () => {
    mockBuildLifecycleIntelligenceSnapshot.mockResolvedValue({
      generatedAt: "2026-04-01T12:00:00.000Z",
      days: 30,
      surface: "growth",
      title: "Growth Lifecycle Intelligence",
      headline: "Headline",
      summary: "Summary",
      prompts: [],
      sections: [],
    });

    const res = await GET(
      new Request("http://localhost/api/admin/lifecycle-intelligence?surface=research&days=45")
    );
    expect(res.status).toBe(200);
    expect(mockBuildLifecycleIntelligenceSnapshot).toHaveBeenCalledWith("research", 45);
  });
});
