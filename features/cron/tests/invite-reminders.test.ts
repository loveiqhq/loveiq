import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithTimeout = vi.fn();
const mockResendSend = vi.fn();

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: Parameters<typeof mockFetchWithTimeout>) =>
    mockFetchWithTimeout(...args),
}));

vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
}));

vi.mock("@shared/http/ratelimit", () => ({
  checkCooldown: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@shared/emails/suppression", () => ({
  isEmailSuppressed: vi.fn().mockResolvedValue(false),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mockResendSend };
  },
}));

import { GET } from "@/app/api/cron/invite-reminders/route";

const ORIGINAL_ENV = { ...process.env };

function makeRequest(token?: string): Request {
  return new Request("https://example.test/api/cron/invite-reminders", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("GET /api/cron/invite-reminders", () => {
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
  });

  it("returns 401 when authorization is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 when bearer token is wrong", async () => {
    const res = await GET(makeRequest("wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("returns 503 when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(503);
  });

  it("returns 200 with zero summary when no paid users qualify", async () => {
    mockFetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: async () => [], // no paid candidates
    });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.candidates).toBe(0);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  // ─── Candidate-loop depth tests ─────────────────────────────────────────────
  // Cover the per-row skip paths in the route:
  //   plan check → email check → suppressed → age window → already-invited → cooldown

  function paidRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 1,
      payment_date_time: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: { plan: "full_report" },
      app_user: { email: "buyer@example.com", first_name: "Buyer" },
      ...overrides,
    };
  }

  function mockSupabaseSequence(
    opts: {
      candidates?: Array<ReturnType<typeof paidRow>>;
      hasInvite?: boolean;
    } = {}
  ) {
    const candidates = opts.candidates ?? [paidRow()];
    mockFetchWithTimeout.mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/rest/v1/payment")) {
        return { ok: true, json: async () => candidates };
      }
      if (typeof url === "string" && url.includes("/rest/v1/invite_event")) {
        return { ok: true, json: async () => (opts.hasInvite ? [{ id: 1 }] : []) };
      }
      throw new Error(`Unexpected fetchWithTimeout call: ${url}`);
    });
  }

  it("skips rows whose metadata.plan is not full_report or all_reports", async () => {
    mockSupabaseSequence({ candidates: [paidRow({ metadata: { plan: "essentials" } })] });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidates).toBe(1);
    expect(body.skippedWrongPlan).toBe(1);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("skips rows with no email", async () => {
    mockSupabaseSequence({
      candidates: [paidRow({ app_user: { email: null, first_name: null } })],
    });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skippedNoEmail).toBe(1);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("skips rows whose payment_date_time falls outside the reminder window", async () => {
    // Use a very recent payment so reminderForAge returns null (under Reminder 1 min days).
    const tooRecent = paidRow({ payment_date_time: new Date().toISOString() });
    mockSupabaseSequence({ candidates: [tooRecent] });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skippedOutOfWindow).toBe(1);
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("skips rows where the user has already sent an invite", async () => {
    mockSupabaseSequence({ hasInvite: true });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skippedAlreadyInvited).toBe(1);
    expect(mockResendSend).not.toHaveBeenCalled();
  });
});
