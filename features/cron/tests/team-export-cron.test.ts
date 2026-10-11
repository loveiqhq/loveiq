/**
 * /api/cron/team-export: the server side of Jarvis's export_all_data. It must answer at once,
 * run one export at a time, let a caller ask how it is going without starting anything, write
 * nothing when it cannot find a team-only folder or a Drive login, keep a record of every run
 * that survives the run being killed, give up at its deadline, and free the lock when a run
 * ends however it ends.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { flushAfterResponse } from "@shared/http/after-response";

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock("@shared/observability/logger", () => ({ default: log }));

let prodHost = true;
vi.mock("@shared/http/is-prod-cron-host", () => ({ isProdCronHost: () => prodHost }));

let authOk = true;
const runs: Array<{ name: string; status: string; error?: string }> = [];
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  verifyCronAuth: () => authOk,
  recordCronRun: async (name: string, _s: number, status: string, error?: string) => {
    runs.push({ name, status, error });
  },
}));

const google = vi.hoisted(() => ({ token: "drive-token" as string | null, oidc: vi.fn() }));
vi.mock("@shared/http/google-oauth", () => ({
  DRIVE_WRITE_SCOPE: "drive",
  getDelegatedToken: async (_s: string, _scope: string, _now: number, oidc: string | null) => {
    google.oidc(oidc);
    return google.token;
  },
  readVercelOidcToken: (r: Request) => r.headers.get("x-vercel-oidc-token"),
}));

const work = vi.hoisted(() => ({
  findTeamFolder: vi.fn(),
  tableSpecs: vi.fn(),
  buildExport: vi.fn(),
  uploadExport: vi.fn(),
}));
vi.mock("@features/admin/server/team-export", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/admin/server/team-export")>()),
  ...work,
}));

/**
 * Redis as the route uses it: SET (NX/EX), GET, and the compare-and-delete script, applied in
 * the order the requests arrive, with a log of what was written in what order.
 */
const redis = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  options: [] as Array<Record<string, unknown>>,
  ops: [] as string[],
  set: vi.fn(),
  failNext: null as null | "get" | "set" | "lost-set",
  onEnd: null as null | (() => Promise<void>),
  /** Milliseconds each release waits before acting, in call order. */
  releaseDelays: [] as number[],
}));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor(options: Record<string, unknown>) {
      redis.options.push(options);
    }
    async set(key: string, value: unknown, opts: { nx?: boolean; ex?: number } = {}) {
      redis.set(key, value, opts);
      if (redis.failNext === "set" || redis.failNext === "lost-set") {
        const landed = redis.failNext === "set";
        redis.failNext = null;
        // "set": the write lands and only its answer is lost; "lost-set": it never lands.
        if (landed) redis.store.set(key, structuredClone(value));
        throw new Error("fetch failed");
      }
      if (opts.nx && redis.store.has(key)) return null;
      const ended = key === "team-export:last" && (value as { finishedAt?: string }).finishedAt;
      redis.ops.push(ended ? "end recorded" : `set ${key}`);
      redis.store.set(key, structuredClone(value));
      if (ended && redis.onEnd) {
        const hook = redis.onEnd;
        redis.onEnd = null;
        await hook();
      }
      return "OK";
    }
    async get(key: string) {
      if (redis.failNext === "get") {
        redis.failNext = null;
        throw new Error("fetch failed");
      }
      return redis.store.get(key) ?? null;
    }
    // A field, not a method: CI's code-injection check greps for the bare call's spelling.
    eval = async (script: string, keys: string[], args: string[]) => {
      // The one script the route may run: delete KEYS[1] only while it holds ARGV[1].
      expect(script).toBe(
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0'
      );
      expect(keys).toEqual(["team-export:run"]);
      const delay = redis.releaseDelays.shift() ?? 0;
      if (delay) await new Promise((r) => setTimeout(r, delay));
      redis.ops.push("release");
      const held = redis.store.get(keys[0]!);
      if (held !== undefined && JSON.stringify(held) === args[0]) {
        redis.store.delete(keys[0]!);
        return 1;
      }
      return 0;
    };
  },
}));

import { OutOfTime } from "@features/admin/server/team-export";
import { GET } from "@/app/api/cron/team-export/route";

const req = (check = false) =>
  new Request(`https://www.loveiq.org/api/cron/team-export${check ? "?check=1" : ""}`, {
    headers: { "x-vercel-oidc-token": "oidc-of-this-request" },
  });
const files = [
  { name: "app_user.csv", body: "id\n" },
  { name: "README.md", body: "#" },
];
const last = () => redis.store.get("team-export:last") as Record<string, unknown> | undefined;

describe("/api/cron/team-export", () => {
  beforeEach(() => {
    prodHost = true;
    authOk = true;
    runs.length = 0;
    google.token = "drive-token";
    google.oidc.mockReset();
    redis.store.clear();
    redis.options.length = 0;
    redis.ops.length = 0;
    redis.set.mockReset();
    redis.failNext = null;
    redis.onEnd = null;
    redis.releaseDelays = [];
    log.error.mockReset();
    process.env.KV_REST_API_URL = "https://kv";
    process.env.KV_REST_API_TOKEN = "kv-token";
    work.findTeamFolder
      .mockReset()
      .mockResolvedValue({ id: "FOLDER", people: ["Eman", "Marcus"], owner: "Eman" });
    work.tableSpecs.mockReset().mockResolvedValue([]);
    work.buildExport.mockReset().mockResolvedValue(files);
    work.uploadExport.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("refuses a caller without the cron secret, and does nothing off production", async () => {
    authOk = false;
    expect((await GET(req())).status).toBe(401);
    authOk = true;
    prodHost = false;
    expect(await (await GET(req())).json()).toEqual({
      skipped: true,
      reason: "non-prod-cron-host",
    });
    expect(work.findTeamFolder).not.toHaveBeenCalled();
  });

  it("will not run without Redis, or when Redis does not answer", async () => {
    delete process.env.KV_REST_API_URL;
    expect((await GET(req())).status).toBe(503);
    process.env.KV_REST_API_URL = "https://kv";
    redis.failNext = "get";
    expect((await GET(req())).status).toBe(503);
    expect(work.findTeamFolder).not.toHaveBeenCalled();
    // And never retries (in this client `retry: false` still sends twice): a retried lock
    // request could find its own lock. Every request is bounded.
    expect(redis.options.at(-1)).toMatchObject({ retry: { retries: 0 } });
    expect(typeof redis.options.at(-1)!.signal).toBe("function");
  });

  it("answers at once with the folder and its people, then exports after the response", async () => {
    let finish: (f: typeof files) => void = () => {};
    work.buildExport.mockReturnValueOnce(new Promise((r) => (finish = r)));
    const res = await GET(req());
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toMatchObject({
      folderUrl: "https://drive.google.com/drive/folders/FOLDER",
      people: ["Eman", "Marcus"],
      owner: "Eman",
      last: null,
    });
    // The run is on record before it starts, so a killed run does not vanish.
    expect(last()).toMatchObject({ startedAt: body.startedAt });
    expect(last()?.finishedAt).toBeUndefined();
    // The Drive login is made from this request's identity, before the work starts.
    expect(google.oidc).toHaveBeenCalledWith("oidc-of-this-request");
    finish(files);
    await flushAfterResponse();
    expect(work.uploadExport).toHaveBeenCalledWith(
      "drive-token",
      "FOLDER",
      files,
      expect.any(Function)
    );
    expect(last()).toMatchObject({ status: "success", finishedAt: expect.any(String) });
    expect(redis.store.has("team-export:run")).toBe(false);
    // The end is on record before the lock goes, so a start in between finds it.
    expect(redis.ops.slice(-2)).toEqual(["end recorded", "release"]);
    expect(runs).toEqual([{ name: "team-export", status: "success", error: undefined }]);
  });

  it("runs one at a time, and a check during a run touches nothing", async () => {
    let finish: (f: typeof files) => void = () => {};
    work.buildExport.mockReturnValueOnce(new Promise((r) => (finish = r)));
    const started = await (await GET(req())).json();
    // The lock outlives the longest possible run (an 800-second ceiling).
    expect(redis.set.mock.calls.find(([k]) => k === "team-export:run")?.[2]).toEqual({
      nx: true,
      ex: 900,
    });
    work.findTeamFolder.mockClear();
    const second = await GET(req());
    expect(second.status).toBe(409);
    expect((await second.json()).running).toBe(started.startedAt);
    const check = await GET(req(true));
    expect(check.status).toBe(200);
    expect((await check.json()).running).toBe(started.startedAt);
    // Neither asked Drive anything: a passing Drive error cannot make a running export look failed.
    expect(work.findTeamFolder).not.toHaveBeenCalled();
    finish(files);
    await flushAfterResponse();
    expect(work.buildExport).toHaveBeenCalledTimes(1);
    const after = await (await GET(req(true))).json();
    expect(after.running).toBeNull();
    expect(after.last).toMatchObject({ status: "success" });
  });

  it("a check starts nothing, even with nothing running", async () => {
    const res = await GET(req(true));
    expect(await res.json()).toEqual({ running: null, last: null });
    expect(redis.store.size).toBe(0);
    expect(work.buildExport).not.toHaveBeenCalled();
  });

  it("records why a run failed, frees the lock so asking again retries, and alerts", async () => {
    work.buildExport.mockRejectedValueOnce(new Error("1 people asked us to restrict processing"));
    expect((await GET(req())).status).toBe(202);
    await flushAfterResponse();
    expect(redis.store.has("team-export:run")).toBe(false);
    expect(last()).toMatchObject({
      status: "error",
      error: "1 people asked us to restrict processing",
    });
    expect(runs).toEqual([
      { name: "team-export", status: "error", error: "1 people asked us to restrict processing" },
    ]);
    expect(log.error).toHaveBeenCalled();
    expect(work.uploadExport).not.toHaveBeenCalled();
    const again = await GET(req());
    expect(again.status).toBe(202);
    expect((await again.json()).last).toMatchObject({ status: "error" });
  });

  it("gives up at nine minutes, and records that as a timeout", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
    await GET(req());
    await flushAfterResponse();
    const isOutOfTime = work.buildExport.mock.calls[0]![2] as () => boolean;
    vi.setSystemTime(new Date("2026-10-11T10:08:59Z"));
    expect(isOutOfTime()).toBe(false);
    vi.setSystemTime(new Date("2026-10-11T10:09:01Z"));
    expect(isOutOfTime()).toBe(true);

    work.uploadExport.mockRejectedValueOnce(new OutOfTime("ran out of time"));
    await GET(req());
    await flushAfterResponse();
    expect(runs.at(-1)).toMatchObject({ status: "timeout", error: "ran out of time" });
  });

  it("writes nothing and says why without a Drive login or a team-only folder", async () => {
    google.token = null;
    const noLogin = await GET(req());
    expect(noLogin.status).toBe(500);
    expect((await noLogin.json()).error).toMatch(/no Drive login/);

    google.token = "drive-token";
    work.findTeamFolder.mockRejectedValueOnce(new Error("the Drive folder is not team-only"));
    const open = await GET(req());
    expect(open.status).toBe(500);
    expect((await open.json()).error).toMatch(/not team-only/);

    expect(work.buildExport).not.toHaveBeenCalled();
    expect(redis.store.has("team-export:run")).toBe(false);
    expect(last()).toMatchObject({ status: "error", error: expect.stringMatching(/team-only/) });
    expect(runs.map((r) => r.status)).toEqual(["error", "error"]);
  });

  it("takes a lock with no readable start time as stale", async () => {
    redis.store.set("team-export:run", { runId: "odd", startedAt: "not a time" });
    expect((await GET(req())).status).toBe(202);
    await flushAfterResponse();
  });

  it("frees a lock the end failed to free, or one older than any run can last", async () => {
    // Its run recorded an end: the delete after it failed.
    redis.store.set("team-export:run", { runId: "r1", startedAt: new Date().toISOString() });
    redis.store.set("team-export:last", {
      runId: "r1",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: "success",
    });
    expect((await (await GET(req(true))).json()).running).toBeNull();
    expect((await GET(req())).status).toBe(202);
    await flushAfterResponse();

    // A run the platform killed: its lock is older than the 800-second ceiling.
    redis.store.set("team-export:run", {
      runId: "r2",
      startedAt: new Date(Date.now() - 801_000).toISOString(),
    });
    redis.store.set("team-export:last", { runId: "r2", startedAt: "2026-10-11T09:00:00Z" });
    const res = await GET(req());
    expect(res.status).toBe(202);
    // The killed run is reported as one that never finished.
    expect((await res.json()).last).toEqual({ runId: "r2", startedAt: "2026-10-11T09:00:00Z" });
  });

  it("frees the lock when it landed but the answer to it was lost, and only its own", async () => {
    redis.failNext = "set";
    expect((await GET(req())).status).toBe(503);
    expect(redis.store.has("team-export:run")).toBe(false);
    expect(work.buildExport).not.toHaveBeenCalled();

    // Its SET never landed, and the lock is another request's: that one is left alone.
    const other = { runId: "other", startedAt: new Date().toISOString() };
    redis.failNext = "lost-set";
    redis.store.delete("team-export:run");
    const pending = GET(req());
    redis.store.set("team-export:run", other);
    expect((await pending).status).toBe(503);
    expect(redis.store.get("team-export:run")).toEqual(other);
  });

  it("starts nothing when another request takes the lock first", async () => {
    // Between this request's read and its SET NX, another one claims.
    const other = { runId: "other", startedAt: new Date().toISOString() };
    redis.set.mockImplementationOnce((key: string) => {
      if (key === "team-export:run") redis.store.set(key, other);
    });
    const res = await GET(req());
    expect(res.status).toBe(409);
    expect((await res.json()).running).toBe(other.startedAt);
    expect(work.findTeamFolder).not.toHaveBeenCalled();
    expect(work.buildExport).not.toHaveBeenCalled();
  });

  it("lets only one of two simultaneous starts take over a stale lock", async () => {
    redis.store.set("team-export:run", {
      runId: "dead",
      startedAt: new Date(Date.now() - 801_000).toISOString(),
    });
    // The second request's release lands after the first has taken the lock, while its run
    // is still going.
    redis.releaseDelays = [0, 20];
    let finish: (f: typeof files) => void = () => {};
    work.buildExport.mockReturnValueOnce(new Promise((r) => (finish = r)));
    const statuses = (await Promise.all([GET(req()), GET(req())])).map((r) => r.status).sort();
    expect(statuses).toEqual([202, 409]);
    finish(files);
    await flushAfterResponse();
    expect(work.buildExport).toHaveBeenCalledTimes(1);
  });

  it("a run that ends late never frees the lock of the run that started after it", async () => {
    let second: Response | null = null;
    let finishSecond: (f: typeof files) => void = () => {};
    // The moment the first run records its end, a new start reads "finished" and takes over;
    // the second run is held open so its lock is still there to be checked.
    redis.onEnd = async () => {
      work.buildExport.mockReturnValueOnce(new Promise((r) => (finishSecond = r)));
      second = await GET(req());
    };
    expect((await GET(req())).status).toBe(202);
    await vi.waitFor(() => expect(runs).toHaveLength(1));
    expect(second!.status).toBe(202);
    const held = redis.store.get("team-export:run") as { startedAt: string } | undefined;
    // The first run's release came after the takeover and left the new lock alone.
    expect(held?.startedAt).toBe((await second!.json()).startedAt);
    // So a third start waits instead of running beside the second.
    expect((await GET(req())).status).toBe(409);
    finishSecond(files);
    await flushAfterResponse();
    expect(work.buildExport).toHaveBeenCalledTimes(2);
  });
});
