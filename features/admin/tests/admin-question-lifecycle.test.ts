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

const mockBuildQuestionLifecycleSnapshot = vi.fn();
vi.mock("@features/admin/server/question-effectiveness", () => ({
  buildQuestionLifecycleSnapshot: (...args: unknown[]) =>
    mockBuildQuestionLifecycleSnapshot(...(args as [])),
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/admin/question-lifecycle/route";

describe("GET /api/admin/question-lifecycle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
  });

  it("returns lifecycle snapshot payload", async () => {
    mockBuildQuestionLifecycleSnapshot.mockResolvedValue({
      days: 30,
      summary: { keep: 4, revise: 2, replace: 1, retire: 1, urgent: 2 },
      chapters: [],
      topCandidates: [],
      questions: [],
    });

    const res = await GET(new Request("http://localhost/api/admin/question-lifecycle?days=30"));
    expect(res.status).toBe(200);
    expect(mockBuildQuestionLifecycleSnapshot).toHaveBeenCalledWith(30);

    const json = await res.json();
    expect(json.summary.urgent).toBe(2);
  });

  it("returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/question-lifecycle"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(new Request("http://localhost/api/admin/question-lifecycle"));
    expect(res.status).toBe(429);
    expect(mockBuildQuestionLifecycleSnapshot).not.toHaveBeenCalled();
  });
});
