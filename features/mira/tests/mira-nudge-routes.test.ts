import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(),
  fetchAllRows: vi.fn(),
}));
vi.mock("@features/mira/server/store", () => ({ logMiraEvent: vi.fn(), addMessages: vi.fn() }));
vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@shared/http/is-prod-cron-host", () => ({
  isProdCronHost: vi.fn().mockReturnValue(true),
}));
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  recordCronRun: vi.fn(),
  startCronTimer: vi.fn().mockReturnValue(async () => {}),
}));
// The daily journal's reminders run in the same cron; mira-journal-reminders.test.ts covers them.
vi.mock("@features/mira/server/journal", () => ({
  runJournalReminders: vi.fn().mockResolvedValue({
    candidates: 0,
    due: 0,
    sent: 0,
    skipped: {},
    errors: 0,
    stoppedEarly: false,
  }),
}));
vi.mock("@features/mira/server/nudges", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/mira/server/nudges")>()),
  runNudges: vi.fn().mockResolvedValue({ candidates: 1, due: 1, sent: 1, skipped: {}, errors: 0 }),
}));

import { supabaseFetch } from "@features/admin/server/supabase";
import { makeToken, runNudges } from "@features/mira/server/nudges";
import { logMiraEvent } from "@features/mira/server/store";
import { verifyCsrfToken } from "@shared/http/csrf";
import { isProdCronHost } from "@shared/http/is-prod-cron-host";
import { checkRateLimit } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";
import { recordCronRun } from "@shared/observability/slack-alert-dedup";
import { GET as openNudge } from "@/app/api/mira/nudge/route";
import { GET as getPrefs, POST as postPrefs } from "@/app/api/mira/nudges/preferences/route";
import { GET as visitUnsub, POST as oneClick } from "@/app/api/mira/nudges/unsubscribe/route";
import { GET as nudgeCron } from "@/app/api/cron/mira-nudges/route";
import { GET as memoryCron } from "@/app/api/cron/mira-memory/route";

process.env.UNSUBSCRIBE_SECRET = "test-secret-for-mira-nudges-0123456789";
process.env.CRON_SECRET = "cron-secret";

const USER_ID = "11111111-2222-4333-8444-555555555555";
const NUDGE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const CHAT_ID = "99999999-8888-4777-8666-555555555555";
const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
const PREFS = {
  nudges_on: true,
  nudge_time: "08:00",
  time_zone: "Europe/Berlin",
  nudge_frequency: "daily",
  nudge_types: null,
  nudges_paused_until: null,
  nudges_stopped_at: null,
};
const patches = () =>
  vi
    .mocked(supabaseFetch)
    .mock.calls.filter(([, init]) => init?.method === "PATCH")
    .map(([path, init]) => ({ path, body: JSON.parse(String(init!.body)) }));

const post = (body: unknown) =>
  postPrefs(
    new Request("http://localhost/api/mira/nudges/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "t" },
      body: JSON.stringify(body),
    })
  );

describe("nudge preference routes", () => {
  const t = () => makeToken("prefs", USER_ID)!;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyCsrfToken).mockResolvedValue(true);
    vi.mocked(supabaseFetch).mockImplementation(async (_path, init) =>
      init?.method === "PATCH" ? json([]) : json([PREFS])
    );
  });

  it("read the person's choices only with a link we signed", async () => {
    const bad = await getPrefs(new Request("http://localhost/x?t=nope"));
    expect(bad.status).toBe(403);
    const ok = await getPrefs(new Request(`http://localhost/x?t=${encodeURIComponent(t())}`));
    expect((await ok.json()).prefs).toMatchObject({ frequency: "Every day", kinds: "All kinds" });
  });

  it("save twice a week, a 14-day pause or some kinds, each turning nudges on", async () => {
    expect((await post({ action: "save", t: t(), choice: "twice_weekly" })).status).toBe(200);
    expect(patches()[0]!.body).toMatchObject({ nudge_frequency: "twice_weekly", nudges_on: true });
    await post({ action: "save", t: t(), choice: "pause" });
    expect(Date.parse(patches()[1]!.body.nudges_paused_until)).toBeGreaterThan(
      Date.now() + 13 * 86_400_000
    );
    await post({ action: "save", t: t(), choice: "types", types: ["share", "progress"] });
    expect(patches()[2]!.body.nudge_types).toEqual(["share", "progress"]);
    expect((await post({ action: "save", t: t(), choice: "types", types: [] })).status).toBe(400);
  });

  it("stop with the one-tap reason and note, and resume", async () => {
    await post({ action: "stop", t: t(), reason: "Too many emails", note: "nice though" });
    expect(patches()[0]!.body).toMatchObject({
      nudges_on: false,
      nudge_stop_reason: "Too many emails · nice though",
    });
    expect(logMiraEvent).toHaveBeenCalledWith(
      "nudge_stopped",
      { userId: USER_ID },
      expect.anything()
    );
    await post({ action: "resume", t: t() });
    expect(patches()[1]!.body).toMatchObject({ nudges_on: true, nudges_stopped_at: null });
  });

  it("need the CSRF check and a valid link to change anything", async () => {
    vi.mocked(verifyCsrfToken).mockResolvedValueOnce(false);
    expect((await post({ action: "resume", t: t() })).status).toBe(403);
    expect((await post({ action: "resume", t: `${USER_ID}.${"x".repeat(43)}` })).status).toBe(403);
    expect(patches()).toHaveLength(0);
  });

  it("one-click unsubscribe stops every nudge without cookies; a visit only shows the page", async () => {
    const res = await oneClick(
      new Request(`http://localhost/api/mira/nudges/unsubscribe?t=${encodeURIComponent(t())}`, {
        method: "POST",
      })
    );
    expect(res.status).toBe(200);
    expect(patches()[0]!.body).toMatchObject({ nudges_on: false });
    const visit = await visitUnsub(
      new Request(`http://localhost/api/mira/nudges/unsubscribe?t=${encodeURIComponent(t())}`)
    );
    expect(visit.headers.get("location")).toContain("/mira/nudges?t=");
    expect(patches()).toHaveLength(1);
    const forged = await oneClick(
      new Request("http://localhost/api/mira/nudges/unsubscribe?t=x", { method: "POST" })
    );
    expect(forged.status).toBe(403);
  });

  it("one-click unsubscribe allows a mail provider's shared servers many people a minute", async () => {
    await oneClick(
      new Request(`http://localhost/api/mira/nudges/unsubscribe?t=${encodeURIComponent(t())}`, {
        method: "POST",
      })
    );
    const [, opts] = vi.mocked(checkRateLimit).mock.calls[0]!;
    expect(opts).toMatchObject({ bucket: "mira-nudge-unsubscribe" });
    expect(opts!.limit).toBeGreaterThanOrEqual(600);
  });
});

describe("the nudge button", () => {
  beforeEach(() => vi.clearAllMocks());

  it("counts the first click and opens the chat with the nudge in it", async () => {
    vi.mocked(supabaseFetch).mockImplementation(async (_path, init) =>
      init?.method === "PATCH"
        ? json([])
        : json([{ user_id: USER_ID, chat_id: CHAT_ID, type: "share", clicked_at: null }])
    );
    const t = encodeURIComponent(makeToken("open", NUDGE_ID)!);
    const res = await openNudge(new Request(`http://localhost/api/mira/nudge?t=${t}`));
    expect(res.headers.get("location")).toBe(`http://localhost/mira?chat=${CHAT_ID}`);
    expect(patches()[0]!.body).toHaveProperty("clicked_at");
    expect(logMiraEvent).toHaveBeenCalledWith(
      "nudge_clicked",
      { userId: USER_ID },
      { type: "share" }
    );
  });

  it("sends a forged or person-link token to Mira's page without counting", async () => {
    const t = encodeURIComponent(makeToken("prefs", NUDGE_ID)!);
    const res = await openNudge(new Request(`http://localhost/api/mira/nudge?t=${t}`));
    expect(res.headers.get("location")).toBe("http://localhost/mira");
    expect(supabaseFetch).not.toHaveBeenCalled();
  });
});

describe("the crons", () => {
  const cron = (h: Record<string, string> = { authorization: "Bearer cron-secret" }) =>
    new Request("http://localhost/api/cron/x", { headers: h });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isProdCronHost).mockReturnValue(true);
    delete process.env.MIRA_NUDGES_ENABLED;
  });

  it("send nudges only with the secret, on production, with the switch on", async () => {
    expect((await nudgeCron(cron({}))).status).toBe(401);
    expect(await (await nudgeCron(cron())).json()).toMatchObject({ reason: "nudges-off" });
    process.env.MIRA_NUDGES_ENABLED = "true";
    vi.mocked(isProdCronHost).mockReturnValueOnce(false);
    expect(await (await nudgeCron(cron())).json()).toMatchObject({ reason: "non-prod-cron-host" });
    expect(runNudges).not.toHaveBeenCalled();
    expect(await (await nudgeCron(cron())).json()).toMatchObject({ ok: true, sent: 1 });
    expect(recordCronRun).toHaveBeenLastCalledWith(
      "mira-nudges",
      expect.any(Number),
      "success",
      undefined
    );
  });

  it("give the run a time budget, and record people left out or failed as an error", async () => {
    process.env.MIRA_NUDGES_ENABLED = "true";
    const summary = { candidates: 9, due: 9, sent: 5, skipped: {}, errors: 0, stoppedEarly: true };
    vi.mocked(runNudges).mockResolvedValueOnce(summary);
    expect((await nudgeCron(cron())).status).toBe(200);
    expect(vi.mocked(runNudges).mock.calls[0]![1]?.outOfTime?.()).toBe(false);
    expect(recordCronRun).toHaveBeenLastCalledWith(
      "mira-nudges",
      expect.any(Number),
      "error",
      expect.stringContaining("stopped at the time budget")
    );
    expect(logger.error).toHaveBeenCalledTimes(1);
    vi.mocked(runNudges).mockResolvedValueOnce({ ...summary, stoppedEarly: false, errors: 2 });
    await nudgeCron(cron());
    expect(recordCronRun).toHaveBeenLastCalledWith(
      "mira-nudges",
      expect.any(Number),
      "error",
      expect.stringContaining("2 failed")
    );
  });

  it("apply the 12-month memory limit daily, and drop sign-in codes older than a day", async () => {
    // Nothing else to forget (mira-memory-cron.test.ts covers the events and the sign-ups).
    vi.mocked(supabaseFetch).mockImplementation(async () => json([]));
    vi.mocked(supabaseFetch).mockResolvedValueOnce(json(3)).mockResolvedValueOnce(json([]));
    expect(await (await memoryCron(cron())).json()).toMatchObject({ ok: true, chatsDeleted: 3 });
    const [path, init] = vi.mocked(supabaseFetch).mock.calls[0]!;
    expect(path).toBe("/rest/v1/rpc/mira_forget_old_memory");
    expect(JSON.parse(String(init!.body))).toEqual({ p_months: 12 });
    const [codes, del] = vi.mocked(supabaseFetch).mock.calls[1]!;
    expect(del?.method).toBe("DELETE");
    const before = decodeURIComponent(
      /^\/rest\/v1\/mira_sign_in_code\?issued_at=lt\.(.+)$/.exec(codes)![1]!
    );
    expect(Math.abs(Date.now() - 86_400_000 - Date.parse(before))).toBeLessThan(60_000);
    expect(recordCronRun).toHaveBeenLastCalledWith("mira-memory", expect.any(Number), "success");
  });

  it("record a memory run that failed or threw, instead of crashing", async () => {
    vi.mocked(supabaseFetch).mockRejectedValueOnce(new Error("fetch failed"));
    const res = await memoryCron(cron());
    expect(res.status).toBe(500);
    expect(recordCronRun).toHaveBeenLastCalledWith(
      "mira-memory",
      expect.any(Number),
      "error",
      "fetch failed"
    );
    vi.mocked(supabaseFetch)
      .mockResolvedValueOnce(json(0))
      .mockResolvedValueOnce(new Response("{}", { status: 500 }));
    expect((await memoryCron(cron())).status).toBe(500);
    expect(recordCronRun).toHaveBeenLastCalledWith(
      "mira-memory",
      expect.any(Number),
      "error",
      expect.stringContaining("sign-in codes")
    );
  });
});
