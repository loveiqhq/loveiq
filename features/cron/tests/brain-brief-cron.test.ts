import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let brief: { text: string; chunks: unknown[]; day: string } | null = null;
let briefThrows = false;
vi.mock("@features/brain/server/brief", () => ({
  buildDailyBrief: vi.fn(async (day: string) => {
    if (briefThrows) throw new Error("corpus down");
    return brief ? { ...brief, day } : null;
  }),
}));

let prodHost = true;
vi.mock("@shared/http/is-prod-cron-host", () => ({ isProdCronHost: () => prodHost }));

let authOk = true;
let claimGranted = true;
const marked: string[] = [];
const recorded: Array<{ name: string; status: string }> = [];
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  verifyCronAuth: () => authOk,
  startCronTimer: () => async () => {},
  recordCronRun: async (name: string, _s: number, status: string) => {
    recorded.push({ name, status });
  },
  tryClaimSlackAlert: async () => claimGranted,
  markSlackAlertDelivered: async (key: string) => {
    marked.push(key);
  },
}));

const posted: Array<{ channel: string; text: string }> = [];
vi.mock("@shared/observability/slack", () => ({
  notifySlack: async (i: { channel: string; text: string }) => {
    posted.push(i);
  },
  escapeSlack: (s: string) => s,
}));

import { GET } from "@/app/api/cron/brain-brief/route";

const req = () => new Request("https://www.loveiq.org/api/cron/brain-brief");

beforeEach(() => {
  authOk = true;
  prodHost = true;
  claimGranted = true;
  briefThrows = false;
  brief = {
    text: "Pricing moved to 39.99 [1].",
    chunks: [{ source: "commit", sourceId: "c1", title: "pricing", url: "https://x.test/1" }],
    day: "",
  };
  posted.length = 0;
  marked.length = 0;
  recorded.length = 0;
});

describe("/api/cron/brain-brief", () => {
  it("posts what the brain noticed, with its sources", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(posted).toHaveLength(1);
    expect(posted[0]?.text).toContain("39.99");
  });

  /**
   * The single most important behaviour here. A daily brief that posts something
   * every day gets muted within a fortnight, and then the day it matters nobody
   * reads it either. On a routine day this must be completely silent.
   */
  it("posts NOTHING on a routine day", async () => {
    brief = null;
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(posted).toHaveLength(0);
    expect(await res.json()).toMatchObject({ sent: false, reason: "nothing-notable" });
  });

  it("still marks a quiet day delivered, so it is not re-decided on every retry", async () => {
    brief = null;
    await GET(req());
    expect(marked).toContain("brain_brief");
  });

  it("does not post twice for the same day", async () => {
    claimGranted = false;
    await GET(req());
    expect(posted).toHaveLength(0);
    expect(await (await GET(req())).json()).toMatchObject({ reason: "already-sent" });
  });

  it("refuses an unauthenticated call", async () => {
    authOk = false;
    expect((await GET(req())).status).toBe(401);
  });

  it("does not double-write from the staging deployment", async () => {
    prodHost = false;
    await GET(req());
    expect(posted).toHaveLength(0);
  });

  it("records a failure rather than swallowing it — a silent job must be watchable", async () => {
    briefThrows = true;
    expect((await GET(req())).status).toBe(500);
    expect(recorded.at(-1)).toMatchObject({ name: "brain-brief", status: "error" });
  });

  it("records a run even on a quiet day, which is what the stall watchdog sees", async () => {
    brief = null;
    await GET(req());
    expect(recorded.at(-1)).toMatchObject({ name: "brain-brief", status: "success" });
  });
});
