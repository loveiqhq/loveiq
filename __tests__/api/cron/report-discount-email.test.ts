import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithTimeout = vi.fn();
const mockResendSend = vi.fn();

// vi.hoisted lets us share a fn across the vi.mock factory (which is hoisted
// to the top of the file) and the test body. Without it the test body can't
// override the mock per-test.
const { mockIsEmailSuppressed } = vi.hoisted(() => ({
  mockIsEmailSuppressed: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: Parameters<typeof mockFetchWithTimeout>) =>
    mockFetchWithTimeout(...args),
}));

vi.mock("@/lib/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
}));

vi.mock("@/lib/ratelimit", () => ({
  checkCooldown: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@/lib/emails/suppression", () => ({
  isEmailSuppressed: (...args: unknown[]) => mockIsEmailSuppressed(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mockResendSend };
  },
}));

import { GET } from "@/app/api/cron/report-discount-email/route";

const ORIGINAL_ENV = { ...process.env };

function makeRequest(token?: string): Request {
  return new Request("https://example.test/api/cron/report-discount-email", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("GET /api/cron/report-discount-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsEmailSuppressed.mockResolvedValue(false);
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

  it("returns 503 when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest("anything"));
    expect(res.status).toBe(503);
  });

  it("returns 401 when authorization header is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 when bearer token mismatches", async () => {
    const res = await GET(makeRequest("wrong"));
    expect(res.status).toBe(401);
  });

  it("returns 503 when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(503);
  });

  it("returns 200 with zero summary when no candidates exist", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({ ok: true, json: async () => [] });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  // ─── Candidate-loop depth tests ─────────────────────────────────────────────
  // Cover the skip branches inside the per-candidate loop.

  function candidate(overrides: Record<string, unknown> = {}) {
    return {
      id: 1,
      personal_report_id: 10,
      survey_submission_id: 20,
      user_id: 30,
      discount_step: 1,
      metadata: { discountEmailsSent: [] as number[] },
      app_user: { email: "buyer@example.com", first_name: "Buyer" },
      ...overrides,
    };
  }

  function mockSequence(
    opts: {
      candidates?: ReturnType<typeof candidate>[];
      hasPlan?: boolean;
      hasToken?: boolean;
    } = {}
  ) {
    const candidates = opts.candidates ?? [candidate()];
    mockFetchWithTimeout.mockImplementation(async (url: string) => {
      const path = String(url);
      if (path.includes("/rest/v1/report_price_quote")) {
        return { ok: true, json: async () => candidates };
      }
      // getReportPlanByPersonalReportId queries /rest/v1/payment for the
      // strongest succeeded plan tied to a personal_report.
      if (
        path.includes("/rest/v1/payment?personal_report_id=eq.") &&
        path.includes("status=eq.succeeded")
      ) {
        return {
          ok: true,
          json: async () => (opts.hasPlan ? [{ metadata: { plan: "essentials" } }] : []),
        };
      }
      // fetchAccessToken
      if (path.includes("/rest/v1/report_access_token")) {
        return {
          ok: true,
          json: async () =>
            opts.hasToken === false ? [] : [{ token: "rpt_ABCDEFGHIJKLMNOPQRST" }],
        };
      }
      // dedup write (markDiscountEmailSent)
      if (path.includes("/rest/v1/report_price_quote?")) {
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({}) };
    });
  }

  it("skips candidates whose discount_step is already in metadata.discountEmailsSent", async () => {
    mockSequence({
      candidates: [candidate({ discount_step: 1, metadata: { discountEmailsSent: [1] } })],
    });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(1);
    expect(body.skippedAlreadySent).toBe(1);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("skips candidates whose personal_report already has a paid plan", async () => {
    mockSequence({ hasPlan: true });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(1);
    expect(body.skippedAlreadyPaid).toBe(1);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("skips candidates with no email", async () => {
    mockSequence({
      candidates: [candidate({ app_user: { email: null, first_name: null } })],
    });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skippedNoEmail).toBe(1);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("skips candidates with no report_access_token", async () => {
    mockSequence({ hasToken: false });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skippedNoToken).toBe(1);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("skips candidates whose email is in the suppression list", async () => {
    mockSequence();
    mockIsEmailSuppressed.mockResolvedValue(true);
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skippedSuppressed).toBe(1);
    expect(mockResendSend).not.toHaveBeenCalled();
  });
});
