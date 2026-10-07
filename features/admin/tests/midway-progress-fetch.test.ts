import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { fetchMidwayProgress } from "@features/admin/server/conversion-digest";

const answer = (body: unknown) =>
  mockSupabaseFetch.mockResolvedValueOnce({ ok: true, json: async () => body });

/**
 * Migration 20261007190000 makes get_midway_progress_daily count finished surveys and
 * return how many as `finished`. The digest reads the deciding number one way when the
 * field is there and the old way when it is not, so the fetcher must keep "absent"
 * distinct from 0: a 0 would make an unmigrated function look migrated and drop every
 * finisher from the landing test's count.
 */
describe("fetchMidwayProgress", () => {
  beforeEach(() => mockSupabaseFetch.mockReset());

  it("passes `finished` through where the function returns it", async () => {
    answer({
      overall: { sessions: 310, reached: 130, finished: 10 },
      daily: [{ day: "2026-10-08", arm: "white_video", sessions: 9, reached: 4, finished: 1 }],
      totals: [{ arm: "white_video", sessions: 76, reached: 31, finished: 6 }],
      midwayIndex: 1,
      firstArmDay: "2026-09-19",
    });
    const m = await fetchMidwayProgress("2026-09-08T22:00:00Z", "2026-10-08T22:00:00Z", 1);
    expect(m?.overall).toEqual({ sessions: 310, reached: 130, finished: 10 });
    expect(m?.totals[0]).toEqual({ arm: "white_video", sessions: 76, reached: 31, finished: 6 });
    expect(m?.daily[0]?.finished).toBe(1);
  });

  it("leaves `finished` absent, not zero, when the function predates it", async () => {
    answer({
      overall: { sessions: 300, reached: 120 },
      daily: [{ day: "2026-10-08", arm: "white_video", sessions: 9, reached: 4 }],
      totals: [{ arm: "white_video", sessions: 70, reached: 25 }],
      midwayIndex: 1,
      firstArmDay: "2026-09-19",
    });
    const m = await fetchMidwayProgress("2026-09-08T22:00:00Z", "2026-10-08T22:00:00Z", 1);
    expect(m?.overall).not.toHaveProperty("finished");
    expect(m?.totals[0]).not.toHaveProperty("finished");
    expect(m?.daily[0]).not.toHaveProperty("finished");
  });
});
