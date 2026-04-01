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

const mockBuildAdminCommandAnswer = vi.fn();
vi.mock("../../lib/admin/intelligence", async () => {
  const actual = await vi.importActual<typeof import("../../lib/admin/intelligence")>(
    "../../lib/admin/intelligence"
  );
  return {
    ...actual,
    buildAdminCommandAnswer: (...args: unknown[]) => mockBuildAdminCommandAnswer(...args),
  };
});

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "../../app/api/admin/command/route";

describe("GET /api/admin/command", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: new Date() });
  });

  it("returns 400 without a query", async () => {
    const res = await GET(new Request("http://localhost/api/admin/command"));
    expect(res.status).toBe(400);
  });

  it("returns a command answer", async () => {
    mockBuildAdminCommandAnswer.mockResolvedValue({
      generatedAt: "2026-04-01T12:00:00.000Z",
      surface: "command-center",
      query: "what matters now",
      answer: "Top answer",
      confidence: "high",
      supportingItems: [],
      citations: [],
      suggestedPrompts: [],
    });

    const res = await GET(
      new Request(
        "http://localhost/api/admin/command?q=what%20matters%20now&surface=command-center&days=30"
      )
    );
    expect(res.status).toBe(200);
    expect(mockBuildAdminCommandAnswer).toHaveBeenCalledWith(
      "what matters now",
      "command-center",
      30,
      "admin@test.com"
    );
  });
});
