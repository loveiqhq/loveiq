import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@shared/http/google-oauth", () => ({
  getGoogleAccessToken: vi.fn(async () => "token"),
  isGoogleConfigured: () => true,
  googleCredentialShape: () => "test",
  GA4_SCOPE: "ga4",
  SEARCH_CONSOLE_SCOPE: "gsc",
}));

vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async (path: string) => {
    if (String(path).includes("brain_sweep_state")) {
      return { ok: true, status: 200, json: async () => [] };
    }
    return { ok: true, status: 200, json: async () => [] };
  }),
}));

/** Rows the ingester tried to write, so the assertion is about real output. */
const written: Array<{ source_id: string; body: string; title: string }> = [];
vi.mock("@features/brain/server/ingest/upsert", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  upsertChunks: vi.fn(async (rows: Array<{ source_id: string; body: string; title: string }>) => {
    written.push(...rows);
    return rows.length;
  }),
  touchChunks: vi.fn(async (_s: string, ids: string[]) => ids.length),
  sweepStale: vi.fn(async () => 0),
  sweepMissing: vi.fn(async () => 0),
}));

/**
 * THE EXACT SHAPE THAT CORRUPTED AUGUST.
 *
 * One day of the finished month (31 August) plus the running month. That is what the
 * fetch window really contains on 11 September: `windowCoveringWholePeriods` pulls back
 * to cover the whole WEEK containing 1 September, and that week starts 31 August.
 */
function ga4Rows() {
  const days = ["20260831"];
  for (let d = 1; d <= 11; d++) days.push(`202609${String(d).padStart(2, "0")}`);
  return {
    rows: days.map((value) => ({
      dimensionValues: [{ value }],
      metricValues: [{ value: "215" }, { value: "209" }, { value: "204" }, { value: "36" }],
    })),
    rowCount: days.length,
  };
}

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async () => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ga4Rows(),
    text: async () => "",
  })),
}));

import { ingestGa4 } from "@features/brain/server/ingest/google";

/**
 * Measured in production on 2026-09-11: the ga4 August row read 215 sessions and
 * EUR 34.47 while its own 31 daily rows summed to 3,530 and EUR 1,252.97 — understated
 * sixteenfold, and labelled "whole month" because the only check was
 * `lastDay >= monthEnd` and 31 August IS the month end. August's campaign breakdown went
 * with it, so "how much did the brand campaign cost" stopped having an answer.
 *
 * The widening helper cannot prevent this: covering the whole week containing the window
 * start is precisely what drags the trailing day of the previous month in.
 */
describe("a finished month the window only clipped is left alone", () => {
  beforeEach(() => {
    written.length = 0;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T04:47:00Z"));
    process.env.GA4_PROPERTY_ID = "123";
  });

  it("writes no monthly row for the month it only has one day of", async () => {
    await ingestGa4("2026-09-11T04:47:00.000Z");
    vi.useRealTimers();

    const august = written.find((r) => r.source_id === "monthly:2026-08");
    expect(
      august,
      `August was rebuilt from a partial fetch: ${august?.body?.slice(0, 90)}`
    ).toBeUndefined();

    // The running month is still written, and honestly labelled.
    const september = written.find((r) => r.source_id === "monthly:2026-09");
    expect(september, "the current month must still be written").toBeDefined();
    expect(september!.body).toMatch(/month so far/);
    expect(september!.body).not.toMatch(/whole month/);

    // And the day rows are untouched — only aggregates are guarded.
    expect(written.some((r) => r.source_id === "daily:2026-08-31")).toBe(true);
  });
});
