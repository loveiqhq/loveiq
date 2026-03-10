import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockVerifyAdminSession = vi.fn<() => Promise<boolean>>();
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

import { GET } from "../../app/api/admin/export/route";

// --- Helpers ---

function makeRequest(queryString = "") {
  return new Request(`http://localhost/api/admin/export${queryString}`);
}

// --- Tests ---

describe("GET /api/admin/export", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue(true);
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 4, resetAt: new Date() });
  });

  it("returns 401 when not authenticated", async () => {
    mockVerifyAdminSession.mockResolvedValue(false);

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 500 when Supabase query fails", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const res = await GET(makeRequest());
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error).toBe("Unable to export.");
  });

  it("returns CSV with correct headers for empty data", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");

    const csv = await res.text();
    expect(csv).toContain(
      "id,email,first_name,status,started_at,completed_at,duration_sec,primary_archetype,engine_version"
    );
  });

  it("returns CSV with submission data and answers", async () => {
    // First call: submissions
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 1,
          status: "completed",
          start_date_time: "2025-01-01T00:00:00Z",
          created_date_time: "2025-01-01T00:05:00Z",
          duration_ms: 60000,
          app_user: { email: "alice@test.com", first_name: "Alice" },
        },
      ],
    });
    // Second call: scoring results
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          survey_submission_id: 1,
          primary_archetype: "Spark Seeker",
          percentages: { "Spark Seeker": 15.2, "Romantic Idealist": 12.1 },
          engine_version: "v3",
        },
      ],
    });
    // Third call: answers
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          survey_submission_id: 1,
          answer_text: "Hello world",
          answer_option_id: null,
          normalized_value: null,
          survey_question: { frontend_qid: "q1", type: "open" },
          answer_option: null,
          survey_submission_answer_options: [],
        },
      ],
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const csv = await res.text();
    const lines = csv.split("\n");

    // Header row should include scoring and answer columns
    expect(lines[0]).toContain("primary_archetype");
    expect(lines[0]).toContain("engine_version");
    expect(lines[0]).toContain("pct_Spark Seeker");
    expect(lines[0]).toContain("q1");
    // Data row should include scoring and answer data
    expect(lines[1]).toContain("Spark Seeker");
    expect(lines[1]).toContain("v3");
    expect(lines[1]).toContain("Hello world");
    expect(lines[1]).toContain("alice@test.com");
  });

  it("escapes CSV values with commas and quotes", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 2,
          status: "completed",
          start_date_time: "2025-01-01T00:00:00Z",
          created_date_time: "2025-01-01T00:05:00Z",
          duration_ms: 120000,
          app_user: { email: "bob@test.com", first_name: "O'Brien, Bob" },
        },
      ],
    });
    // Scoring results
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });
    // Answers with comma in text
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          survey_submission_id: 2,
          answer_text: 'She said "hello, world"',
          answer_option_id: null,
          normalized_value: null,
          survey_question: { frontend_qid: "q1", type: "open" },
          answer_option: null,
          survey_submission_answer_options: [],
        },
      ],
    });

    const res = await GET(makeRequest());
    const csv = await res.text();

    // Name with comma should be quoted
    expect(csv).toContain('"O\'Brien, Bob"');
    // Answer with quotes and comma should be escaped
    expect(csv).toContain('"She said ""hello, world"""');
  });

  it("sets Content-Disposition with date-stamped filename", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const res = await GET(makeRequest());
    const disposition = res.headers.get("Content-Disposition") || "";
    expect(disposition).toMatch(/filename="loveiq-submissions-\d{4}-\d{2}-\d{2}\.csv"/);
  });

  it("CSV output matches snapshot (with data)", async () => {
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));

    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 1,
          status: "completed",
          start_date_time: "2025-06-15T10:00:00Z",
          created_date_time: "2025-06-15T10:05:00Z",
          duration_ms: 300000,
          app_user: { email: "test@example.com", first_name: "Test" },
        },
      ],
    });
    // Scoring results
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          survey_submission_id: 1,
          primary_archetype: "Spark Seeker",
          percentages: { "Spark Seeker": 15.2 },
          engine_version: "v3",
        },
      ],
    });
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          survey_submission_id: 1,
          answer_text: "Sample answer",
          answer_option_id: null,
          normalized_value: null,
          survey_question: { frontend_qid: "q1", type: "open" },
          answer_option: null,
          survey_submission_answer_options: [],
        },
      ],
    });

    const res = await GET(makeRequest());
    const csv = await res.text();
    expect(csv).toMatchSnapshot();

    vi.useRealTimers();
  });

  it("CSV output matches snapshot (empty data)", async () => {
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));

    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const res = await GET(makeRequest());
    const csv = await res.text();
    expect(csv).toMatchSnapshot();

    vi.useRealTimers();
  });
});
