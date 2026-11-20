import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@features/admin/server/supabase", () => ({ supabaseFetch: vi.fn() }));
vi.mock("@features/mira/server/store", () => ({ deleteAccount: vi.fn() }));
vi.mock("@shared/http/is-prod-cron-host", () => ({ isProdCronHost: () => true }));
vi.mock("@shared/observability/slack-alert-dedup", () => ({ recordCronRun: vi.fn() }));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/api/cron/mira-memory/route";
import { supabaseFetch } from "@features/admin/server/supabase";
import { deleteAccount } from "@features/mira/server/store";
import { recordCronRun } from "@shared/observability/slack-alert-dedup";

process.env.CRON_SECRET = "cron-secret";
const run = () =>
  GET(
    new Request("http://localhost/api/cron/mira-memory", {
      headers: { authorization: "Bearer cron-secret" },
    })
  );

const DAY = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const json = (v: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(v), { status: 200, headers });

/** The database: old events by id, auth users, Mira accounts and recent codes. */
let events: Array<{ id: number; created_at: string }>;
let users: Array<Record<string, unknown>>;
let accounts: string[];
let codes: string[];
const deletes = () =>
  vi
    .mocked(supabaseFetch)
    .mock.calls.filter(([, init]) => init?.method === "DELETE")
    .map(([path]) => path);

beforeEach(() => {
  vi.clearAllMocks();
  events = [];
  users = [];
  accounts = [];
  codes = [];
  vi.mocked(deleteAccount).mockResolvedValue(undefined);
  vi.mocked(supabaseFetch).mockImplementation(async (path, init) => {
    if (path.startsWith("/rest/v1/rpc/mira_forget_old_memory")) return json(0);
    if (path.startsWith("/rest/v1/mira_sign_in_code?issued_at")) return json([]);
    if (path.startsWith("/rest/v1/mira_event?select=id,created_at"))
      return json(events.slice(0, 1));
    if (path.startsWith("/rest/v1/mira_event?id=lt.") && init?.method === "DELETE") {
      const [, below, before] = /id=lt\.(\d+)&created_at=lt\.(.+)$/.exec(path)!;
      const cut = Date.parse(decodeURIComponent(before!));
      const gone = events.filter((e) => e.id < Number(below) && Date.parse(e.created_at) < cut);
      events = events.filter((e) => !gone.includes(e));
      return json(null, { "content-range": `*/${gone.length}` });
    }
    if (path.startsWith("/auth/v1/admin/users?page=1&")) return json({ users });
    if (path.startsWith("/auth/v1/admin/users?page=")) return json({ users: [] });
    if (path.startsWith("/rest/v1/mira_user?id=eq.")) {
      const id = decodeURIComponent(/id=eq\.([^&]+)/.exec(path)![1]!);
      return json(accounts.includes(id) ? [{ id }] : []);
    }
    if (path.startsWith("/rest/v1/mira_sign_in_code?email=eq.")) {
      const email = decodeURIComponent(/email=eq\.([^&]+)/.exec(path)![1]!);
      return json(codes.includes(email) ? [{ email }] : []);
    }
    throw new Error(`unexpected ${init?.method ?? "GET"} ${path}`);
  });
});

describe("mira-memory: the KPI log keeps an event 12 months", () => {
  it("deletes older events a primary-key range at a time, oldest first, and keeps newer ones", async () => {
    const old = ago(400 * DAY);
    events = [
      ...Array.from({ length: 7 }, (_, i) => ({ id: 1 + i * 1_000, created_at: old })),
      { id: 9_001, created_at: ago(300 * DAY) },
      { id: 9_002, created_at: ago(DAY) },
    ];
    const res = await run();
    expect(await res.json()).toMatchObject({ ok: true, eventsDeleted: 7, stoppedEarly: false });
    expect(events.map((e) => e.id)).toEqual([9_001, 9_002]);
    const ranges = deletes().filter((p) => p.startsWith("/rest/v1/mira_event"));
    expect(ranges.map((p) => /id=lt\.(\d+)/.exec(p)![1])).toEqual(["5001", "10001"]);
    // The cutoff is 12 months back.
    const cut = decodeURIComponent(/created_at=lt\.(.+)$/.exec(ranges[0]!)![1]!);
    const yearAgo = new Date();
    yearAgo.setUTCMonth(yearAgo.getUTCMonth() - 12);
    expect(Math.abs(Date.parse(cut) - yearAgo.getTime())).toBeLessThan(60_000);
    expect(recordCronRun).toHaveBeenLastCalledWith("mira-memory", expect.any(Number), "success");
  });

  it("deletes nothing when the oldest event is younger than 12 months", async () => {
    events = [{ id: 1, created_at: ago(300 * DAY) }];
    expect(await (await run()).json()).toMatchObject({ eventsDeleted: 0 });
    expect(deletes().some((p) => p.startsWith("/rest/v1/mira_event"))).toBe(false);
  });

  it("starts nothing new after its time budget, and records the run as an error", async () => {
    events = Array.from({ length: 3 }, (_, i) => ({
      id: 1 + i * 5_000,
      created_at: ago(400 * DAY),
    }));
    let now = Date.now();
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.mocked(supabaseFetch).mockImplementationOnce(async () => {
      now += 21_000; // the first step took 21 s
      return json(0);
    });
    const body = await (await run()).json();
    clock.mockRestore();
    expect(body).toMatchObject({ eventsDeleted: 0, stoppedEarly: true });
    expect(events).toHaveLength(3);
    expect(recordCronRun).toHaveBeenLastCalledWith(
      "mira-memory",
      expect.any(Number),
      "error",
      expect.stringContaining("stopped at the time budget")
    );
  });
});

describe("mira-memory: logins Mira made for a sign-up that never finished", () => {
  const mira = { created_by: "mira", provider: "email" };
  beforeEach(() => {
    users = [
      { id: "u-stale", email: "stale@example.com", created_at: ago(2 * DAY), app_metadata: mira },
      // Not made by Mira's sign-in (admin panel, Jarvis): never touched.
      {
        id: "u-admin",
        email: "admin@loveiq.org",
        created_at: ago(9 * DAY),
        app_metadata: { provider: "email" },
      },
      { id: "u-fresh", email: "fresh@example.com", created_at: ago(DAY / 2), app_metadata: mira },
      { id: "u-done", email: "done@example.com", created_at: ago(9 * DAY), app_metadata: mira },
      { id: "u-coding", email: "coding@example.com", created_at: ago(3 * DAY), app_metadata: mira },
    ];
    accounts = ["u-done"]; // finished sign-up: has a mira_user row
    codes = ["coding@example.com"]; // a code went out in the last day: still signing up
  });

  it("deletes only Mira's logins over a day old with no account and no code from the last day", async () => {
    const body = await (await run()).json();
    expect(body).toMatchObject({ signUpsDeleted: 1, signUpsFailed: 0 });
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    // Mira's own account deletion, which keeps the login of staff and Jarvis members.
    expect(deleteAccount).toHaveBeenCalledWith({ id: "u-stale", email: "stale@example.com" });
    expect(deletes().some((p) => p.startsWith("/auth/v1/"))).toBe(false);
    expect(recordCronRun).toHaveBeenLastCalledWith("mira-memory", expect.any(Number), "success");
  });

  it("counts a failed removal, goes on with the rest and records the run as an error", async () => {
    users.push({
      id: "u-stale-2",
      email: "two@example.com",
      created_at: ago(5 * DAY),
      app_metadata: mira,
    });
    vi.mocked(deleteAccount).mockRejectedValueOnce(new Error("auth down"));
    const body = await (await run()).json();
    expect(body).toMatchObject({ signUpsDeleted: 1, signUpsFailed: 1 });
    expect(deleteAccount).toHaveBeenCalledTimes(2);
    expect(recordCronRun).toHaveBeenLastCalledWith(
      "mira-memory",
      expect.any(Number),
      "error",
      expect.stringContaining("1 failed")
    );
  });

  it("fails the run when the logins can't be listed", async () => {
    vi.mocked(supabaseFetch).mockImplementation(async (path) =>
      path.startsWith("/auth/v1/") ? new Response("{}", { status: 500 }) : json([])
    );
    expect((await run()).status).toBe(500);
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(recordCronRun).toHaveBeenLastCalledWith(
      "mira-memory",
      expect.any(Number),
      "error",
      expect.stringContaining("unfinished sign-ups")
    );
  });
});
