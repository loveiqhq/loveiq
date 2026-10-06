import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let result: { ok: boolean; rows: number; pages: number; reason?: string } = {
  ok: true,
  rows: 1,
  pages: 4,
};
let ingestThrows = false;
const ingestCalls: Array<{ day: string; stampedAt: string }> = [];
vi.mock("@features/brain/server/ingest/clarity", () => ({
  ingestClarity: vi.fn(async (day: string, stampedAt: string) => {
    ingestCalls.push({ day, stampedAt });
    if (ingestThrows) throw new Error("clarity exploded");
    return result;
  }),
}));

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

const posted: Array<{ channel: string; text: string }> = [];
vi.mock("@shared/observability/slack", () => ({
  notifySlack: async (i: { channel: string; text: string }) => {
    posted.push(i);
  },
  escapeSlack: (s: string) => s,
}));

import { GET } from "@/app/api/cron/brain-clarity/route";

const req = () => new Request("https://www.loveiq.org/api/cron/brain-clarity");

describe("brain-clarity cron", () => {
  beforeEach(() => {
    result = { ok: true, rows: 1, pages: 4 };
    ingestThrows = false;
    prodHost = true;
    authOk = true;
    ingestCalls.length = 0;
    recorded.length = 0;
    posted.length = 0;
  });

  it("refuses an unauthenticated call", async () => {
    authOk = false;
    expect((await GET(req())).status).toBe(401);
    // And spends nothing: the budget is ten requests a day.
    expect(ingestCalls).toHaveLength(0);
  });

  it("does nothing on staging, which shares this database AND this API budget", async () => {
    prodHost = false;
    const body = await (await GET(req())).json();
    expect(body.skipped).toBe(true);
    expect(ingestCalls).toHaveLength(0);
  });

  it("reads the window ending YESTERDAY, not a partial today", async () => {
    /**
     * The API returns the last three days INCLUDING a partial today. Dating that window
     * as though it were complete is how a half-counted figure gets quoted as a whole one.
     */
    await GET(req());
    expect(ingestCalls).toHaveLength(1);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    expect(ingestCalls[0]!.day).toBe(yesterday);
  });

  it("records what the run actually did", async () => {
    await GET(req());
    expect(recorded).toEqual([
      {
        name: "brain-clarity",
        status: "success",
        error: "4 pages with a signal, 1 row(s) written",
      },
    ]);
    expect(posted).toHaveLength(0);
  });

  it.each(["no_token", "daily_cap"])("treats %s as a skip, not a fault", async (reason) => {
    /**
     * No token is the unconfigured state. `daily_cap` means a person spent the ten by
     * hand — tomorrow's run gets a fresh budget and the window is three days wide, so
     * nothing is actually lost. Alerting on either would train the reader to ignore it.
     */
    result = { ok: false, rows: 0, pages: 0, reason };
    await GET(req());
    expect(posted).toHaveLength(0);
    expect(recorded[0]!.status).toBe("success");
    expect(recorded[0]!.error).toBe(`skipped: ${reason}`);
  });

  it("alerts on a real export failure, which otherwise looks like nothing happening", async () => {
    result = { ok: false, rows: 0, pages: 0, reason: "http_403" };
    await GET(req());
    expect(recorded[0]!.status).toBe("error");
    expect(posted).toHaveLength(1);
    expect(posted[0]!.text).toContain("http_403");
    // Says the shape of the failure: Clarity keeps recording, so nothing looks broken.
    expect(posted[0]!.text).toContain("not look broken");
  });

  it("survives a throw, and still records the run", async () => {
    ingestThrows = true;
    const res = await GET(req());
    // 200, so Vercel does not retry — a retry would spend another of the ten.
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(false);
    expect(recorded[0]!.status).toBe("error");
    expect(recorded[0]!.error).toContain("clarity exploded");
  });
});
