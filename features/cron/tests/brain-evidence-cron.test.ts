import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let result = { looked: 10, written: 3, belowFloor: 7, failed: 0 };
let throws = false;
const calls: Array<{ constructs: number; dayIndex: number }> = [];
vi.mock("@features/brain/server/ingest/evidence", async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown>;
  return {
    ...real,
    ingestEvidence: vi.fn(async (constructs: string[], dayIndex: number) => {
      calls.push({ constructs: constructs.length, dayIndex });
      if (throws) throw new Error("europe pmc exploded");
      return result;
    }),
  };
});

let prodHost = true;
vi.mock("@shared/http/is-prod-cron-host", () => ({ isProdCronHost: () => prodHost }));

let authOk = true;
const recorded: Array<{ name: string; status: string; error?: string }> = [];
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  verifyCronAuth: () => authOk,
  startCronTimer: () => async () => {},
  recordCronRun: async (name: string, _s: number, status: string, error?: string) => {
    recorded.push({ name, status, error });
  },
  tryClaimSlackAlert: async () => true,
  markSlackAlertDelivered: async () => {},
}));

const posted: Array<{ text: string }> = [];
vi.mock("@shared/observability/slack", () => ({
  notifySlack: async (i: { text: string }) => {
    posted.push(i);
  },
  escapeSlack: (s: string) => s,
}));

import { GET } from "@/app/api/cron/brain-evidence/route";

const req = () => new Request("https://www.loveiq.org/api/cron/brain-evidence");

describe("brain-evidence cron", () => {
  beforeEach(() => {
    result = { looked: 10, written: 3, belowFloor: 7, failed: 0 };
    throws = false;
    prodHost = true;
    authOk = true;
    calls.length = 0;
    recorded.length = 0;
    posted.length = 0;
  });

  it("refuses an unauthenticated call", async () => {
    authOk = false;
    expect((await GET(req())).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("does nothing on staging, which shares this database", async () => {
    prodHost = false;
    expect((await (await GET(req())).json()).skipped).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("feeds it the researchable constructs, not the whole glossary", async () => {
    // The measurement vocabulary is excluded — there is no literature on our own apparatus.
    await GET(req());
    expect(calls).toHaveLength(1);
    expect(calls[0]!.constructs).toBeGreaterThan(200);
    expect(calls[0]!.constructs).toBeLessThan(323);
  });

  it("indexes the day by EPOCH days, not day-of-month", async () => {
    /**
     * `getDate()` returns 1-31, so slot 0 would never be visited and, in a thirty-slot
     * cycle, the same handful of slots would repeat every month — a few constructs
     * refreshed twice each month and the rest never touched at all.
     */
    await GET(req());
    const expected = Math.floor(Date.now() / 86_400_000);
    expect(calls[0]!.dayIndex).toBeGreaterThan(20_000);
    expect(Math.abs(calls[0]!.dayIndex - expected)).toBeLessThanOrEqual(1);
  });

  it("records what the run did, including how much the literature did not know", async () => {
    await GET(req());
    expect(recorded[0]!.status).toBe("success");
    expect(recorded[0]!.error).toContain("3 written");
    expect(recorded[0]!.error).toContain("7 below the evidence floor");
  });

  it("stays quiet when the literature is simply thin", async () => {
    // `belowFloor` is the finding this source exists to surface, not a fault. Alerting on
    // it would fire nearly every day and be muted within a week.
    result = { looked: 10, written: 0, belowFloor: 10, failed: 0 };
    await GET(req());
    expect(posted).toHaveLength(0);
    expect(recorded[0]!.status).toBe("success");
  });

  it("alerts when every search failed, because that looks identical to a quiet day", async () => {
    result = { looked: 10, written: 0, belowFloor: 0, failed: 10 };
    await GET(req());
    expect(recorded[0]!.status).toBe("error");
    expect(posted).toHaveLength(1);
    expect(posted[0]!.text).toContain("could not reach Europe PMC");
  });

  it("does not alert when only some searches failed", async () => {
    // One flaky request is not an outage, and a job that cries on every blip gets ignored.
    result = { looked: 10, written: 2, belowFloor: 5, failed: 3 };
    await GET(req());
    expect(posted).toHaveLength(0);
    expect(recorded[0]!.status).toBe("success");
  });

  it("does not divide by a zero slice", async () => {
    // A slice can legitimately be empty; `failed === looked` would then be 0 === 0.
    result = { looked: 0, written: 0, belowFloor: 0, failed: 0 };
    await GET(req());
    expect(posted).toHaveLength(0);
    expect(recorded[0]!.status).toBe("success");
  });

  it("survives a throw and still records the run", async () => {
    throws = true;
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(false);
    expect(recorded[0]!.status).toBe("error");
    expect(recorded[0]!.error).toContain("europe pmc exploded");
  });
});
