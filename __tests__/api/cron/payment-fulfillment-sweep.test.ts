import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithTimeout = vi.fn();

vi.mock("@/lib/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: Parameters<typeof mockFetchWithTimeout>) =>
    mockFetchWithTimeout(...args),
}));

vi.mock("@/lib/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<unknown>) => fn() }),
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/report/personalReport", () => ({
  ensurePersonalReportForSubmission: vi.fn(),
  resolveSubmissionAccessContext: vi.fn(),
  unlockAllArchetypesForPersonalReport: vi.fn(),
  upsertArchetypeTierForPersonalReport: vi.fn(),
}));

import { GET } from "@/app/api/cron/payment-fulfillment-sweep/route";

const ORIGINAL_ENV = { ...process.env };

function makeRequest(token?: string): Request {
  return new Request("https://example.test/api/cron/payment-fulfillment-sweep", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("GET /api/cron/payment-fulfillment-sweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      CRON_SECRET: "test-cron-secret",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      STRIPE_SECRET_KEY: "sk_test_xxx",
    };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns 503 when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest("any"));
    expect(res.status).toBe(503);
  });

  it("returns 401 when authorization header is missing", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 when bearer token mismatches", async () => {
    const res = await GET(makeRequest("nope"));
    expect(res.status).toBe(401);
  });

  it("returns 200 with zero-summary when no stuck payments exist", async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: async () => [], // find_stuck_payments RPC returns empty
    });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  // ─── Candidate-loop depth tests ─────────────────────────────────────────────
  // This route is the money-recovery safety net: it scans `payment` rows where
  // status=succeeded but the corresponding personal_report tier wasn't written
  // by the webhook. Deeper coverage protects against silently lost purchases.

  function mockSequence(opts: {
    candidates?: Array<{
      payment_id: number;
      personal_report_id: number;
      plan: string;
      archetype: string | null;
      primary_archetype: string | null;
    }>;
    fulfillOk?: boolean;
  }) {
    const candidates = opts.candidates ?? [];
    const fulfillOk = opts.fulfillOk ?? true;
    mockFetchWithTimeout.mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes("/rpc/find_stuck_payments")) {
        return { ok: true, json: async () => candidates };
      }
      if (
        typeof url === "string" &&
        (url.includes("/rpc/unlock_all_archetypes") || url.includes("/rpc/upsert_archetype_tier"))
      ) {
        return { ok: fulfillOk, status: fulfillOk ? 200 : 500, json: async () => ({}) };
      }
      throw new Error(`Unexpected fetchWithTimeout call: ${url}`);
    });
  }

  it("returns 500 when the find_stuck_payments RPC fails", async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Sweep failed.");
  });

  it("fixes an `all_reports` purchase by calling unlock_all_archetypes", async () => {
    mockSequence({
      candidates: [
        {
          payment_id: 10,
          personal_report_id: 5,
          plan: "all_reports",
          archetype: null,
          primary_archetype: null,
        },
      ],
    });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scanned).toBe(1);
    expect(body.fixed).toBe(1);
    expect(body.errors).toBe(0);
    // Verify the unlock_all_archetypes RPC was called for the report id.
    const calls = mockFetchWithTimeout.mock.calls.map((call) => String(call[0]));
    expect(calls.some((url) => url.includes("/rpc/unlock_all_archetypes"))).toBe(true);
  });

  it("fixes a `full_report` purchase using metadata.archetype when present", async () => {
    mockSequence({
      candidates: [
        {
          payment_id: 11,
          personal_report_id: 6,
          plan: "full_report",
          archetype: "Spark Seeker",
          primary_archetype: "Curious Apprentice",
        },
      ],
    });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fixed).toBe(1);
    expect(body.errors).toBe(0);
    const calls = mockFetchWithTimeout.mock.calls.map((call) => String(call[0]));
    expect(calls.some((url) => url.includes("/rpc/upsert_archetype_tier"))).toBe(true);
  });

  it("falls back to primary_archetype when metadata.archetype is unknown", async () => {
    mockSequence({
      candidates: [
        {
          payment_id: 12,
          personal_report_id: 7,
          plan: "full_report",
          archetype: "Not An Archetype",
          primary_archetype: "Spark Seeker",
        },
      ],
    });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fixed).toBe(1);
  });

  it("skips per-archetype rows with no resolvable archetype", async () => {
    mockSequence({
      candidates: [
        {
          payment_id: 13,
          personal_report_id: 8,
          plan: "essentials",
          archetype: null,
          primary_archetype: null,
        },
      ],
    });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scanned).toBe(1);
    expect(body.fixed).toBe(0);
    expect(body.skipped).toBe(1);
    expect(body.errors).toBe(0);
  });

  it("counts per-candidate RPC failures in `errors`, does not break the loop", async () => {
    mockSequence({
      candidates: [
        {
          payment_id: 14,
          personal_report_id: 9,
          plan: "all_reports",
          archetype: null,
          primary_archetype: null,
        },
        {
          payment_id: 15,
          personal_report_id: 10,
          plan: "all_reports",
          archetype: null,
          primary_archetype: null,
        },
      ],
      fulfillOk: false,
    });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scanned).toBe(2);
    expect(body.errors).toBe(2);
    expect(body.fixed).toBe(0);
  });
});
