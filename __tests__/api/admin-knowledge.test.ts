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

const mockBuildAdminKnowledgeSnapshot = vi.fn();
vi.mock("../../lib/admin/knowledge", async () => {
  const actual = await vi.importActual<typeof import("../../lib/admin/knowledge")>(
    "../../lib/admin/knowledge"
  );
  return {
    ...actual,
    buildAdminKnowledgeSnapshot: (...args: unknown[]) => mockBuildAdminKnowledgeSnapshot(...args),
  };
});

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "../../app/api/admin/knowledge/route";

describe("GET /api/admin/knowledge", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: new Date() });
  });

  it("returns 401 when unauthenticated", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/knowledge"));
    expect(res.status).toBe(401);
  });

  it("returns knowledge artifacts", async () => {
    mockBuildAdminKnowledgeSnapshot.mockResolvedValue({
      generatedAt: "2026-04-01T12:00:00.000Z",
      surface: "command-center",
      days: 30,
      headline: "Knowledge",
      summary: "Summary",
      prompts: [],
      artifacts: [],
    });

    const res = await GET(
      new Request("http://localhost/api/admin/knowledge?surface=health&days=14&q=risk")
    );
    expect(res.status).toBe(200);
    expect(mockBuildAdminKnowledgeSnapshot).toHaveBeenCalledWith(
      "health",
      14,
      "admin@test.com",
      "risk"
    );
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(new Request("http://localhost/api/admin/knowledge"));
    expect(res.status).toBe(429);
    expect(mockBuildAdminKnowledgeSnapshot).not.toHaveBeenCalled();
  });
});
