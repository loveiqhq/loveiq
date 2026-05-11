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

const mockBuildForecastSnapshot = vi.fn();
vi.mock("../../lib/admin/forecasting", () => ({
  buildForecastSnapshot: (...args: unknown[]) => mockBuildForecastSnapshot(...(args as [])),
}));

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "../../app/api/admin/predictions/route";

describe("GET /api/admin/predictions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 14, resetAt: new Date() });
  });

  it("returns forecasting payload", async () => {
    mockBuildForecastSnapshot.mockResolvedValue({
      days: 30,
      forecastHorizonDays: 30,
      generatedAt: "2026-03-30T12:00:00.000Z",
      modules: [{ key: "submissions", label: "Submission Volume" }],
      mixForecasts: [],
      insights: [],
    });

    const res = await GET(new Request("http://localhost/api/admin/predictions?days=30"));
    expect(res.status).toBe(200);
    expect(mockBuildForecastSnapshot).toHaveBeenCalledWith(30);

    const json = await res.json();
    expect(json.modules[0].key).toBe("submissions");
  });

  it("returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/predictions"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(new Request("http://localhost/api/admin/predictions"));
    expect(res.status).toBe(429);
    expect(mockBuildForecastSnapshot).not.toHaveBeenCalled();
  });
});
