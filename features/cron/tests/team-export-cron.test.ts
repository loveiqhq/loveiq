/**
 * /api/cron/team-export: the server side of Jarvis's export_all_data. It must answer at once,
 * run one export at a time, write nothing when it cannot find a team-only folder or a Drive
 * login, reuse a copy under ten minutes old, free the lock when a run fails so asking again
 * retries, and record every outcome in cron_run.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const lastRun = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: async () => new Response(JSON.stringify(lastRun.rows)),
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

/** Redis as the route uses it: SET with NX/EX, GET and DEL, on one key. */
const redis = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  set: vi.fn(),
  del: vi.fn(),
}));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    async set(key: string, value: unknown, opts: { nx?: boolean; ex?: number } = {}) {
      redis.set(key, value, opts);
      if (opts.nx && redis.store.has(key)) return null;
      redis.store.set(key, value);
      return "OK";
    }
    async get(key: string) {
      return redis.store.get(key) ?? null;
    }
    async del(key: string) {
      redis.del(key);
      redis.store.delete(key);
      return 1;
    }
  },
}));

import { OutOfTime } from "@features/admin/server/team-export";
import { GET } from "@/app/api/cron/team-export/route";

const req = () =>
  new Request("https://www.loveiq.org/api/cron/team-export", {
    headers: { "x-vercel-oidc-token": "oidc-of-this-request" },
  });
const files = [
  { name: "app_user.csv", body: "id\n" },
  { name: "README.md", body: "#" },
];

describe("/api/cron/team-export", () => {
  beforeEach(() => {
    prodHost = true;
    authOk = true;
    runs.length = 0;
    google.token = "drive-token";
    lastRun.rows = [];
    redis.store.clear();
    process.env.KV_REST_API_URL = "https://kv";
    process.env.KV_REST_API_TOKEN = "kv-token";
    work.findTeamFolder.mockReset().mockResolvedValue("FOLDER");
    work.tableSpecs.mockReset().mockResolvedValue([]);
    work.buildExport.mockReset().mockResolvedValue(files);
    work.uploadExport.mockReset().mockResolvedValue(undefined);
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

  it("will not run without Redis, which keeps runs to one at a time", async () => {
    delete process.env.KV_REST_API_URL;
    expect((await GET(req())).status).toBe(503);
    expect(work.buildExport).not.toHaveBeenCalled();
  });

  it("answers at once with the folder, then exports and uploads after the response", async () => {
    const res = await GET(req());
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.folderUrl).toBe("https://drive.google.com/drive/folders/FOLDER");
    // The Drive login is made from this request's identity, before the work starts.
    expect(google.oidc).toHaveBeenCalledWith("oidc-of-this-request");
    await flushAfterResponse();
    expect(work.uploadExport).toHaveBeenCalledWith(
      "drive-token",
      "FOLDER",
      files,
      expect.any(Function)
    );
    expect(runs).toEqual([{ name: "team-export", status: "success", error: undefined }]);
    // The finished copy is reused for ten minutes.
    expect(redis.set).toHaveBeenLastCalledWith(
      "team-export:run",
      expect.objectContaining({ finishedAt: expect.any(String) }),
      { ex: 600 }
    );
  });

  it("runs one at a time: a second ask while one runs reports it", async () => {
    let finish: (f: typeof files) => void = () => {};
    work.buildExport.mockReturnValueOnce(new Promise((r) => (finish = r)));
    expect((await GET(req())).status).toBe(202);
    const second = await GET(req());
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.startedAt).toEqual(expect.any(String));
    expect(body.finishedAt).toBeUndefined();
    // The lock outlives the longest possible run (an 800-second ceiling).
    expect(redis.set.mock.calls[0]![2]).toEqual({ nx: true, ex: 900 });
    finish(files);
    await flushAfterResponse();
    expect(work.buildExport).toHaveBeenCalledTimes(1);
    // Once finished, asking again within ten minutes is told it is fresh.
    const third = await GET(req());
    expect(third.status).toBe(409);
    expect((await third.json()).finishedAt).toEqual(expect.any(String));
  });

  it("frees the lock when a run fails, so asking again retries, and records why", async () => {
    work.buildExport.mockRejectedValueOnce(new Error("1 people asked us to restrict processing"));
    expect((await GET(req())).status).toBe(202);
    await flushAfterResponse();
    expect(redis.store.has("team-export:run")).toBe(false);
    expect(runs).toEqual([
      { name: "team-export", status: "error", error: "1 people asked us to restrict processing" },
    ]);
    expect(log.error).toHaveBeenCalled();
    expect(work.uploadExport).not.toHaveBeenCalled();
    lastRun.rows = [{ status: "error", error_message: "1 people asked us to restrict processing" }];
    const again = await GET(req());
    expect(again.status).toBe(202);
    expect((await again.json()).previous).toEqual(lastRun.rows[0]);
  });

  it("records a run that passed its deadline as a timeout", async () => {
    work.uploadExport.mockRejectedValueOnce(new OutOfTime("ran out of time"));
    await GET(req());
    await flushAfterResponse();
    expect(runs[0]).toMatchObject({ status: "timeout", error: "ran out of time" });
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
    expect(redis.store.size).toBe(0);
    expect(runs.map((r) => r.status)).toEqual(["error", "error"]);
  });
});
