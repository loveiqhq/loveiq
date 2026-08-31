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

describe("a day this job failed must be recoverable", () => {
  /**
   * The schedule only ever asks for YESTERDAY, so a day the job fails is lost forever.
   * That happened on the very first run: 2026-08-31 06:11 died on a 45s model timeout
   * and 2026-08-30's brief was never posted, with nothing able to retry it.
   *
   * `?day=` closes that, guarded: same cron bearer as everything else, and no future
   * dates. The per-day claim still applies, so a replay cannot double-post.
   */
  const dayReq = (d: string) => new Request(`https://www.loveiq.org/api/cron/brain-brief?day=${d}`);

  it("builds the brief for an explicitly requested past day", async () => {
    const res = await dayReq("2026-08-30");
    const out = await GET(res);
    expect(out.status).toBe(200);
    expect(await out.json()).toMatchObject({ day: "2026-08-30", sent: true });
  });

  it("ignores a future day and falls back to yesterday", async () => {
    // A future day has no sources in yet, so honouring it would post an empty brief
    // and burn the claim for a day that has not happened.
    const out = await GET(dayReq("2099-01-01"));
    const body = (await out.json()) as { day: string };
    expect(body.day).not.toBe("2099-01-01");
    expect(body.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("ignores a malformed day rather than passing it to the query", async () => {
    /**
     * "1" and "1999-13-45" sort BEFORE today, so the not-in-the-future check lets them
     * through and only the format check stops them. "not-a-date" does not test this at
     * all — it sorts after "2026-…" and the ordering guard rejects it, which is how the
     * first version of this test passed with the format guard deleted.
     */
    for (const bad of ["1", "1999-13-45", "2026-8-3", ""]) {
      const body = (await (await GET(dayReq(bad))).json()) as { day: string };
      expect(body.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(body.day).not.toBe(bad);
    }
  });

  it("still requires the cron bearer, so the override is not a public replay", async () => {
    authOk = false;
    const out = await GET(dayReq("2026-08-30"));
    expect(out.status).toBe(401);
  });
});
