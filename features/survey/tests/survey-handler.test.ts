import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks (must be before imports) ---

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockVerifyCsrf = vi.fn<() => Promise<boolean>>();
vi.mock("@/lib/csrf", () => ({
  verifyCsrfToken: (...args: unknown[]) => mockVerifyCsrf(...(args as [])),
}));

const mockCheckRateLimit = vi.fn();
const mockCheckCooldown = vi.fn();
const mockGetClientIp = vi.fn();
vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  checkCooldown: (...args: unknown[]) => mockCheckCooldown(...args),
  getClientIp: (...args: unknown[]) => mockGetClientIp(...args),
}));

const mockFetchWithTimeout = vi.fn();
vi.mock("@/lib/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

vi.mock("@/lib/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
  CircuitOpenError: class CircuitOpenError extends Error {},
}));

vi.mock("@features/report/server/personalReport", () => ({
  ensurePersonalReportForSubmission: vi.fn().mockResolvedValue({ id: 10 }),
}));

// Set env vars before importing the handler
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";

import { POST } from "@/app/api/survey/route";

// --- Helpers ---

function makeRequest(body: unknown = validBody()) {
  return new Request("http://localhost:3000/api/survey", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody() {
  return {
    email: "alice@example.com",
    firstName: "Alice",
    answers: { q1: "yes", q2: 3, q3: ["a", "b"] },
    startedAt: new Date().toISOString(),
    durationMs: 120000,
  };
}

function allowCsrf() {
  mockVerifyCsrf.mockResolvedValue(true);
}

function allowRateLimit() {
  mockCheckRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 2,
    resetAt: new Date(Date.now() + 60_000),
  });
}

function allowCooldown() {
  mockCheckCooldown.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
}

function mockSupabaseRpcOk(result: unknown = { success: true, submission_id: 123 }) {
  mockFetchWithTimeout.mockResolvedValueOnce({
    ok: true,
    json: async () => result,
  });
}

// --- Tests ---

describe("POST /api/survey", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    mockGetClientIp.mockReturnValue("1.2.3.4");
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: async () => [],
    });
  });

  it("returns 403 when CSRF token is invalid", async () => {
    mockVerifyCsrf.mockResolvedValue(false);

    const res = await POST(makeRequest());
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json.error).toBe("Invalid request.");
  });

  it("returns 429 when rate limited", async () => {
    allowCsrf();
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 30_000),
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(429);

    const json = await res.json();
    expect(json.error).toBe("Please try again later.");
    expect(res.headers.get("Retry-After")).toBeDefined();
  });

  it("returns 400 when email is missing", async () => {
    allowCsrf();
    allowRateLimit();

    const { email: _email, ...bodyWithoutEmail } = validBody();
    const res = await POST(makeRequest(bodyWithoutEmail));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("Invalid input");
  });

  it("returns 400 when email is invalid", async () => {
    allowCsrf();
    allowRateLimit();

    const res = await POST(makeRequest({ ...validBody(), email: "not-an-email" }));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("Invalid input");
  });

  it("returns 400 when body is malformed JSON", async () => {
    allowCsrf();
    allowRateLimit();

    const req = new Request("http://localhost:3000/api/survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when honeypot field is filled", async () => {
    allowCsrf();
    allowRateLimit();

    const res = await POST(makeRequest({ ...validBody(), website: "http://spam.bot" }));
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("Invalid input");
  });

  it("returns 429 when email cooldown is active", async () => {
    allowCsrf();
    allowRateLimit();
    mockCheckCooldown.mockResolvedValue({
      allowed: false,
      retryAfterMs: 270_000,
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(429);

    const json = await res.json();
    expect(json.error).toBe("Please wait before retrying.");
    expect(res.headers.get("Retry-After")).toBeDefined();
  });

  it("returns 503 when SUPABASE_URL is missing", async () => {
    allowCsrf();
    allowRateLimit();
    allowCooldown();

    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const res = await POST(makeRequest());
    expect(res.status).toBe(503);

    const json = await res.json();
    expect(json.error).toBe("Service unavailable.");
  });

  it("returns 503 when Supabase fetch throws a network error", async () => {
    allowCsrf();
    allowRateLimit();
    allowCooldown();

    mockFetchWithTimeout.mockRejectedValueOnce(new Error("Network failure"));

    const res = await POST(makeRequest());
    expect(res.status).toBe(503);

    const json = await res.json();
    expect(json.error).toBe("Service temporarily unavailable.");
  });

  it("returns 500 when Supabase RPC returns a non-ok HTTP status", async () => {
    allowCsrf();
    allowRateLimit();
    allowCooldown();

    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error).toBe("Unable to process request.");
  });

  it("returns 500 when Supabase RPC body contains success: false", async () => {
    allowCsrf();
    allowRateLimit();
    allowCooldown();

    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false, error: "duplicate email" }),
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);

    const json = await res.json();
    expect(json.error).toBe("Unable to process request.");
  });

  it("returns 200 with success: true on the happy path", async () => {
    allowCsrf();
    allowRateLimit();
    allowCooldown();
    mockSupabaseRpcOk();

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
  });

  it("emits X-Server-Timing header with gate/submit/post-submit markers on success", async () => {
    // X-Server-Timing (not standard Server-Timing) because Vercel's edge
    // strips the standard name from Function responses. Same value format.
    allowCsrf();
    allowRateLimit();
    allowCooldown();
    mockSupabaseRpcOk();

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const serverTiming = res.headers.get("X-Server-Timing");
    expect(serverTiming, "expected X-Server-Timing header on the 200 response").not.toBeNull();
    // Same value format as W3C Server-Timing: `name;dur=<ms>` entries
    // comma-separated.
    expect(serverTiming).toMatch(/gate;dur=[\d.]+/);
    expect(serverTiming).toMatch(/submit;dur=[\d.]+/);
    expect(serverTiming).toMatch(/post-submit;dur=[\d.]+/);
  });

  it("forwards utmTracker to Supabase RPC when provided", async () => {
    allowCsrf();
    allowRateLimit();
    allowCooldown();
    mockSupabaseRpcOk();

    const utmJson = JSON.stringify({ utm_source: "google", utm_medium: "cpc" });
    await POST(makeRequest({ ...validBody(), utmTracker: utmJson }));

    const rpcCall = mockFetchWithTimeout.mock.calls[0];
    const rpcBody = JSON.parse(rpcCall[1].body);
    expect(rpcBody.p_utm_tracker).toBe(utmJson);
  });

  it("sends p_utm_tracker as null when utmTracker is omitted", async () => {
    allowCsrf();
    allowRateLimit();
    allowCooldown();
    mockSupabaseRpcOk();

    await POST(makeRequest());

    const rpcCall = mockFetchWithTimeout.mock.calls[0];
    const rpcBody = JSON.parse(rpcCall[1].body);
    expect(rpcBody.p_utm_tracker).toBeNull();
  });

  it("normalizes email to lowercase before calling checkCooldown", async () => {
    allowCsrf();
    allowRateLimit();
    allowCooldown();
    mockSupabaseRpcOk();

    await POST(makeRequest({ ...validBody(), email: "ALICE@EXAMPLE.COM" }));

    expect(mockCheckCooldown).toHaveBeenCalledWith(
      "alice@example.com",
      "survey-email",
      expect.any(Number)
    );
  });

  it("calls checkRateLimit with the client IP and correct bucket config", async () => {
    allowCsrf();
    mockGetClientIp.mockReturnValue("10.0.0.1");
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000),
    });

    await POST(makeRequest());

    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      "10.0.0.1",
      expect.objectContaining({ bucket: "survey", limit: 3 })
    );
  });

  it("writes scoring, hotjar, and report-token after submit (parallelization contract)", async () => {
    // This test pins the contract that AFTER submitSurveyOnce returns, the
    // route performs three independent writes: scoring_result upsert,
    // survey_submission.hotjar_user_id PATCH (when hotjarUserId is provided
    // and the row is new), and report_access_token POST. The test uses
    // URL-based mockImplementation rather than ordered mockResolvedValueOnce
    // so it passes whether the three writes run serially or via Promise.all.
    allowCsrf();
    allowRateLimit();
    allowCooldown();

    const SUBMISSION_ID = 4242;
    const HOTJAR_USER_ID = "hj-user-xyz";
    const SESSION_ID = "11111111-2222-3333-4444-555555555555";

    mockFetchWithTimeout.mockImplementation((url: string, init?: { method?: string }) => {
      const method = (init?.method || "GET").toUpperCase();
      if (typeof url === "string" && url.includes("/rpc/submit_survey")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ success: true, submission_id: SUBMISSION_ID }),
        });
      }
      // fetchScoringSummary: return empty so storeScoringResult fires.
      // setSubmissionHotjarUserId PATCH, report_access_token POST,
      // and any session lookup all return ok with an empty body.
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    const res = await POST(
      makeRequest({
        ...validBody(),
        sessionId: SESSION_ID,
        hotjarUserId: HOTJAR_USER_ID,
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.reportToken).toMatch(/^rpt_/);

    const calls = mockFetchWithTimeout.mock.calls.map((c) => ({
      url: c[0] as string,
      method: ((c[1] as { method?: string })?.method || "GET").toUpperCase(),
      body: (c[1] as { body?: string })?.body,
    }));

    // Scoring upsert: POST to scoring_result with the new submissionId
    const scoringWrite = calls.find(
      (c) => c.url.includes("/rest/v1/scoring_result") && c.method === "POST"
    );
    expect(scoringWrite, "expected POST to scoring_result").toBeDefined();
    expect(JSON.parse(scoringWrite!.body!)).toMatchObject({
      survey_submission_id: SUBMISSION_ID,
    });

    // Hotjar PATCH: setSubmissionHotjarUserId on survey_submission row
    const hotjarPatch = calls.find(
      (c) => c.url.includes("/rest/v1/survey_submission") && c.method === "PATCH"
    );
    expect(hotjarPatch, "expected PATCH to survey_submission").toBeDefined();
    expect(JSON.parse(hotjarPatch!.body!)).toMatchObject({
      hotjar_user_id: HOTJAR_USER_ID,
    });

    // Report token POST: creates a row in report_access_token
    const tokenPost = calls.find((c) => c.url.includes("/rest/v1/report_access_token"));
    expect(tokenPost, "expected POST to report_access_token").toBeDefined();
    const tokenBody = JSON.parse(tokenPost!.body!);
    expect(tokenBody.survey_submission_id).toBe(SUBMISSION_ID);
    expect(tokenBody.token).toMatch(/^rpt_/);
  });
});
