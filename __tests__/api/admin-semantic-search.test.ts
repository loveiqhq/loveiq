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

const mockSupabaseFetch = vi.fn();
vi.mock("../../lib/admin/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

const mockBuildAllAdminKnowledgeArtifacts = vi.fn();
vi.mock("../../lib/admin/knowledge", async () => {
  const actual = await vi.importActual<typeof import("../../lib/admin/knowledge")>(
    "../../lib/admin/knowledge"
  );
  return {
    ...actual,
    buildAllAdminKnowledgeArtifacts: (...args: unknown[]) =>
      mockBuildAllAdminKnowledgeArtifacts(...args),
  };
});

const mockBuildAllAdminIntelligenceEntries = vi.fn();
vi.mock("../../lib/admin/intelligence", async () => {
  const actual = await vi.importActual<typeof import("../../lib/admin/intelligence")>(
    "../../lib/admin/intelligence"
  );
  return {
    ...actual,
    buildAllAdminIntelligenceEntries: (...args: unknown[]) =>
      mockBuildAllAdminIntelligenceEntries(...args),
  };
});

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "../../app/api/admin/search/semantic/route";

describe("GET /api/admin/search/semantic", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 19, resetAt: new Date() });
    mockSupabaseFetch.mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    mockBuildAllAdminKnowledgeArtifacts.mockResolvedValue([
      {
        id: "knowledge-1",
        type: "decision-graph",
        title: "Decision graph artifact",
        summary: "Decision memory graph for growth and strategy.",
        tone: "watch",
        confidence: "medium",
        href: "/admin/strategy",
        evidence: [{ label: "Metric", value: "conversion", href: "/admin/strategy" }],
      },
    ]);
    mockBuildAllAdminIntelligenceEntries.mockResolvedValue([
      {
        surface: "growth",
        sectionKey: "drivers",
        sectionTitle: "Driver Decomposition",
        item: {
          id: "item-1",
          title: "Growth driver signal",
          detail: "Paid traffic quality is slipping.",
          tone: "risk",
          confidence: "high",
          capabilities: ["driver decomposition"],
          recommendation: "Rebalance channel mix.",
          caveat: null,
          href: "/admin/growth",
          evidence: [{ label: "Channel", value: "paid-search", href: "/admin/growth" }],
          draft: null,
        },
      },
    ]);
  });

  it("returns knowledge and intelligence matches", async () => {
    const res = await GET(
      new Request("http://localhost/api/admin/search/semantic?q=growth&limit=10")
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: Array<{ type: string; title: string; meta: string }>;
    };
    expect(body.results.some((result) => result.type === "knowledge")).toBe(true);
    expect(body.results.some((result) => result.type === "intelligence")).toBe(true);
  });

  it("returns empty semantic results for short queries", async () => {
    const res = await GET(new Request("http://localhost/api/admin/search/semantic?q=a"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: unknown[] };
    expect(body.results).toEqual([]);
  });

  it("returns 401 without admin session", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/search/semantic?q=growth"));
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const res = await GET(new Request("http://localhost/api/admin/search/semantic?q=growth"));
    expect(res.status).toBe(429);
    expect(mockBuildAllAdminKnowledgeArtifacts).not.toHaveBeenCalled();
  });
});
