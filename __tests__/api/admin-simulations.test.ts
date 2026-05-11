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

const mockBuildAdminSimulationSnapshot = vi.fn();
vi.mock("../../lib/admin/simulations", async () => {
  const actual = await vi.importActual<typeof import("../../lib/admin/simulations")>(
    "../../lib/admin/simulations"
  );
  return {
    ...actual,
    buildAdminSimulationSnapshot: (...args: unknown[]) => mockBuildAdminSimulationSnapshot(...args),
  };
});

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "../../app/api/admin/simulations/route";

describe("GET /api/admin/simulations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: new Date() });
  });

  it("returns simulations", async () => {
    mockBuildAdminSimulationSnapshot.mockResolvedValue({
      generatedAt: "2026-04-01T12:00:00.000Z",
      surface: "growth",
      days: 30,
      headline: "Scenarios",
      scenarios: [],
    });

    const res = await GET(
      new Request("http://localhost/api/admin/simulations?surface=growth&days=30")
    );
    expect(res.status).toBe(200);
    expect(mockBuildAdminSimulationSnapshot).toHaveBeenCalledWith("growth", 30, "admin@test.com");
  });

  it("returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/simulations"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(new Request("http://localhost/api/admin/simulations"));
    expect(res.status).toBe(429);
    expect(mockBuildAdminSimulationSnapshot).not.toHaveBeenCalled();
  });
});
