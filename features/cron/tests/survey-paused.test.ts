import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithTimeout = vi.fn();
const mockCheckCooldown = vi.fn();
const mockIsEmailSuppressed = vi.fn();
const mockResendSend = vi.fn();

vi.mock("@/lib/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: Parameters<typeof mockFetchWithTimeout>) =>
    mockFetchWithTimeout(...args),
}));

vi.mock("@/lib/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
}));

vi.mock("@/lib/ratelimit", () => ({
  checkCooldown: (...args: unknown[]) => mockCheckCooldown(...args),
}));

vi.mock("@/lib/emails/suppression", () => ({
  isEmailSuppressed: (...args: unknown[]) => mockIsEmailSuppressed(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("resend", () => ({
  // Class form so `new Resend(key)` in the route works under vitest mocking.
  Resend: class {
    emails = { send: mockResendSend };
  },
}));

import { GET } from "@/app/api/cron/survey-paused/route";

const ORIGINAL_ENV = { ...process.env };

function makeRequest(token?: string): Request {
  return new Request("https://example.test/api/cron/survey-paused", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("GET /api/cron/survey-paused", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      CRON_SECRET: "test-cron-secret",
      RESEND_API_KEY: "re_test_key",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      NEXT_PUBLIC_SITE_URL: "https://test.loveiq.org",
    };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns 503 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest("anything"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Service unavailable." });
  });

  it("returns 401 when authorization header is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid request." });
  });

  it("returns 401 when authorization header has wrong secret", async () => {
    const res = await GET(makeRequest("wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("returns 401 when authorization header has correct shape but mismatched length", async () => {
    // safeCompare is timing-safe; verify it rejects shorter and longer tokens
    const tooShort = await GET(makeRequest("test-secret"));
    expect(tooShort.status).toBe(401);
    const tooLong = await GET(makeRequest("test-cron-secret-extra"));
    expect(tooLong.status).toBe(401);
  });

  it("returns 503 when RESEND_API_KEY is not configured", async () => {
    delete process.env.RESEND_API_KEY;
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(503);
  });

  it("returns 200 with zero-summary when no candidate partial saves exist", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => [], // no candidates
    });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      candidates: 0,
      sent: 0,
      skippedSubmitted: 0,
      skippedCooldown: 0,
      skippedSuppressed: 0,
      errors: 0,
    });
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("returns 500 when Supabase query fails", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Unable to process request." });
  });

  // ─── Candidate-loop depth tests ─────────────────────────────────────────────
  // Each test sets up:
  //   1. fetchCandidates() → returns one partial-save row with an email answer
  //   2. isSubmitted() → returns false (so the row reaches the cooldown step)
  //   3. checkCooldown / isEmailSuppressed / Resend mocks as needed per scenario

  // Email is stored under the canonical "00000" question id (see getSurveyContactInfo).
  const candidateRow = {
    session_id: "sess-abc",
    answers: { "00000": "user@example.com", "00001": "First" },
    saved_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  };

  function mockSupabaseSequence(opts: { submitted?: boolean } = {}) {
    mockFetchWithTimeout.mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/rest/v1/survey_partial_save")) {
        return { ok: true, json: async () => [candidateRow] };
      }
      if (typeof url === "string" && url.includes("/rest/v1/survey_submission")) {
        return { ok: true, json: async () => (opts.submitted ? [{ id: 1 }] : []) };
      }
      throw new Error(`Unexpected fetchWithTimeout call: ${url}`);
    });
  }

  it("skips candidates that already submitted (isSubmitted=true)", async () => {
    mockSupabaseSequence({ submitted: true });
    mockIsEmailSuppressed.mockResolvedValue(false);
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates).toBe(1);
    expect(body.skippedSubmitted).toBe(1);
    expect(body.sent).toBe(0);
    expect(mockResendSend).not.toHaveBeenCalled();
    expect(mockCheckCooldown).not.toHaveBeenCalled(); // cooldown is checked AFTER isSubmitted
  });

  it("skips candidates whose email is in the suppression list", async () => {
    mockSupabaseSequence();
    mockIsEmailSuppressed.mockResolvedValue(true);
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates).toBe(1);
    expect(body.skippedSuppressed).toBe(1);
    expect(body.sent).toBe(0);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("skips candidates blocked by the 30-day cooldown", async () => {
    mockSupabaseSequence();
    mockIsEmailSuppressed.mockResolvedValue(false);
    mockCheckCooldown.mockResolvedValue({ allowed: false });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates).toBe(1);
    expect(body.skippedCooldown).toBe(1);
    expect(body.sent).toBe(0);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("increments `errors` when Resend reports a per-message failure (does not throw)", async () => {
    mockSupabaseSequence();
    mockIsEmailSuppressed.mockResolvedValue(false);
    mockCheckCooldown.mockResolvedValue({ allowed: true });
    mockResendSend.mockResolvedValue({ error: { statusCode: 422, message: "rejected" } });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates).toBe(1);
    expect(body.errors).toBe(1);
    expect(body.sent).toBe(0);
    expect(mockResendSend).toHaveBeenCalledTimes(1);
  });

  it("increments `errors` when Resend throws (network / timeout)", async () => {
    mockSupabaseSequence();
    mockIsEmailSuppressed.mockResolvedValue(false);
    mockCheckCooldown.mockResolvedValue({ allowed: true });
    mockResendSend.mockRejectedValue(new Error("network down"));
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates).toBe(1);
    expect(body.errors).toBe(1);
    expect(body.sent).toBe(0);
  });

  it("increments `sent` on a successful Resend call", async () => {
    mockSupabaseSequence();
    mockIsEmailSuppressed.mockResolvedValue(false);
    mockCheckCooldown.mockResolvedValue({ allowed: true });
    mockResendSend.mockResolvedValue({ id: "resend-msg-1" });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates).toBe(1);
    expect(body.sent).toBe(1);
    expect(body.errors).toBe(0);
    expect(mockResendSend).toHaveBeenCalledTimes(1);
    // Confirm the address routed to Resend matches the email in the candidate answers.
    expect(mockResendSend.mock.calls[0]![0].to).toBe("user@example.com");
  });
});
