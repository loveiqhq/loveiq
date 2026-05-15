import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockBuildResearchIntelligenceSnapshot = vi.fn();
vi.mock("@features/admin/server/research-intelligence", async () => {
  const actual = await vi.importActual<
    typeof import("@features/admin/server/research-intelligence")
  >("@features/admin/server/research-intelligence");
  return {
    ...actual,
    buildResearchIntelligenceSnapshot: (...args: unknown[]) =>
      mockBuildResearchIntelligenceSnapshot(...args),
  };
});

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/admin/research-intelligence/route";

describe("GET /api/admin/research-intelligence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 14, resetAt: new Date() });
  });

  it("returns the snapshot with no-store caching", async () => {
    mockBuildResearchIntelligenceSnapshot.mockResolvedValue({
      generatedAt: "2026-04-05T12:00:00.000Z",
      days: 30,
      summary: {
        signals: 0,
        themes: 0,
        painQuestions: 0,
        emergingTerms: 0,
        archetypeShifts: 0,
        responses: 0,
        contradictions: 0,
        wordingAlerts: 0,
        lowQualityQuestions: 0,
        synthesisPackages: 0,
        unknownUnknowns: 0,
      },
      signals: [],
      themes: [],
      painQuestions: [],
      emergingTerms: [],
      archetypeDrift: [],
      contradictions: [],
      wordingDiagnostics: [],
      answerQuality: {
        summary: {
          lowInfoResponses: 0,
          fillerResponses: 0,
          duplicatedResponses: 0,
          strongResponses: 0,
        },
        questions: [],
      },
      synthesisPackages: [],
      unknownUnknowns: [],
    });

    const res = await GET(new Request("http://localhost/api/admin/research-intelligence?days=45"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    expect(mockBuildResearchIntelligenceSnapshot).toHaveBeenCalledWith(45);
  });

  it("returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/research-intelligence"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(new Request("http://localhost/api/admin/research-intelligence"));
    expect(res.status).toBe(429);
    expect(mockBuildResearchIntelligenceSnapshot).not.toHaveBeenCalled();
  });
});
