import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@shared/http/google-oauth", () => ({
  getGoogleAccessToken: vi.fn(async () => "test-access-token"),
  isGoogleConfigured: () => true,
  googleScopeHint: () => null,
  GA4_SCOPE: "ga4",
  SEARCH_CONSOLE_SCOPE: "gsc",
}));

/** Existing chunk ids the DB should report, and every list call made. */
let existingIds: string[] = [];
let listOk = true;
const listCalls: string[] = [];

vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async (path: string) => {
    listCalls.push(path);
    if (!listOk) return { ok: false, status: 500, json: async () => ({}) };
    const offset = Number(/offset=(\d+)/.exec(path)?.[1] ?? 0);
    const page = existingIds.slice(offset, offset + 1000).map((id) => ({ source_id: id }));
    return { ok: true, status: 200, json: async () => page };
  }),
}));

const upsertChunks = vi.fn(async (rows: Array<{ source_id: string }>) => rows.length);
const touchChunks = vi.fn(async (_s: string, ids: string[]) => ids.length);
const sweepStale = vi.fn(async () => 0);
vi.mock("@features/brain/server/ingest/upsert", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  upsertChunks: (...a: unknown[]) => upsertChunks(...(a as [never])),
  touchChunks: (...a: unknown[]) => touchChunks(...(a as [never, never])),
  sweepStale: (...a: unknown[]) => sweepStale(...(a as [])),
}));

/** A GA4 runReport response for `days` recent days. */
function ga4Days(days: number) {
  const rows = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.UTC(2026, 7, 27 - i));
    return {
      dimensionValues: [{ value: d.toISOString().slice(0, 10).replace(/-/g, "") }],
      metricValues: [{ value: "10" }, { value: "5" }, { value: "1" }, { value: "0" }],
    };
  });
  return { rows, rowCount: rows.length };
}

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () =>
      String(url).includes("searchconsole")
        ? { rows: [{ keys: ["2026-08-25"], clicks: 1, impressions: 10, position: 3 }] }
        : ga4Days(10),
    text: async () => "",
  })),
}));

import { ingestGa4 } from "@features/brain/server/ingest/google";

const STAMP = "2026-08-28T04:47:00.000Z";

describe("the nightly window must not delete the history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listCalls.length = 0;
    listOk = true;
    process.env.GA4_PROPERTY_ID = "123456";
    process.env.SEARCH_CONSOLE_SITE = "sc-domain:loveiq.org";
  });

  it("touches every chunk the 10-day window did not rewrite", async () => {
    // THE failure this guards: the corpus is 16 months deep but a run only
    // rewrites 10 days, and the sweep deletes anything it does not see. Without
    // touching, every night would delete the history and the corpus would sit
    // permanently 10 days deep.
    existingIds = [
      "daily:2026-01-15",
      "daily:2026-02-20",
      "monthly:2026-01",
      "weekly:2026-W03",
      "daily:2026-08-27", // inside the window — will be rewritten
    ];
    await ingestGa4(STAMP);

    expect(touchChunks).toHaveBeenCalledTimes(1);
    const [source, ids] = touchChunks.mock.calls[0] as unknown as [string, string[]];
    expect(source).toBe("ga4");
    expect(ids).toContain("daily:2026-01-15");
    expect(ids).toContain("monthly:2026-01");
    expect(ids).not.toContain("daily:2026-08-27");
  });

  it("counts touched rows toward the sweep, or the guard refuses a healthy run", async () => {
    existingIds = Array.from({ length: 500 }, (_, i) => `daily:2025-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`);
    await ingestGa4(STAMP);
    const [, , total] = sweepStale.mock.calls[0] as unknown as [string, string, number];
    const written = await upsertChunks.mock.results[0].value;
    expect(total).toBeGreaterThan(written);
  });

  it("pages the existing-id read, because PostgREST caps a response at 1000 rows", async () => {
    // A 16-month corpus passes 1,000 rows as history accumulates. An unpaginated
    // read would stop confirming the oldest chunks and the sweep would eat them.
    existingIds = Array.from({ length: 1500 }, (_, i) => `daily:old-${i}`);
    await ingestGa4(STAMP);
    const offsets = listCalls.map((p) => Number(/offset=(\d+)/.exec(p)?.[1] ?? -1));
    expect(offsets).toContain(0);
    expect(offsets).toContain(1000);
    const [, ids] = touchChunks.mock.calls[0] as unknown as [string, string[]];
    expect(ids.length).toBe(1500);
  });

  it("fails CLOSED when the existing-id read errors", async () => {
    // Returning an inflated count would let the sweep run against a source it
    // could not see. Returning 0 makes sweepStale see a small run against a
    // large source, and it refuses a majority deletion — the history survives.
    existingIds = ["daily:2026-01-15"];
    listOk = false;
    await ingestGa4(STAMP);
    expect(touchChunks).not.toHaveBeenCalled();
    const [, , total] = sweepStale.mock.calls[0] as unknown as [string, string, number];
    const written = await upsertChunks.mock.results[0].value;
    expect(total).toBe(written);
  });

  it("asks GA4 for the nightly window by default and the backfill window on request", async () => {
    existingIds = [];
    const { fetchWithTimeout } = await import("@shared/http/fetch-with-timeout");
    await ingestGa4(STAMP);
    const nightly = vi.mocked(fetchWithTimeout).mock.calls.map(([, init]) => String((init as { body?: string })?.body ?? ""));
    expect(nightly.some((b) => b.includes("10daysAgo"))).toBe(true);

    vi.mocked(fetchWithTimeout).mockClear();
    await ingestGa4(STAMP, () => false, 480);
    const back = vi.mocked(fetchWithTimeout).mock.calls.map(([, init]) => String((init as { body?: string })?.body ?? ""));
    expect(back.some((b) => b.includes("480daysAgo"))).toBe(true);
  });
});
