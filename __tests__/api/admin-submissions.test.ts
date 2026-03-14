import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockVerifyAdminSession = vi.fn();
vi.mock("../../lib/admin/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));

const mockSupabaseFetch = vi.fn();
vi.mock("../../lib/admin/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("../../lib/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "../../app/api/admin/submissions/route";

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
    scoring_result: [{ primary_archetype: "Spark Seeker" }],
  },
  {
    id: 2,
    status: "completed",
    start_date_time: "2025-01-02T00:00:00Z",
    created_date_time: "2025-01-02T00:05:00Z",
    duration_ms: 90000,
    app_user: { email: "bob@test.com", first_name: "Bob" },
    scoring_result: [],
  },
];

function mockSubmissionsOk(rows = sampleRows, total = rows.length) {
  mockSupabaseFetch.mockResolvedValueOnce({
    ok: true,
    headers: new Headers({ "content-range": `0-${rows.length - 1}/${total}` }),
    json: async () => rows,
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
    expect(json.submissions[0]).toMatchObject({
      id: 1,
      email: "alice@test.com",
      first_name: "Alice",
      primary_archetype: "Spark Seeker",
    });
    expect(json.submissions[1].primary_archetype).toBeNull();
  });

  it("includes email filter in PostgREST query with inner join", async () => {
    mockSubmissionsOk();

    const res = await GET(makeRequest("?email=alice"));
    expect(res.status).toBe(200);

    const queryUrl = mockSupabaseFetch.mock.calls[0][0] as string;
    expect(queryUrl).toContain("app_user!fk_survey_submission_user!inner");
    expect(queryUrl).toContain("app_user.email=ilike.*alice*");
  });

  it("includes archetype filter in PostgREST query with inner join", async () => {
    mockSubmissionsOk();

    const res = await GET(makeRequest("?archetype=Spark%20Seeker"));
    expect(res.status).toBe(200);

    const queryUrl = mockSupabaseFetch.mock.calls[0][0] as string;
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
        scoring_result: [],
      },
    ]);

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(json.submissions[0].email).toBe("");
    expect(json.submissions[0].first_name).toBe("");
    expect(json.submissions[0].started_at).toBe("2025-01-03T00:00:00Z");
  });
});
