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

const mockBuildStrategySnapshot = vi.fn();
vi.mock("../../lib/admin/strategy", () => ({
  buildStrategySnapshot: (...args: unknown[]) => mockBuildStrategySnapshot(...(args as [])),
}));

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "../../app/api/admin/strategy/route";

function makeRequest(queryString = "") {
  return new Request(`http://localhost/api/admin/strategy${queryString}`);
}

describe("GET /api/admin/strategy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: new Date() });
  });

  it("returns 401 when not authenticated", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns the strategy snapshot payload", async () => {
    mockBuildStrategySnapshot.mockResolvedValue({
      days: 30,
      generatedAt: "2026-03-30T12:00:00.000Z",
      northStar: [],
      goals: [],
      benchmarks: [],
      workQueue: { summary: { openCases: 1 }, items: [] },
      releaseImpact: { entries: [], annotations: [] },
      opportunities: {
        backlog: [],
        funnelLeakage: [],
        archetypeMomentum: [],
        leaderboards: { channels: [], archetypes: [], workflow: [] },
      },
      narrative: ["All quiet."],
    });

    const res = await GET(makeRequest("?days=30"));
    expect(res.status).toBe(200);
    expect(mockBuildStrategySnapshot).toHaveBeenCalledWith(30);

    const json = await res.json();
    expect(json.narrative).toEqual(["All quiet."]);
    expect(json.workQueue.summary.openCases).toBe(1);
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
    expect(mockBuildStrategySnapshot).not.toHaveBeenCalled();
  });
});
