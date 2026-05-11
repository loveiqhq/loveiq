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

const mockBuildExperimentStrategySnapshot = vi.fn();
vi.mock("../../lib/admin/experiment-strategy", async () => {
  const actual = await vi.importActual<typeof import("../../lib/admin/experiment-strategy")>(
    "../../lib/admin/experiment-strategy"
  );
  return {
    ...actual,
    buildExperimentStrategySnapshot: (...args: unknown[]) =>
      mockBuildExperimentStrategySnapshot(...args),
  };
});

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "../../app/api/admin/experiment-strategy/route";

describe("GET /api/admin/experiment-strategy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: new Date() });
  });

  it("returns 401 when unauthenticated", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/experiment-strategy"));
    expect(res.status).toBe(401);
  });

  it("returns the experiment strategy snapshot", async () => {
    mockBuildExperimentStrategySnapshot.mockResolvedValue({
      generatedAt: "2026-04-01T12:00:00.000Z",
      days: 30,
      surface: "experiments",
      title: "Experiment Strategy Intelligence",
      headline: "Headline",
      summary: "Summary",
      prompts: [],
      sections: [],
    });

    const res = await GET(new Request("http://localhost/api/admin/experiment-strategy?days=45"));
    expect(res.status).toBe(200);
    expect(mockBuildExperimentStrategySnapshot).toHaveBeenCalledWith(45, "admin@test.com");
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(new Request("http://localhost/api/admin/experiment-strategy"));
    expect(res.status).toBe(429);
    expect(mockBuildExperimentStrategySnapshot).not.toHaveBeenCalled();
  });
});
