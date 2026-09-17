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

import {
  countRows,
  fetchAllRows,
  POSTGREST_MAX_ROWS,
  supabaseFetch,
} from "@features/admin/server/supabase";

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

describe("countRows — the answer to the cap", () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

  afterEach(() => vi.clearAllMocks());

  /** A count response: one row, true total after the slash. */
  function counted(contentRange: string | null, ok = true): void {
    mockFetch.mockResolvedValue({
      ok,
      headers: { get: (k: string) => (k === "content-range" ? contentRange : null) },
    } as unknown as Response);
  }

  it("reads the true total, not the number of rows returned", async () => {
    // This is the whole point: 21,328 analytics events existed and the health
    // check reported 1,000, because it measured a response body instead of
    // asking for a count.
    counted("0-0/21328");
    await expect(countRows("/rest/v1/analytics_event?select=id")).resolves.toBe(21328);
  });

  it("asks for a count and for no rows", async () => {
    counted("0-0/2061");
    await countRows("/rest/v1/survey_submission?select=id");
    const headers = (mockFetch.mock.calls[0]?.[1] as { headers: Record<string, string> }).headers;
    expect(headers.Prefer).toBe("count=exact");
    // Without this the body is still up to 1,000 rows of payload for a number.
    expect(headers.Range).toBe("0-0");
  });

  it("never fires the truncation warning it exists to prevent", async () => {
    counted("0-0/21328");
    await countRows("/rest/v1/analytics_event?select=id");
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("returns null rather than 0 when the count cannot be read", async () => {
    // A failed count and an empty table must not look the same: 0 would read as
    // a dead funnel and trip every degraded check at once.
    counted(null);
    await expect(countRows("/rest/v1/payment?select=id")).resolves.toBeNull();

    counted("0-0/*");
    await expect(countRows("/rest/v1/payment?select=id")).resolves.toBeNull();

    counted("0-0/2061", false);
    await expect(countRows("/rest/v1/payment?select=id")).resolves.toBeNull();
  });
});

describe("fetchAllRows — for callers that need the rows", () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

  afterEach(() => vi.clearAllMocks());

  function pages(...bodies: unknown[][]): void {
    let i = 0;
    mockFetch.mockImplementation(async () => {
      const body = bodies[i++] ?? [];
      return {
        ok: true,
        headers: { get: () => null },
        json: async () => body,
      } as unknown as Response;
    });
  }

  it("keeps asking until a short page, so the cap stops being the answer", async () => {
    const full = Array.from({ length: POSTGREST_MAX_ROWS }, (_, i) => ({ id: i }));
    pages(full, full, [{ id: 9999 }]);

    const rows = await fetchAllRows<{ id: number }>(
      "/rest/v1/report_session?select=id&order=id.asc"
    );

    expect(rows).toHaveLength(POSTGREST_MAX_ROWS * 2 + 1);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("asks for each page by range", async () => {
    const full = Array.from({ length: POSTGREST_MAX_ROWS }, (_, i) => ({ id: i }));
    pages(full, []);
    await fetchAllRows("/rest/v1/report_session?select=id&order=id.asc");
    const ranges = mockFetch.mock.calls.map(
      (c) => (c[1] as { headers: Record<string, string> }).headers.Range
    );
    expect(ranges).toEqual(["0-999", "1000-1999"]);
  });

  it("refuses a path with no deterministic order", async () => {
    // Without ORDER BY, Postgres may return rows in a different physical order
    // between requests, so pages overlap or skip and the result is quietly
    // wrong in a way that looks like flaky data.
    await expect(fetchAllRows("/rest/v1/report_session?select=id")).rejects.toThrow(/order=/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null on a failed page rather than a partial array", async () => {
    // A partial array is exactly the bug this family is made of.
    const full = Array.from({ length: POSTGREST_MAX_ROWS }, (_, i) => ({ id: i }));
    let i = 0;
    mockFetch.mockImplementation(async () => {
      const ok = i++ === 0;
      return { ok, headers: { get: () => null }, json: async () => full } as unknown as Response;
    });
    await expect(
      fetchAllRows("/rest/v1/report_session?select=id&order=id.asc")
    ).resolves.toBeNull();
  });
});

describe("deliberate pagination is not a truncation", () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

  afterEach(() => vi.clearAllMocks());

  it("stays quiet for every page fetchAllRows asks for", async () => {
    // A FULL page is exactly what deliberate pagination looks like: 1,000 rows
    // with a `0-999/…` content-range. The guard already exempts an explicit
    // `limit=1000`, but fetchAllRows pages with Range headers instead, so
    // without the flag every page of every paginated read fires the warning —
    // and the one signal this whole family of bugs depends on starts crying
    // wolf on correct code.
    const full = Array.from({ length: POSTGREST_MAX_ROWS }, (_, i) => ({ id: i }));
    let i = 0;
    mockFetch.mockImplementation(async () => ({
      ok: true,
      headers: { get: (k: string) => (k === "content-range" ? "0-999/5000" : null) },
      json: async () => (i++ === 0 ? full : []),
    }));

    await fetchAllRows("/rest/v1/report_session?select=id&order=id.asc");

    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("still warns for an ordinary read that came back capped", async () => {
    // The positive control: suppressing the warning for pagination must not
    // suppress it for everyone.
    respond(`0-${POSTGREST_MAX_ROWS - 1}/*`);
    await supabaseFetch("/rest/v1/survey_behavior_event?select=id");
    expect(mockWarn).toHaveBeenCalled();
  });
});

describe("the large-Range backlog only shrinks", () => {
  it("does not grow", async () => {
    // `Range: "0-49999"` reads as "up to fifty thousand rows" and returns a
    // thousand, silently. 136 such reads remain. NONE of them is now a wholly
    // unfiltered read of a table already past the cap — all fifteen of those are
    // fixed. What is left is filtered or windowed, so each one is only latent:
    // it becomes wrong on the day its window first exceeds 1,000 rows. They are being migrated to countRows (for a
    // number) and fetchAllRows (for the rows).
    //
    // This number may only go DOWN. If a change makes it go up, that change is
    // adding a query that is wrong the day it ships.
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync(
      "bash",
      [
        "-c",
        `grep -rn 'Range: "0-[0-9]\\{4,\\}"' features app scripts 2>/dev/null | grep -v node_modules | grep -vc '/tests/'`,
      ],
      { encoding: "utf8", cwd: process.cwd() }
    ).trim();
    expect(Number(out)).toBeLessThanOrEqual(136);
  });
});
