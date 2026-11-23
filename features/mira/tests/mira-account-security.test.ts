import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type Row } from "./fake-db";

let browser: Map<string, string>;
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (browser.has(name) ? { name, value: browser.get(name)! } : undefined),
  })),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@features/admin/server/supabase", () => ({ supabaseFetch: vi.fn() }));
vi.mock("@features/brain/server/sign-in", () => ({ memberByEmail: vi.fn() }));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const signOut = vi.fn().mockResolvedValue({ error: null });
vi.mock("@features/mira/server/session", () => ({
  createMiraSupabase: vi.fn(async () => ({ auth: { signOut } })),
  getMiraAccount: vi.fn(),
}));
vi.mock("@features/mira/server/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/mira/server/store")>()),
  logMiraEvent: vi.fn(),
}));

import { DELETE, GET } from "@/app/api/mira/security/route";
import { supabaseFetch } from "@features/admin/server/supabase";
import { memberByEmail } from "@features/brain/server/sign-in";
import { getMiraAccount } from "@features/mira/server/session";
import { logMiraEvent } from "@features/mira/server/store";
import { verifyCsrfToken } from "@shared/http/csrf";

const LEA = "6f2c4a1e-1111-4222-8333-944455556666";
const KAI = "7a3d5b2f-2222-4333-8444-a55566667777";
const HERE = "0b1c2d3e-4f50-4617-8829-3a4b5c6d7e8f";
const PHONE = "1c2d3e4f-5061-4728-9a3b-4c5d6e7f8091";
const KAIS = "2d3e4f50-6172-4839-8a4b-5c6d7e8f90a1";

let db: ReturnType<typeof fakeDb>;
const device = (id: string, user: string, seen: string, over: Row = {}): Row => ({
  id,
  user_id: user,
  method: "email",
  device: "Mac · Chrome",
  city: "Berlin",
  created_at: "2026-11-20T10:00:00.000Z",
  last_seen_at: seen,
  ...over,
});
const at = (site = "https://www.loveiq.org", query = "", method = "GET") =>
  new Request(`${site}/api/mira/security${query}`, { method });
const read = async (res: Response) => ({ status: res.status, body: await res.json() });

/** The Supabase sessions mira_end_auth_sessions was asked to end, per call. */
let ended: Array<{ p_user: string; p_sessions: string[] }>;

beforeEach(() => {
  vi.clearAllMocks();
  browser = new Map();
  ended = [];
  db = fakeDb(
    {
      mira_user: [{ id: LEA, email: "lea@example.com", minor_at: null, google_connected_at: null }],
      mira_session: [
        device(HERE, LEA, "2026-11-22T09:00:00.000Z"),
        device(PHONE, LEA, "2026-11-21T09:00:00.000Z", {
          device: "iPhone · Safari",
          method: "passkey",
        }),
        device(KAIS, KAI, "2026-11-22T09:30:00.000Z"),
      ],
      mira_passkey: [
        {
          id: "credential-of-lea-iphone-xxxxxxxx",
          user_id: LEA,
          public_key: "pAQBAyYgASFYIG-secret-ish",
          counter: 0,
          transports: ["internal"],
          backed_up: true,
          label: "iPhone · Safari",
          created_at: "2026-11-21T09:00:00.000Z",
          last_used_at: null,
        },
      ],
      admin_users: [],
    },
    {
      rpc: {
        mira_end_auth_sessions: (body) => {
          ended.push(body as (typeof ended)[number]);
          return new Response(JSON.stringify(1), { status: 200 });
        },
      },
    }
  );
  vi.mocked(supabaseFetch).mockImplementation((p, i) => db.handle(p, i));
  vi.mocked(memberByEmail).mockResolvedValue(null);
  vi.mocked(getMiraAccount).mockResolvedValue({
    id: LEA,
    email: "lea@example.com",
    session: { id: HERE, signedInAt: Date.now() - 60_000 },
  });
});

describe("GET /api/mira/security", () => {
  it("shows the account's own devices, this one marked, and its passkeys without their keys", async () => {
    const { status, body } = await read(await GET(at()));
    expect(status).toBe(200);
    expect(body.devices.map((d: Row) => [d.device, d.current])).toEqual([
      ["Mac · Chrome", true],
      ["iPhone · Safari", false],
    ]);
    expect(body.passkeys).toEqual({
      allowed: true,
      rpID: "loveiq.org",
      userHandle: Buffer.from(LEA).toString("base64url"),
      list: [
        {
          id: "credential-of-lea-iphone-xxxxxxxx",
          label: "iPhone · Safari",
          backed_up: true,
          created_at: "2026-11-21T09:00:00.000Z",
          last_used_at: null,
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("secret-ish");
    expect(body).toMatchObject({
      email: "lea@example.com",
      recent: true,
      emailChange: { allowed: true },
      google: { allowed: true, connected: false },
    });
  });

  it("offers nothing new to staff, team logins and under-18s; no passkeys off our sites", async () => {
    db.tables.mira_user![0]!.google_connected_at = "2026-11-21T09:00:00.000Z";
    vi.mocked(memberByEmail).mockResolvedValue({ id: 1 } as never);
    let { body } = await read(await GET(at()));
    expect(body.google).toEqual({ allowed: true, connected: true });
    expect(body.emailChange.allowed).toBe(false); // a Jarvis login shares the address
    db.tables.admin_users = [{ email: "lea@example.com" }];
    ({ body } = await read(await GET(at())));
    expect([body.passkeys.allowed, body.google.allowed]).toEqual([false, true]); // Google, not passkeys
    db.tables.admin_users = [];
    vi.mocked(memberByEmail).mockResolvedValue(null);
    expect(body.minor).toBe(false);
    db.tables.mira_user![0]!.minor_at = "2026-11-22T08:00:00.000Z";
    ({ body } = await read(await GET(at())));
    expect([body.passkeys.allowed, body.google.allowed, body.emailChange.allowed]).toEqual([
      false,
      false,
      false,
    ]);
    expect(body.minor).toBe(true); // so Settings says why, not that it's a team login
    db.tables.mira_user![0]!.minor_at = null;
    ({ body } = await read(await GET(at("https://loveiq-preview.vercel.app"))));
    expect(body.passkeys).toMatchObject({ allowed: false, rpID: null });
  });

  it("needs a signed-in account", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue(null);
    expect((await GET(at())).status).toBe(401);
  });
});

describe("DELETE /api/mira/security", () => {
  it("signs out another of the account's devices, and leaves this one signed in", async () => {
    const res = await read(await DELETE(at(undefined, `?device=${PHONE}`, "DELETE")));
    expect(res).toEqual({ status: 200, body: { success: true, signedOut: false } });
    expect(db.tables.mira_session!.map((s) => s.id)).toEqual([HERE, KAIS]);
    expect(signOut).not.toHaveBeenCalled();
    // Its login ends at Supabase now, not at its next call to Mira (round-2 SEC-L1 / COR-9).
    expect(ended).toEqual([{ p_user: LEA, p_sessions: [PHONE] }]);
    expect(logMiraEvent).toHaveBeenCalledWith(
      "device_signed_out",
      { userId: LEA },
      { thisDevice: false }
    );
  });

  it("never another account's device", async () => {
    expect((await DELETE(at(undefined, `?device=${KAIS}`, "DELETE"))).status).toBe(404);
    expect(db.tables.mira_session).toHaveLength(3);
  });

  it("signs this device out at Supabase too", async () => {
    const res = await read(await DELETE(at(undefined, `?device=${HERE}`, "DELETE")));
    expect(res.body).toEqual({ success: true, signedOut: true });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("signs out everywhere: every device of the account, this one too, and the login at Supabase", async () => {
    const res = await read(await DELETE(at(undefined, "?device=all", "DELETE")));
    expect(res.body).toEqual({ success: true, signedOut: true });
    expect(db.tables.mira_session!.map((s) => s.user_id)).toEqual([KAI]);
    // A login only Mira uses: its other Supabase sessions end too (security review L1).
    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(db.tables.mira_passkey!.some((p) => p.user_id === LEA)).toBe(true); // kept unless asked
    expect(logMiraEvent).toHaveBeenCalledWith(
      "signed_out_everywhere",
      { userId: LEA },
      { devices: 2, passkeys: false }
    );
  });

  it("keeps a shared staff or Jarvis login's own sessions, but ends every one Mira made", async () => {
    vi.mocked(memberByEmail).mockResolvedValueOnce({ email: "lea@example.com" } as never);
    await DELETE(at(undefined, "?device=all", "DELETE"));
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    // Mira's other recorded session ends at Supabase (this one by the local sign-out), so a
    // stolen Mira session of a staff login can't open the admin panel afterwards.
    expect(ended).toEqual([{ p_user: LEA, p_sessions: [PHONE] }]);
  });

  it("signs out all the same when Supabase can't end the sessions (Mira refuses them anyway)", async () => {
    db = fakeDb(
      { mira_session: [device(PHONE, LEA, "2026-11-21T09:00:00.000Z")] },
      { rpc: { mira_end_auth_sessions: () => new Response("{}", { status: 404 }) } }
    );
    vi.mocked(supabaseFetch).mockImplementation((p, i) => db.handle(p, i));
    const res = await read(await DELETE(at(undefined, `?device=${PHONE}`, "DELETE")));
    expect(res).toEqual({ status: 200, body: { success: true, signedOut: false } });
    expect(db.tables.mira_session).toEqual([]);
  });

  it("removes the passkeys too when asked, so one someone else added can't sign in (M1)", async () => {
    const res = await read(await DELETE(at(undefined, "?device=all&passkeys=1", "DELETE")));
    expect(res.body).toEqual({ success: true, signedOut: true });
    expect(db.tables.mira_passkey!.some((p) => p.user_id === LEA)).toBe(false);
    expect(logMiraEvent).toHaveBeenCalledWith(
      "signed_out_everywhere",
      { userId: LEA },
      { devices: 2, passkeys: true }
    );
  });

  it("takes only a device id or all, and needs the CSRF token", async () => {
    for (const q of ["", "?device=", "?device=everything", "?device=1%20or%201=1"]) {
      expect((await DELETE(at(undefined, q, "DELETE"))).status, q).toBe(400);
    }
    vi.mocked(verifyCsrfToken).mockResolvedValueOnce(false);
    expect((await DELETE(at(undefined, "?device=all", "DELETE"))).status).toBe(403);
    expect(db.tables.mira_session).toHaveLength(3);
  });
});
