import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockIngest = vi.fn();
vi.mock("@features/brain/server/ingest/notion", () => ({
  ingestNotion: (...a: unknown[]) => mockIngest(...(a as [])),
}));

/** What `sweptAt("notion")` answers: ms, null (never swept) or undefined (unreadable). */
let lastSweep: number | null | undefined;
vi.mock("@features/brain/server/ingest/upsert", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/brain/server/ingest/upsert")>()),
  sweptAt: async () => lastSweep,
}));

vi.mock("@shared/http/is-prod-cron-host", () => ({ isProdCronHost: () => true }));

const recorded: Array<{ status: string; error?: string }> = [];
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  verifyCronAuth: () => true,
  startCronTimer: () => async () => {},
  recordCronRun: async (_n: string, _s: number, status: string, error?: string) => {
    recorded.push({ status, error });
  },
  tryClaimSlackAlert: async () => true,
  markSlackAlertDelivered: async () => {},
}));

const notified: Array<{ text: string }> = [];
vi.mock("@shared/observability/slack", () => ({
  notifySlack: async (i: { text: string }) => {
    notified.push(i);
  },
  escapeSlack: (s: string) => s,
}));

import { GET } from "@/app/api/cron/brain-notion/route";

const req = () => new Request("https://www.loveiq.org/api/cron/brain-notion");
const HOUR = 3_600_000;
const partial = { source: "notion", rows: 1621, swept: 0, skipped: "notion-crawl-incomplete" };

describe("/api/cron/brain-notion: a partial crawl is judged by the sweep", () => {
  beforeEach(() => {
    recorded.length = 0;
    notified.length = 0;
    mockIngest.mockReset();
  });

  it("records a partial crawl as success with a note while the sweep ran recently", async () => {
    // Seven of these in the fortnight to 2026-10-05 each alerted "Notion is frozen", and
    // each was followed by a complete crawl within the hour, the sweep still running daily.
    mockIngest.mockResolvedValue(partial);
    lastSweep = Date.now() - 10 * HOUR;
    await GET(req());
    expect(recorded).toEqual([
      { status: "success", error: expect.stringMatching(/^partial crawl, sweep deferred/) },
    ]);
    expect(recorded[0]!.error).toContain("rows=1621");
    expect(notified).toHaveLength(0);
  });

  it("fails and alerts once the sweep has not run for 26 hours", async () => {
    mockIngest.mockResolvedValue(partial);
    lastSweep = Date.now() - 26 * HOUR - 60_000;
    await GET(req());
    expect(recorded[0]!.status).toBe("error");
    expect(notified).toHaveLength(1);
    expect(notified[0]!.text).toMatch(/deletion sweep has not run for over 26 hours/);
    expect(notified[0]!.text).toMatch(/pages deleted there are staying in the corpus/);

    recorded.length = 0;
    notified.length = 0;
    lastSweep = Date.now() - 25 * HOUR;
    await GET(req());
    expect(recorded[0]!.status).toBe("success");
    expect(notified).toHaveLength(0);
  });

  it("fails closed when the sweep state is unreadable or has no row", async () => {
    mockIngest.mockResolvedValue(partial);
    for (const state of [undefined, null]) {
      recorded.length = 0;
      notified.length = 0;
      lastSweep = state;
      await GET(req());
      expect(recorded[0]!.status).toBe("error");
      expect(recorded[0]!.error).toContain("last sweep unknown");
      expect(notified).toHaveLength(1);
    }
  });

  it("still fails and alerts on any other skip", async () => {
    mockIngest.mockResolvedValue({ source: "notion", rows: 0, swept: 0, skipped: "x-broke" });
    lastSweep = Date.now();
    await GET(req());
    expect(recorded[0]!.status).toBe("error");
    expect(notified[0]!.text).toMatch(/brain-notion skipped \(x-broke\)/);
  });

  it("gives the walk 75 seconds, leaving the tail its room under the 120 s ceiling", async () => {
    let stop: (() => boolean) | undefined;
    mockIngest.mockImplementation(async (_at: string, isOutOfTime: () => boolean) => {
      stop = isOutOfTime;
      return { source: "notion", rows: 1, swept: 0 };
    });
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      await GET(req());
      clock.mockReturnValue(now + 75_000);
      expect(stop!()).toBe(false);
      clock.mockReturnValue(now + 75_001);
      expect(stop!()).toBe(true);
    } finally {
      clock.mockRestore();
    }
  });
});
