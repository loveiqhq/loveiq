import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/admin/stats/route";

// --- Helpers ---

function makeRequest(queryString = "") {
  return new Request(`http://localhost/api/admin/stats${queryString}`);
}

function mockAllQueriesOk() {
  // Q1: submissionsRes (with content-range header)
  mockSupabaseFetch.mockResolvedValueOnce({
    ok: true,
    headers: new Headers({ "content-range": "0-2/3" }),
    json: async () => [
      {
        id: 1,
        status: "completed",
        created_date_time: "2025-01-01T10:00:00Z",
        duration_ms: 120000,
        utm_tracker: "instagram",
      },
      {
        id: 2,
        status: "completed",
        created_date_time: "2025-01-02T14:00:00Z",
        duration_ms: 180000,
        utm_tracker: "instagram",
      },
      {
        id: 3,
        status: "flagged",
        created_date_time: "2025-01-02T16:00:00Z",
        duration_ms: null,
        utm_tracker: null,
      },
    ],
  });
  // Q2: behaviorRes (RPC response)
  mockSupabaseFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      dropOff: [
        { q_id: "q1", count: 2 },
        { q_id: "q2", count: 1 },
      ],
      avgTimePerQuestion: [
        { q_id: "00000", avg_ms: 94000 },
        { q_id: "q1", avg_ms: 45200 },
        { q_id: "q2", avg_ms: 12300 },
      ],
      funnel: { unique_sessions: 120, completed_sessions: 80, abandoned_sessions: 25 },
      chapterDropOff: [{ chapter: "Background & Lifestyle", count: 3 }],
      backtrackRate: { back_count: 50, forward_count: 800 },
      backtrackByQuestion: [
        { q_id: "00001", count: 5 },
        { q_id: "q3", count: 12 },
      ],
      chapterFunnel: [
        { chapter: "Intro", sessions: 100 },
        { chapter: "Background & Lifestyle", sessions: 85 },
      ],
    }),
  });
  // Q3: recentRes
  mockSupabaseFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => [
      { created_date_time: "2025-01-01T10:00:00Z" },
      { created_date_time: "2025-01-02T14:00:00Z" },
      { created_date_time: "2025-01-02T16:00:00Z" },
    ],
  });
  // Q4: waitlistRes
  mockSupabaseFetch.mockResolvedValueOnce({
    ok: true,
    headers: new Headers({ "content-range": "0-1/2" }),
    json: async () => [
      { id: 1, utm_tracker: "tiktok", created_date_time: "2025-01-01T12:00:00Z" },
      { id: 2, utm_tracker: null, created_date_time: "2025-01-02T09:00:00Z" },
    ],
  });
  // Q5: answersRes
  mockSupabaseFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => [
      {
        answer_text: "Germany",
        normalized_value: null,
        was_skipped: false,
        revision_count: null,
        survey_question: { frontend_qid: "15001", type: "single_choice" },
      },
      {
        answer_text: "Germany",
        normalized_value: null,
        was_skipped: false,
        revision_count: null,
        survey_question: { frontend_qid: "15001", type: "single_choice" },
      },
      {
        answer_text: "USA",
        normalized_value: null,
        was_skipped: false,
        revision_count: null,
        survey_question: { frontend_qid: "15001", type: "single_choice" },
      },
      {
        answer_text: null,
        normalized_value: 7,
        was_skipped: false,
        revision_count: 2,
        survey_question: { frontend_qid: "03001", type: "scale" },
      },
      {
        answer_text: null,
        normalized_value: 5,
        was_skipped: false,
        revision_count: 1,
        survey_question: { frontend_qid: "03001", type: "scale" },
      },
      {
        answer_text: null,
        normalized_value: null,
        was_skipped: true,
        revision_count: null,
        survey_question: { frontend_qid: "04001", type: "single_choice" },
      },
    ],
  });
  // Q6: scoringRes
  mockSupabaseFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => [
      { primary_archetype: "Spark Seeker" },
      { primary_archetype: "Spark Seeker" },
      { primary_archetype: "Romantic Idealist" },
    ],
  });
  // Q7: answerDistributionRes (RPC response)
  mockSupabaseFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      single: [
        { q_id: "04001", option_text: "Option A", count: 5 },
        { q_id: "04001", option_text: "Option B", count: 3 },
      ],
      multiple: [
        { q_id: "05001", option_text: "Tag X", count: 8 },
        { q_id: "05001", option_text: "Tag Y", count: 4 },
      ],
    }),
  });
}

// --- Tests ---

describe("GET /api/admin/stats", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue({ email: "admin@test.com", role: "admin" });
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
  });

  it("returns 401 when not authenticated", async () => {
    mockVerifyAdminSession.mockResolvedValue(null);

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 429 when rate-limited", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });

    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("returns 500 when any core Supabase query fails", async () => {
    mockSupabaseFetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error).toBe("Unable to load stats.");
  });

  it("returns stats object on success with all fields", async () => {
    mockAllQueriesOk();

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const json = await res.json();

    // Core stats
    expect(json.totalSubmissions).toBe(3);
    expect(json.completionRate).toBe(67);
    expect(json.avgDurationMs).toBe(150000);
    expect(json.statusBreakdown).toEqual({
      completed: 2,
      flagged: 1,
      archived: 0,
    });
    expect(json.todayCount).toBeTypeOf("number");
    expect(json.dropOff).toEqual([
      { qId: "q1", count: 2 },
      { qId: "q2", count: 1 },
    ]);
    expect(json.daily).toEqual([
      { date: "2025-01-01", count: 1 },
      { date: "2025-01-02", count: 2 },
    ]);
    expect(json.durationBuckets).toEqual({
      under5m: 2,
      fiveTo15m: 0,
      fifteenTo30m: 0,
      over30m: 0,
    });
    expect(json.utmSources).toEqual([
      { source: "instagram", count: 2 },
      { source: "Direct", count: 1 },
    ]);
    expect(json.hourly).toEqual([
      { hour: 10, count: 1 },
      { hour: 14, count: 1 },
      { hour: 16, count: 1 },
    ]);

    // Behavior analytics (from RPC) — intro fields filtered out
    expect(json.avgTimePerQuestion).toEqual([
      { qId: "q1", avgMs: 45200 },
      { qId: "q2", avgMs: 12300 },
    ]);
    expect(json.funnel).toEqual({
      uniqueSessions: 120,
      completedSessions: 80,
      abandonedSessions: 25,
    });
    expect(json.chapterDropOff).toEqual([{ chapter: "Background & Lifestyle", count: 3 }]);
    // backtrackRate: 50 / (50+800) = 5.88... → 6%
    expect(json.backtrackRate).toBe(6);
    // backtrackByQuestion: 00001 filtered out, only q3 remains
    expect(json.backtrackByQuestion).toEqual([{ qId: "q3", count: 12 }]);
    // chapterFunnel (new)
    expect(json.chapterFunnel).toEqual([
      { chapter: "Intro", sessions: 100 },
      { chapter: "Background & Lifestyle", sessions: 85 },
    ]);

    // Waitlist
    expect(json.waitlistTotal).toBe(2);
    expect(json.waitlistToday).toBeTypeOf("number");
    expect(json.waitlistDaily).toEqual([
      { date: "2025-01-01", count: 1 },
      { date: "2025-01-02", count: 1 },
    ]);
    expect(json.waitlistUtmSources).toEqual([
      { source: "tiktok", count: 1 },
      { source: "Direct", count: 1 },
    ]);
    // waitlistHourly (new)
    expect(json.waitlistHourly).toEqual([
      { hour: 9, count: 1 },
      { hour: 12, count: 1 },
    ]);

    // Answer insights
    expect(json.countryDistribution).toEqual([
      { country: "Germany", count: 2 },
      { country: "USA", count: 1 },
    ]);
    expect(json.scaleAvg).toEqual([{ qId: "03001", avg: 6 }]);
    expect(json.skipRate).toEqual([{ qId: "04001", skipped: 1, total: 1 }]);
    // revisionHotspots (new)
    expect(json.revisionHotspots).toEqual([{ qId: "03001", avgRevisions: 1.5, totalRevisions: 3 }]);

    // completionByUtm (new): instagram 2/2 = 100%, Direct 0/1 < min 2 → filtered
    expect(json.completionByUtm).toEqual([
      { source: "instagram", rate: 100, completed: 2, total: 2 },
    ]);

    // Scoring analytics
    expect(json.scoredCount).toBe(3);
    expect(json.archetypeDistribution).toEqual([
      { archetype: "Spark Seeker", count: 2 },
      { archetype: "Romantic Idealist", count: 1 },
    ]);

    // answerDistribution (new)
    expect(json.answerDistribution).toHaveLength(2);
    expect(json.answerDistribution[0].qId).toBe("05001");
    expect(json.answerDistribution[0].options).toEqual([
      { option: "Tag X", count: 8 },
      { option: "Tag Y", count: 4 },
    ]);
    expect(json.answerDistribution[1].qId).toBe("04001");
  });

  it("returns 0% completion rate and empty arrays when total is 0", async () => {
    // Q1: empty submissions
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "content-range": "*/0" }),
      json: async () => [],
    });
    // Q2: empty RPC
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        dropOff: [],
        avgTimePerQuestion: [],
        funnel: { unique_sessions: 0, completed_sessions: 0, abandoned_sessions: 0 },
        chapterDropOff: [],
        backtrackRate: { back_count: 0, forward_count: 0 },
        backtrackByQuestion: [],
        chapterFunnel: [],
      }),
    });
    // Q3: empty recent
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    // Q4: empty waitlist
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "content-range": "*/0" }),
      json: async () => [],
    });
    // Q5: empty answers
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    // Q6: empty scoring
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    // Q7: empty answer distribution
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ single: [], multiple: [] }),
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.totalSubmissions).toBe(0);
    expect(json.completionRate).toBe(0);
    expect(json.avgDurationMs).toBeNull();
    expect(json.statusBreakdown).toEqual({ completed: 0, flagged: 0, archived: 0 });
    expect(json.todayCount).toBe(0);
    expect(json.durationBuckets).toEqual({
      under5m: 0,
      fiveTo15m: 0,
      fifteenTo30m: 0,
      over30m: 0,
    });
    expect(json.utmSources).toEqual([]);
    expect(json.hourly).toEqual([]);

    // Behavior — empty
    expect(json.avgTimePerQuestion).toEqual([]);
    expect(json.funnel).toEqual({ uniqueSessions: 0, completedSessions: 0, abandonedSessions: 0 });
    expect(json.chapterDropOff).toEqual([]);
    expect(json.backtrackRate).toBe(0);
    expect(json.backtrackByQuestion).toEqual([]);
    expect(json.chapterFunnel).toEqual([]);

    // Waitlist — zero
    expect(json.waitlistTotal).toBe(0);
    expect(json.waitlistDaily).toEqual([]);
    expect(json.waitlistUtmSources).toEqual([]);
    expect(json.waitlistHourly).toEqual([]);

    // Answer insights — empty
    expect(json.countryDistribution).toEqual([]);
    expect(json.scaleAvg).toEqual([]);
    expect(json.skipRate).toEqual([]);
    expect(json.revisionHotspots).toEqual([]);

    // Completion by UTM — empty
    expect(json.completionByUtm).toEqual([]);

    // Scoring — empty
    expect(json.scoredCount).toBe(0);
    expect(json.archetypeDistribution).toEqual([]);

    // Answer distribution — empty
    expect(json.answerDistribution).toEqual([]);
  });

  it("returns partial data when Q4 (waitlist) fails", async () => {
    // Q1
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "content-range": "0-0/1" }),
      json: async () => [
        {
          id: 1,
          status: "completed",
          created_date_time: "2025-01-01T10:00:00Z",
          duration_ms: 60000,
          utm_tracker: null,
        },
      ],
    });
    // Q2: RPC
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        dropOff: [],
        avgTimePerQuestion: [],
        funnel: { unique_sessions: 1, completed_sessions: 1, abandoned_sessions: 0 },
        chapterDropOff: [],
        backtrackRate: { back_count: 0, forward_count: 10 },
        backtrackByQuestion: [],
        chapterFunnel: [],
      }),
    });
    // Q3
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ created_date_time: "2025-01-01T10:00:00Z" }],
    });
    // Q4: waitlist fails
    mockSupabaseFetch.mockRejectedValueOnce(new Error("Network error"));
    // Q5: answers ok
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    // Q6: scoring ok
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    // Q7: answer distribution ok
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ single: [], multiple: [] }),
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    // Core data still present
    expect(json.totalSubmissions).toBe(1);
    // Waitlist is null (failed gracefully)
    expect(json.waitlistTotal).toBeNull();
    expect(json.waitlistToday).toBeNull();
    expect(json.waitlistDaily).toBeNull();
    expect(json.waitlistUtmSources).toBeNull();
    expect(json.waitlistHourly).toBeNull();
    // Answers still present
    expect(json.countryDistribution).toEqual([]);
    expect(json.scaleAvg).toEqual([]);
    expect(json.skipRate).toEqual([]);
    expect(json.revisionHotspots).toEqual([]);
  });

  it("returns partial data when Q5 (answers) fails", async () => {
    // Q1
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "content-range": "0-0/1" }),
      json: async () => [
        {
          id: 1,
          status: "completed",
          created_date_time: "2025-01-01T10:00:00Z",
          duration_ms: 60000,
          utm_tracker: null,
        },
      ],
    });
    // Q2: RPC
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        dropOff: [],
        avgTimePerQuestion: [],
        funnel: { unique_sessions: 1, completed_sessions: 1, abandoned_sessions: 0 },
        chapterDropOff: [],
        backtrackRate: { back_count: 0, forward_count: 10 },
        backtrackByQuestion: [],
        chapterFunnel: [],
      }),
    });
    // Q3
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ created_date_time: "2025-01-01T10:00:00Z" }],
    });
    // Q4: waitlist ok
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "content-range": "0-0/1" }),
      json: async () => [{ id: 1, utm_tracker: null, created_date_time: "2025-01-01T12:00:00Z" }],
    });
    // Q5: answers fails
    mockSupabaseFetch.mockRejectedValueOnce(new Error("Timeout"));
    // Q6: scoring ok
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    // Q7: answer distribution ok
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ single: [], multiple: [] }),
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    // Core data present
    expect(json.totalSubmissions).toBe(1);
    // Waitlist present
    expect(json.waitlistTotal).toBe(1);
    expect(json.waitlistHourly).toEqual([{ hour: 12, count: 1 }]);
    // Answers are null (failed gracefully)
    expect(json.countryDistribution).toBeNull();
    expect(json.scaleAvg).toBeNull();
    expect(json.skipRate).toBeNull();
    expect(json.revisionHotspots).toBeNull();
  });

  it("accepts days=0 for all-time range", async () => {
    mockAllQueriesOk();

    const res = await GET(makeRequest("?days=0"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.totalSubmissions).toBe(3);
  });

  it("returns partial data when Q7 (answer distribution) fails", async () => {
    // Q1
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "content-range": "0-0/1" }),
      json: async () => [
        {
          id: 1,
          status: "completed",
          created_date_time: "2025-01-01T10:00:00Z",
          duration_ms: 60000,
          utm_tracker: null,
        },
      ],
    });
    // Q2: RPC
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        dropOff: [],
        avgTimePerQuestion: [],
        funnel: { unique_sessions: 1, completed_sessions: 1, abandoned_sessions: 0 },
        chapterDropOff: [],
        backtrackRate: { back_count: 0, forward_count: 10 },
        backtrackByQuestion: [],
        chapterFunnel: [],
      }),
    });
    // Q3
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ created_date_time: "2025-01-01T10:00:00Z" }],
    });
    // Q4: waitlist ok
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "content-range": "0-0/1" }),
      json: async () => [{ id: 1, utm_tracker: null, created_date_time: "2025-01-01T12:00:00Z" }],
    });
    // Q5: answers ok
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    // Q6: scoring ok
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    // Q7: answer distribution fails
    mockSupabaseFetch.mockRejectedValueOnce(new Error("RPC not found"));

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.totalSubmissions).toBe(1);
    // Answer distribution is null (failed gracefully)
    expect(json.answerDistribution).toBeNull();
    // Other data still present
    expect(json.countryDistribution).toEqual([]);
  });
});
