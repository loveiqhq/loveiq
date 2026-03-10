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

const mockVerifyCsrf = vi.fn<() => Promise<boolean>>();
vi.mock("../../lib/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockVerifyCsrf(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("../../lib/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("../../lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET, PATCH, DELETE } from "../../app/api/admin/submissions/[id]/route";

// --- Helpers ---

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeGetRequest(id: string) {
  return new Request(`http://localhost/api/admin/submissions/${id}`);
}

function makePatchRequest(id: string, body: unknown) {
  return new Request(`http://localhost/api/admin/submissions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string) {
  return new Request(`http://localhost/api/admin/submissions/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
}

const sampleSubmission = {
  id: 1,
  status: "completed",
  start_date_time: "2025-01-01T00:00:00Z",
  created_date_time: "2025-01-01T00:05:00Z",
  duration_ms: 300000,
  app_user: { email: "alice@test.com", first_name: "Alice" },
};

// --- Tests ---

describe("GET /api/admin/submissions/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue(true);
    mockVerifyCsrf.mockResolvedValue(true);
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
  });

  it("returns 401 when not authenticated", async () => {
    mockVerifyAdminSession.mockResolvedValue(false);

    const res = await GET(makeGetRequest("1"), makeParams("1"));
    expect(res.status).toBe(401);
  });

  it("returns 400 for non-numeric ID", async () => {
    const res = await GET(makeGetRequest("abc"), makeParams("abc"));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("Invalid ID.");
  });

  it("returns 404 when submission is not found", async () => {
    mockSupabaseFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    const res = await GET(makeGetRequest("999"), makeParams("999"));
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.error).toBe("Not found.");
  });

  it("returns 500 when Supabase query fails", async () => {
    mockSupabaseFetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    const res = await GET(makeGetRequest("1"), makeParams("1"));
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error).toBe("Unable to load submission.");
  });

  it("returns submission and answers on success", async () => {
    mockSupabaseFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [sampleSubmission] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    const res = await GET(makeGetRequest("1"), makeParams("1"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.submission).toMatchObject({
      id: 1,
      email: "alice@test.com",
      first_name: "Alice",
      status: "completed",
    });
    expect(json.answers).toEqual([]);
    expect(json.scoring).toBeNull();
  });

  it("returns scoring result when available", async () => {
    const sampleScoring = {
      primary_archetype: "Spark Seeker",
      percentages: { "Spark Seeker": 15.2, "Sensual Connector": 12.1 },
      raw_scores: { "Spark Seeker": 22.5, "Sensual Connector": 20.1 },
      engine_version: "v3",
      scored_at: "2025-01-01T00:05:00Z",
    };

    mockSupabaseFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [sampleSubmission] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [sampleScoring] });

    const res = await GET(makeGetRequest("1"), makeParams("1"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.scoring).toMatchObject({
      primary_archetype: "Spark Seeker",
      engine_version: "v3",
    });
  });
});

describe("PATCH /api/admin/submissions/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue(true);
    mockVerifyCsrf.mockResolvedValue(true);
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
  });

  it("returns 401 when not authenticated", async () => {
    mockVerifyAdminSession.mockResolvedValue(false);

    const res = await PATCH(makePatchRequest("1", { status: "flagged" }), makeParams("1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when CSRF is invalid", async () => {
    mockVerifyCsrf.mockResolvedValue(false);

    const res = await PATCH(makePatchRequest("1", { status: "flagged" }), makeParams("1"));
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.error).toBe("Invalid request.");
  });

  it("returns 400 for non-numeric ID", async () => {
    const res = await PATCH(makePatchRequest("abc", { status: "flagged" }), makeParams("abc"));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("Invalid ID.");
  });

  it("returns 400 for invalid status value", async () => {
    const res = await PATCH(makePatchRequest("1", { status: "invalid" }), makeParams("1"));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("Invalid status.");
  });

  it("returns 400 when status is missing", async () => {
    const res = await PATCH(makePatchRequest("1", {}), makeParams("1"));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("Invalid status.");
  });

  it("returns 500 when Supabase PATCH fails", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const res = await PATCH(makePatchRequest("1", { status: "flagged" }), makeParams("1"));
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error).toBe("Unable to update.");
  });

  it("returns success for valid status update", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({ ok: true });

    const res = await PATCH(makePatchRequest("1", { status: "flagged" }), makeParams("1"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("accepts all valid statuses", async () => {
    for (const status of ["completed", "flagged", "archived"]) {
      vi.resetAllMocks();
      mockVerifyAdminSession.mockResolvedValue(true);
      mockVerifyCsrf.mockResolvedValue(true);
      mockSupabaseFetch.mockResolvedValueOnce({ ok: true });

      const res = await PATCH(makePatchRequest("1", { status }), makeParams("1"));
      expect(res.status).toBe(200);
    }
  });
});

describe("DELETE /api/admin/submissions/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockVerifyAdminSession.mockResolvedValue(true);
    mockVerifyCsrf.mockResolvedValue(true);
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() });
  });

  it("returns 401 when not authenticated", async () => {
    mockVerifyAdminSession.mockResolvedValue(false);

    const res = await DELETE(makeDeleteRequest("1"), makeParams("1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when CSRF is invalid", async () => {
    mockVerifyCsrf.mockResolvedValue(false);

    const res = await DELETE(makeDeleteRequest("1"), makeParams("1"));
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.error).toBe("Invalid request.");
  });

  it("returns 400 for non-numeric ID", async () => {
    const res = await DELETE(makeDeleteRequest("abc"), makeParams("abc"));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("Invalid ID.");
  });

  it("returns 409 when personal report exists", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 99 }],
    });

    const res = await DELETE(makeDeleteRequest("1"), makeParams("1"));
    expect(res.status).toBe(409);

    const json = await res.json();
    expect(json.error).toContain("personal report exists");
  });

  it("returns 500 when answers delete fails", async () => {
    // Report check → no reports
    mockSupabaseFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    // Answer options delete (caught)
    mockSupabaseFetch.mockResolvedValueOnce({ ok: true });
    // Answer history delete (caught)
    mockSupabaseFetch.mockResolvedValueOnce({ ok: true });
    // Answers delete → fails
    mockSupabaseFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const res = await DELETE(makeDeleteRequest("1"), makeParams("1"));
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error).toBe("Unable to delete.");
  });

  it("returns 200 on successful cascade delete", async () => {
    // Report check → no reports
    mockSupabaseFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    // Answer options delete
    mockSupabaseFetch.mockResolvedValueOnce({ ok: true });
    // Answer history delete
    mockSupabaseFetch.mockResolvedValueOnce({ ok: true });
    // Answers delete
    mockSupabaseFetch.mockResolvedValueOnce({ ok: true });
    // Scoring result delete
    mockSupabaseFetch.mockResolvedValueOnce({ ok: true });
    // Analytics events delete
    mockSupabaseFetch.mockResolvedValueOnce({ ok: true });
    // Submission delete
    mockSupabaseFetch.mockResolvedValueOnce({ ok: true });

    const res = await DELETE(makeDeleteRequest("1"), makeParams("1"));
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
  });
});
