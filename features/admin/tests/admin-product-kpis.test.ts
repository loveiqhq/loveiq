import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

import { GET } from "@/app/api/admin/product-kpis/route";

// --- Helpers ---

function makeRequest(params?: Record<string, string>) {
  const url = new URL("http://localhost/api/admin/product-kpis");
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  return new Request(url.toString());
}

function makeRpcResponse(questions: unknown[] = [], totalSessions = 100) {
  return new Response(JSON.stringify({ questions, totalSessions }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const sampleRpcQuestions = [
  {
    q_id: "00000",
    chapter: "Background & Lifestyle",
    reach_n: 100,
    dropoff_n: 5,
    avg_active_time_s: 3.5,
    backtrack_n: 0,
  },
  {
    q_id: "00001",
    chapter: "Background & Lifestyle",
    reach_n: 95,
    dropoff_n: 3,
    avg_active_time_s: 5.0,
    backtrack_n: 0,
  },
  {
    q_id: "01002",
    chapter: "Current Sexual Wellbeing & Pain Points",
    reach_n: 90,
    dropoff_n: 4,
    avg_active_time_s: 6.3,
    backtrack_n: 2,
  },
];

// --- Tests ---

describe("GET /api/admin/product-kpis", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
    mockSupabaseFetch.mockResolvedValue(makeRpcResponse(sampleRpcQuestions));
  });

  it("returns 401 when not authenticated", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.error).toBe("Unauthorized.");
  });

  it("returns 403 when role is insufficient", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "nobody@test.com", role: "none" });

    const res = await GET(makeRequest());
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.error).toBe("Forbidden.");
  });

  it("returns 429 when rate limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });

    const res = await GET(makeRequest());
    expect(res.status).toBe(429);

    const json = await res.json();
    expect(json.error).toBe("Please try again later.");
  });

  it("returns KPI data with all three datasets", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json).toHaveProperty("reportSections");
    expect(json).toHaveProperty("questions");
    expect(json).toHaveProperty("chapters");
    expect(Array.isArray(json.reportSections)).toBe(true);
    expect(Array.isArray(json.questions)).toBe(true);
    expect(Array.isArray(json.chapters)).toBe(true);
  });

  it("report sections remain static (32 items)", async () => {
    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.reportSections.length).toBe(32);
    expect(json.reportSections[0]).toMatchObject({
      index: 1,
      section: "Welcome",
      reachN: 5000,
    });
  });

  it("computes question KPIs from RPC data", async () => {
    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.questions.length).toBe(3);

    const q = json.questions[0];
    expect(q.qId).toBe("00000");
    expect(q.reachN).toBe(100);
    expect(q.dropoffN).toBe(5);
    expect(q.dropoffPct).toBe(5); // 5/100 * 100
    expect(q.reachPct).toBe(100); // 100/100 * 100
    expect(q.guidanceTooltipOpenN).toBeNull();
    expect(q.errorN).toBeNull();
  });

  it("computes friction index as z-score for questions", async () => {
    const res = await GET(makeRequest());
    const json = await res.json();

    const withFriction = json.questions.filter(
      (q: { frictionIndex: number | null }) => q.frictionIndex != null
    );
    expect(withFriction.length).toBeGreaterThan(0);

    // Z-scores should be finite numbers
    for (const q of withFriction) {
      expect(Number.isFinite(q.frictionIndex)).toBe(true);
    }
  });

  it("computes chapter KPIs from aggregated question data", async () => {
    const res = await GET(makeRequest());
    const json = await res.json();

    // Should have all chapters from survey-data.ts
    expect(json.chapters.length).toBeGreaterThan(0);

    // Chapter 15 should have data (2 questions from sample: 00000, 00001)
    const ch15 = json.chapters.find((c: { cId: string }) => c.cId === "15");
    expect(ch15).toBeDefined();
    expect(ch15.entryN).toBe(100); // first question's reach
    expect(ch15.lastReachN).toBe(95); // last question's reach
    expect(ch15.numQsIys).toBe(2);
  });

  it("chapters without behavior data have null fields", async () => {
    const res = await GET(makeRequest());
    const json = await res.json();

    // Chapters with no matching questions should have null
    const ch4 = json.chapters.find((c: { cId: string }) => c.cId === "4");
    if (ch4) {
      expect(ch4.entryN).toBeNull();
      expect(ch4.completionPct).toBeNull();
      expect(ch4.frictionIndex).toBeNull();
    }
  });

  it("passes days param to RPC", async () => {
    await GET(makeRequest({ days: "30" }));

    expect(mockSupabaseFetch).toHaveBeenCalledWith(
      "/rest/v1/rpc/get_product_kpis",
      expect.objectContaining({
        method: "POST",
      })
    );

    // Verify since_ts is not null when days > 0
    const call = mockSupabaseFetch.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.since_ts).not.toBeNull();
  });

  it("returns 500 when RPC fails", async () => {
    mockSupabaseFetch.mockResolvedValue(new Response("", { status: 500 }));

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error).toBe("Unable to load KPI data.");
  });

  it("handles empty RPC results gracefully", async () => {
    mockSupabaseFetch.mockResolvedValue(makeRpcResponse([], 0));

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.questions).toEqual([]);
    // Chapters should still exist but with null data
    expect(json.chapters.length).toBeGreaterThan(0);
    expect(json.chapters.every((c: { entryN: unknown }) => c.entryN === null)).toBe(true);
  });

  it("allows viewer role access", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "viewer@test.com", role: "viewer" });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });
});
