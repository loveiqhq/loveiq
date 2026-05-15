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
vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/admin/submissions/route";

// --- Helpers ---

function makeRequest(queryString = "") {
  return new Request(`http://localhost/api/admin/submissions${queryString}`);
}

const sampleRows = [
  {
    id: 1,
    status: "completed",
    start_date_time: "2025-01-01T00:00:00Z",
    created_date_time: "2025-01-01T00:05:00Z",
    duration_ms: 60000,
    app_user: { email: "alice@test.com", first_name: "Alice" },
    scoring_result: {
      primary_archetype: "Spark Seeker",
      v5_primary_archetype: "Spark Seeker",
      percentages: { "Spark Seeker": 80, "Approval Seeker": 20 },
      v5_percentages: { "Spark Seeker": 81, "Approval Seeker": 19 },
    },
  },
  {
    id: 2,
    status: "completed",
    start_date_time: "2025-01-02T00:00:00Z",
    created_date_time: "2025-01-02T00:05:00Z",
    duration_ms: 90000,
    app_user: { email: "bob@test.com", first_name: "Bob" },
    scoring_result: null,
  },
];

function mockSubmissionsOk(rows = sampleRows, total = rows.length) {
  mockSupabaseFetch.mockResolvedValueOnce({
    ok: true,
    headers: new Headers({ "content-range": "0-0/0" }),
    json: async () => [],
  });
  mockSupabaseFetch.mockResolvedValueOnce({
    ok: true,
    headers: new Headers({ "content-range": `0-${rows.length - 1}/${total}` }),
    json: async () => rows,
  });
  mockSupabaseFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => [],
  });
}

// --- Tests ---

describe("GET /api/admin/submissions", () => {
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

  it("returns 429 when rate-limited (Supabase is never hit)", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });

    const res = await GET(makeRequest());
    expect(res.status).toBe(429);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("allows viewer role (read-only endpoint)", async () => {
    mockVerifyAdminSession.mockResolvedValue({ email: "viewer@test.com", role: "viewer" });
    mockSubmissionsOk();

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
  });

  it("returns 500 when Supabase query fails", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error).toBe("Unable to load submissions.");
  });

  it("returns submissions with pagination metadata", async () => {
    mockSubmissionsOk();

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.submissions).toHaveLength(2);
    expect(json.total).toBe(2);
    expect(json.page).toBe(1);
    expect(json.limit).toBe(20);
    expect(json.submissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 1,
          email: "alice@test.com",
          first_name: "Alice",
          primary_archetype: "Spark Seeker",
          priority_label: "low",
        }),
        expect.objectContaining({
          id: 2,
          primary_archetype: null,
        }),
      ])
    );
  });

  it("includes full-text search filter in PostgREST query with inner join", async () => {
    mockSubmissionsOk();

    const res = await GET(makeRequest("?q=alice"));
    expect(res.status).toBe(200);

    const queryUrl = mockSupabaseFetch.mock.calls[1][0] as string;
    expect(queryUrl).toContain("app_user!fk_survey_submission_user!inner");
    expect(queryUrl).toContain("app_user.or=(email.ilike.*alice*,first_name.ilike.*alice*)");
  });

  it("treats numeric q as id-only search (no app_user join filter)", async () => {
    mockSubmissionsOk();

    const res = await GET(makeRequest("?q=42"));
    expect(res.status).toBe(200);

    const queryUrl = mockSupabaseFetch.mock.calls[0][0] as string;
    expect(queryUrl).toContain("&id=eq.42");
    expect(queryUrl).not.toContain("app_user.or=");
  });

  it("accepts the legacy `email` param as an alias for `q`", async () => {
    mockSubmissionsOk();

    const res = await GET(makeRequest("?email=alice"));
    expect(res.status).toBe(200);

    const queryUrl = mockSupabaseFetch.mock.calls[1][0] as string;
    expect(queryUrl).toContain("app_user.or=(email.ilike.*alice*,first_name.ilike.*alice*)");
  });

  it("includes archetype filter in PostgREST query with inner join", async () => {
    mockSubmissionsOk();

    const res = await GET(makeRequest("?archetype=Spark%20Seeker"));
    expect(res.status).toBe(200);

    const queryUrl = mockSupabaseFetch.mock.calls.find(
      ([url]) => typeof url === "string" && url.includes("/rest/v1/survey_submission?select=")
    )?.[0] as string | undefined;

    expect(queryUrl).toBeDefined();
    expect(queryUrl).toContain("scoring_result!inner");
    expect(queryUrl).toContain("scoring_result.primary_archetype=eq.Spark%20Seeker");
  });

  it("defaults page to 1 and limit to 20", async () => {
    mockSubmissionsOk();

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.page).toBe(1);
    expect(json.limit).toBe(20);
  });

  it("clamps limit to max 100", async () => {
    mockSubmissionsOk();

    const res = await GET(makeRequest("?limit=999"));
    const json = await res.json();

    expect(json.limit).toBe(100);
  });

  it("flattens app_user join into top-level fields", async () => {
    mockSubmissionsOk([
      {
        id: 3,
        status: "completed",
        start_date_time: null,
        created_date_time: "2025-01-03T00:00:00Z",
        duration_ms: null,
        app_user: null,
        scoring_result: null,
      },
    ]);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.submissions[0].email).toBe("");
    expect(json.submissions[0].first_name).toBe("");
    expect(json.submissions[0].started_at).toBe("2025-01-03T00:00:00Z");
  });

  it("treats recent unscored completions as scoring pending instead of missing", async () => {
    mockSubmissionsOk([
      {
        id: 4,
        status: "completed",
        start_date_time: new Date(Date.now() - 60_000).toISOString(),
        created_date_time: new Date(Date.now() - 30_000).toISOString(),
        duration_ms: 45_000,
        app_user: { email: "pending@test.com", first_name: "Pending" },
        scoring_result: null,
      },
    ]);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.submissions[0].review_reasons).toContain("Scoring pending");
    expect(json.submissions[0].review_reasons).not.toContain("Missing scoring");
    expect(json.submissions[0].priority_label).toBe("low");
  });

  it("defaults sort to completed_at desc (latest received first, no priority-first JS sort)", async () => {
    mockSubmissionsOk();

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const partialQuery = mockSupabaseFetch.mock.calls[0][0] as string;
    const completedQuery = mockSupabaseFetch.mock.calls[1][0] as string;

    expect(partialQuery).toContain("order=saved_at.desc");
    expect(completedQuery).toContain("order=created_date_time.desc");

    // Lock the new behavior: pure date order, not the legacy priority-first JS sort.
    // id=2 has the newer created_date_time (2025-01-02) so it must come first.
    const json = await res.json();
    expect(json.submissions[0].id).toBe(2);
    expect(json.submissions[1].id).toBe(1);
  });

  it("sort=date_desc orders by created_date_time descending", async () => {
    mockSubmissionsOk();

    const res = await GET(makeRequest("?sort=date_desc"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.submissions[0].id).toBe(2);
    expect(json.submissions[1].id).toBe(1);

    const partialQuery = mockSupabaseFetch.mock.calls[0][0] as string;
    const completedQuery = mockSupabaseFetch.mock.calls[1][0] as string;
    expect(partialQuery).toContain("order=saved_at.desc");
    expect(completedQuery).toContain("order=created_date_time.desc");
  });

  it("sort=date_asc flips Supabase order and reverses results", async () => {
    mockSubmissionsOk();

    const res = await GET(makeRequest("?sort=date_asc"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.submissions[0].id).toBe(1);
    expect(json.submissions[1].id).toBe(2);

    const partialQuery = mockSupabaseFetch.mock.calls[0][0] as string;
    const completedQuery = mockSupabaseFetch.mock.calls[1][0] as string;
    expect(partialQuery).toContain("order=saved_at.asc");
    expect(completedQuery).toContain("order=created_date_time.asc");
  });

  it("ignores unknown sort values and falls back to completed_at desc", async () => {
    mockSubmissionsOk();

    const res = await GET(makeRequest("?sort=bogus"));
    expect(res.status).toBe(200);

    const completedQuery = mockSupabaseFetch.mock.calls[1][0] as string;
    expect(completedQuery).toContain("order=created_date_time.desc");
  });

  it("reads embedded scoring objects and exposes both archetype columns", async () => {
    mockSubmissionsOk([
      {
        id: 5,
        status: "completed",
        start_date_time: "2025-01-05T00:00:00Z",
        created_date_time: "2025-01-05T00:05:00Z",
        duration_ms: 60_000,
        app_user: { email: "charlie@test.com", first_name: "Charlie" },
        scoring_result: {
          primary_archetype: "Approval Seeker",
          v5_primary_archetype: "Sensual Connector",
          percentages: { "Approval Seeker": 55, "Sensual Connector": 45 },
          v5_percentages: { "Approval Seeker": 49, "Sensual Connector": 51 },
        },
      },
    ]);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.submissions[0]).toMatchObject({
      primary_archetype: "Approval Seeker",
      v5_primary_archetype: "Sensual Connector",
    });
    expect(json.submissions[0].review_reasons).toContain("V4 and V5 disagree");
  });
});
