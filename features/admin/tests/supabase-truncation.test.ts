import { afterEach, describe, expect, it, vi } from "vitest";

const mockWarn = vi.fn();
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: (...a: unknown[]) => mockWarn(...a), error: vi.fn() },
}));

const mockFetch = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...a: unknown[]) => mockFetch(...a),
}));
vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<Response>) => fn() }),
}));

import { POSTGREST_MAX_ROWS, supabaseFetch } from "@features/admin/server/supabase";

function respond(contentRange: string | null): void {
  mockFetch.mockResolvedValue({
    ok: true,
    headers: { get: (k: string) => (k === "content-range" ? contentRange : null) },
  } as unknown as Response);
}

describe("PostgREST max-rows truncation", () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

  afterEach(() => {
    mockWarn.mockClear();
    mockFetch.mockClear();
  });

  it("warns when a response comes back capped", async () => {
    // 26,109 rows existed, 1,000 came back, nothing failed — and the answer
    // changed from Q11/14% to Q58/21%. This is the only signal that it happened.
    respond(`0-${POSTGREST_MAX_ROWS - 1}/*`);
    await supabaseFetch("/rest/v1/survey_behavior_event?select=id&limit=50000");
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mockWarn.mock.calls[0])).toContain("max-rows");
  });

  it("warns for a query with no limit at all — the silent case", async () => {
    // channel-efficiency reads survey_submission with no limit; it crosses
    // 1,000 rows at a 90-day window, which the admin UI can request.
    respond(`0-${POSTGREST_MAX_ROWS - 1}/*`);
    await supabaseFetch("/rest/v1/survey_submission?select=id&created_date_time=gte.2026-01-01");
    expect(mockWarn).toHaveBeenCalledTimes(1);
  });

  it("stays quiet for deliberate pagination", async () => {
    // The brain ingest loops limit=1000&offset=N on purpose. Warning on every
    // full page would train everyone to ignore the warning.
    respond(`0-${POSTGREST_MAX_ROWS - 1}/*`);
    await supabaseFetch("/rest/v1/brain_chunk?select=source_id&limit=1000&offset=3000");
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("stays quiet for a response under the cap", async () => {
    respond("0-4/*");
    await supabaseFetch("/rest/v1/survey_submission?select=id");
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("stays quiet when there is no range header at all", async () => {
    respond(null);
    await supabaseFetch("/rest/v1/rpc/get_survey_friction", { method: "POST", body: "{}" });
    expect(mockWarn).not.toHaveBeenCalled();
  });
});
