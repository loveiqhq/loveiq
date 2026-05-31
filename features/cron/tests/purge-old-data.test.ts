// R-06: F-02 retention purge cron. Focus on Bearer auth, the per-rule
// loop, and Content-Range header parsing — the safety properties that
// would fail silently if regressed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@shared/http/is-prod-cron-host", () => ({
  isProdCronHost: () => true,
}));

vi.mock("@shared/observability/slack-alert-dedup", () => ({
  recordCronRun: vi.fn().mockResolvedValue(undefined),
  startCronTimer: () => async () => undefined,
}));

import { GET } from "@/app/api/cron/purge-old-data/route";

function makeRequest(token?: string): Request {
  return new Request("https://example.test/api/cron/purge-old-data", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function purgeResponse(deletedCount: number) {
  return {
    ok: true,
    headers: new Headers({ "content-range": `*/${deletedCount}` }),
    text: async () => "",
    json: async () => null,
  };
}

const ORIGINAL_ENV = { ...process.env };

describe("GET /api/cron/purge-old-data (F-02)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      CRON_SECRET: "test-cron-secret",
      // The purge is POSTPONED/disabled by default in prod; tests that
      // exercise the delete logic opt in explicitly here.
      PURGE_OLD_DATA_ENABLED: "true",
    };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns 503 without CRON_SECRET", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeRequest("anything"));
    expect(res.status).toBe(503);
  });

  it("returns 401 with wrong bearer", async () => {
    const res = await GET(makeRequest("wrong"));
    expect(res.status).toBe(401);
  });

  it("returns 401 with missing authorization header", async () => {
    const res = await GET(makeRequest(undefined));
    expect(res.status).toBe(401);
  });

  it("is a no-op (skipped:disabled) when PURGE_OLD_DATA_ENABLED is not 'true'", async () => {
    delete process.env.PURGE_OLD_DATA_ENABLED;
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ skipped: true, reason: "disabled" });
    // Critically: NO deletes were attempted.
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("succeeds and reports per-table deletion counts via Content-Range", async () => {
    // ALL SEVEN retention rules, in RETENTION_DAYS order. Mocking fewer than
    // the loop iterates lets the un-mocked tables silently hit the error path
    // (undefined → throw → caught) while the test still passes — false
    // confidence. Mock + assert every table so a regression in any rule shows.
    mockSupabaseFetch
      .mockResolvedValueOnce(purgeResponse(12)) // survey_partial_save
      .mockResolvedValueOnce(purgeResponse(345)) // analytics_event
      .mockResolvedValueOnce(purgeResponse(6)) // payment_webhook_event
      .mockResolvedValueOnce(purgeResponse(0)) // resend_webhook_event
      .mockResolvedValueOnce(purgeResponse(5)) // cron_run
      .mockResolvedValueOnce(purgeResponse(20)) // invite_event
      .mockResolvedValueOnce(purgeResponse(3)); // slack_dead_letter

    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.totalDeleted).toBe(12 + 345 + 6 + 0 + 5 + 20 + 3);
    expect(body.summary["survey_partial_save"].deleted).toBe(12);
    expect(body.summary["analytics_event"].deleted).toBe(345);
    expect(body.summary["payment_webhook_event"].deleted).toBe(6);
    expect(body.summary["resend_webhook_event"].deleted).toBe(0);
    expect(body.summary["cron_run"].deleted).toBe(5);
    expect(body.summary["invite_event"].deleted).toBe(20);
    expect(body.summary["slack_dead_letter"].deleted).toBe(3);
    // Guard against silent drift: every rule must be exercised.
    expect(Object.keys(body.summary)).toHaveLength(7);
    expect(mockSupabaseFetch).toHaveBeenCalledTimes(7);
    // No table errored — the mock covered all 7 calls.
    const rows = Object.values(body.summary) as Array<{ deleted: number; error?: string }>;
    expect(rows.every((r) => !r.error)).toBe(true);
  });

  it("returns 500 when every rule fails", async () => {
    mockSupabaseFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "boom",
      headers: new Headers(),
    });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(500);
  });

  it("succeeds (with errors[]) when only some rules fail", async () => {
    mockSupabaseFetch
      .mockResolvedValueOnce(purgeResponse(10))
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "boom",
        headers: new Headers(),
      })
      .mockResolvedValueOnce(purgeResponse(2))
      .mockResolvedValueOnce(purgeResponse(0));
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary["analytics_event"].error).toBeDefined();
    expect(body.summary["survey_partial_save"].deleted).toBe(10);
  });

  it("tolerates a missing Content-Range header (deleted=0)", async () => {
    mockSupabaseFetch.mockResolvedValue({
      ok: true,
      headers: new Headers(), // no content-range
      text: async () => "",
      json: async () => null,
    });
    const res = await GET(makeRequest("test-cron-secret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalDeleted).toBe(0);
  });
});
