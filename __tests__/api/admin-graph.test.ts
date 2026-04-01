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

const mockBuildAdminSignalGraphSnapshot = vi.fn();
vi.mock("../../lib/admin/graph", async () => {
  const actual =
    await vi.importActual<typeof import("../../lib/admin/graph")>("../../lib/admin/graph");
  return {
    ...actual,
    buildAdminSignalGraphSnapshot: (...args: unknown[]) =>
      mockBuildAdminSignalGraphSnapshot(...args),
  };
});

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "../../app/api/admin/graph/route";

describe("GET /api/admin/graph", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: new Date() });
  });

  it("returns the graph snapshot", async () => {
    mockBuildAdminSignalGraphSnapshot.mockResolvedValue({
      generatedAt: "2026-04-01T12:00:00.000Z",
      surface: "command-center",
      days: 30,
      headline: "Graph",
      nodes: [],
      edges: [],
      focusPaths: [],
    });

    const res = await GET(new Request("http://localhost/api/admin/graph?surface=strategy&days=21"));
    expect(res.status).toBe(200);
    expect(mockBuildAdminSignalGraphSnapshot).toHaveBeenCalledWith(
      "strategy",
      21,
      "admin@test.com"
    );
  });
});
