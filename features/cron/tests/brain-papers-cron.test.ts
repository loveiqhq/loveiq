import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const ok = () => ({
  constructs: 9,
  searches: 9,
  failedSearches: 0,
  written: 3,
  parts: 95,
  skipped: { stored: 2, license: 1, noText: 1, tooLong: 0, unread: 0, withheld: 1 },
});
let result = ok();
let throws = false;
const calls: Array<{ constructs: number; dayIndex: number }> = [];
vi.mock("@features/brain/server/ingest/papers", async (importOriginal) => {
  const real = (await importOriginal()) as Record<string, unknown>;
  return {
    ...real,
    ingestPapers: vi.fn(async (constructs: string[], dayIndex: number) => {
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

import { GET } from "@/app/api/cron/brain-papers/route";

const req = () => new Request("https://www.loveiq.org/api/cron/brain-papers");

describe("brain-papers cron", () => {
  beforeEach(() => {
    result = ok();
    throws = false;
    prodHost = true;
    authOk = true;
    calls.length = 0;
    recorded.length = 0;
    posted.length = 0;
  });

  it("refuses an unauthenticated call, and does nothing outside production", async () => {
    authOk = false;
    expect((await GET(req())).status).toBe(401);
    authOk = true;
    prodHost = false;
    expect((await (await GET(req())).json()).skipped).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("works through the researchable constructs by epoch day, like brain-evidence", async () => {
    await GET(req());
    expect(calls[0]!.constructs).toBeGreaterThan(200);
    expect(calls[0]!.constructs).toBeLessThan(323);
    expect(Math.abs(calls[0]!.dayIndex - Math.floor(Date.now() / 86_400_000))).toBeLessThanOrEqual(
      1
    );
  });

  it("records what it wrote and why it skipped what it skipped", async () => {
    await GET(req());
    expect(recorded[0]).toMatchObject({ name: "brain-papers", status: "success" });
    expect(recorded[0]!.error).toContain("3 of up to 12 papers written (95 parts)");
    expect(recorded[0]!.error).toContain("1 on the license");
    expect(recorded[0]!.error).toContain("2 already stored");
    expect(recorded[0]!.error).toContain("1 withheld for a credential");
    expect(posted).toHaveLength(0);
  });

  it("alerts when every search failed, and stays quiet when only some did", async () => {
    result = { ...ok(), written: 0, failedSearches: 4 };
    await GET(req());
    expect(posted).toHaveLength(0);
    result = { ...ok(), written: 0, failedSearches: 9 };
    await GET(req());
    expect(recorded.at(-1)!.status).toBe("error");
    expect(posted).toHaveLength(1);
    expect(posted[0]!.text).toContain("could not reach Europe PMC");
  });

  it("does not call an empty slice an outage", async () => {
    result = { ...ok(), constructs: 0, searches: 0, written: 0 };
    await GET(req());
    expect(posted).toHaveLength(0);
    expect(recorded[0]!.status).toBe("success");
  });

  it("survives a throw, records the run, and says so in #brain", async () => {
    throws = true;
    const res = await GET(req());
    expect((await res.json()).ok).toBe(false);
    expect(recorded[0]).toMatchObject({ status: "error", error: "europe pmc exploded" });
    expect(posted).toHaveLength(1);
    expect(posted[0]!.text).toContain("brain-papers stopped with an error: europe pmc exploded");
  });
});
