import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, token, type Row } from "./fake-db";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: vi.fn(), get: () => undefined })),
  headers: vi.fn(async () => new Headers()),
}));
const auth = { getSession: vi.fn(), getUser: vi.fn(), signOut: vi.fn() };
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth }) }));
vi.mock("@features/admin/server/supabase", () => ({ supabaseFetch: vi.fn() }));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { supabaseFetch } from "@features/admin/server/supabase";
import {
  cityFrom,
  deviceLabel,
  isRecentSignIn,
  sessionIdOf,
  signOutDevices,
} from "@features/mira/server/devices";
import { getMiraAccount } from "@features/mira/server/session";
import { flushAfterResponse } from "@shared/http/after-response";

const LEA = "6f2c4a1e-1111-4222-8333-944455556666";
const KAI = "7a3d5b2f-2222-4333-8444-a55566667777";
const PHONE = "0b1c2d3e-4f50-4617-8829-3a4b5c6d7e8f";
const LAPTOP = "1c2d3e4f-5061-4728-9a3b-4c5d6e7f8091";

let db: ReturnType<typeof fakeDb>;
const session = (id: string, user: string, over: Row = {}): Row => ({
  id,
  user_id: user,
  method: "email",
  device: "iPhone · Safari",
  city: "Berlin",
  created_at: new Date(Date.now() - 60_000).toISOString(),
  last_seen_at: new Date().toISOString(),
  ...over,
});
/** The browser holds a valid Supabase session `sid` for `user`. */
const signedInAs = (user: string, sid: string) => {
  auth.getSession.mockResolvedValue({
    data: { session: { access_token: token({ sub: user, session_id: sid }) } },
  });
  auth.getUser.mockResolvedValue({ data: { user: { id: user, email: "Lea@Example.com" } } });
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.example";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  db = fakeDb({ mira_session: [session(PHONE, LEA), session(LAPTOP, LEA)] });
  vi.mocked(supabaseFetch).mockImplementation((p, i) => db.handle(p, i));
  auth.signOut.mockResolvedValue({ error: null });
  signedInAs(LEA, PHONE);
});

describe("getMiraAccount: only a session Mira recorded, and nobody signed out", () => {
  it("is the account, with its device and when it signed in", async () => {
    const account = await getMiraAccount();
    expect(account).toMatchObject({ id: LEA, email: "lea@example.com", session: { id: PHONE } });
    expect(auth.getUser).toHaveBeenCalledWith(token({ sub: LEA, session_id: PHONE }));
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("refuses a device signed out from Settings, and ends it at Supabase too", async () => {
    await signOutDevices(LEA, PHONE);
    expect(await getMiraAccount()).toBeNull();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    // The other device stays signed in.
    signedInAs(LEA, LAPTOP);
    expect(await getMiraAccount()).toMatchObject({ id: LEA });
  });

  it("refuses every device after Sign out everywhere", async () => {
    expect((await signOutDevices(LEA)).sort()).toEqual([PHONE, LAPTOP].sort());
    for (const sid of [PHONE, LAPTOP]) {
      signedInAs(LEA, sid);
      expect(await getMiraAccount()).toBeNull();
    }
  });

  it("refuses a session Mira's sign-in never recorded (one minted elsewhere in the project)", async () => {
    signedInAs(LEA, "2d3e4f50-6172-4839-8a4b-5c6d7e8f90a1");
    expect(await getMiraAccount()).toBeNull();
    expect(auth.signOut).toHaveBeenCalled();
  });

  it("refuses another account's session id in this account's token", async () => {
    db.tables.mira_session!.push(session("3e4f5061-7283-494a-8b5c-6d7e8f90a1b2", KAI));
    signedInAs(LEA, "3e4f5061-7283-494a-8b5c-6d7e8f90a1b2");
    expect(await getMiraAccount()).toBeNull();
  });

  it("refuses a token without a session id, and one Supabase rejects", async () => {
    auth.getSession.mockResolvedValue({
      data: { session: { access_token: token({ sub: LEA }) } },
    });
    expect(await getMiraAccount()).toBeNull();
    signedInAs(LEA, PHONE);
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error("bad jwt") });
    expect(await getMiraAccount()).toBeNull();
  });

  it("fails closed when the devices can't be read, without signing the device out", async () => {
    vi.mocked(supabaseFetch).mockResolvedValue(new Response("down", { status: 503 }));
    expect(await getMiraAccount()).toBeNull();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("moves last seen on at most hourly, after the response", async () => {
    await getMiraAccount();
    await flushAfterResponse();
    expect(db.calls.filter((c) => c.startsWith("PATCH"))).toEqual([]);
    db.tables.mira_session![0]!.last_seen_at = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await getMiraAccount();
    await flushAfterResponse();
    expect(db.calls.filter((c) => c.startsWith("PATCH"))).toEqual([
      `PATCH /rest/v1/mira_session?id=eq.${PHONE}`,
    ]);
  });
});

describe("signing out devices", () => {
  it("only ever touches the account's own devices", async () => {
    db.tables.mira_session!.push(session("3e4f5061-7283-494a-8b5c-6d7e8f90a1b2", KAI));
    expect(await signOutDevices(LEA, "3e4f5061-7283-494a-8b5c-6d7e8f90a1b2")).toEqual([]);
    expect((await signOutDevices(LEA)).sort()).toEqual([PHONE, LAPTOP].sort());
    expect(db.tables.mira_session!.map((s) => s.user_id)).toEqual([KAI]);
    expect(await signOutDevices(LEA, "not-a-uuid")).toEqual([]);
  });
});

describe("what a device row knows", () => {
  it("labels the device and browser a person recognises", () => {
    const ua = {
      iphone:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
      iphoneChrome:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
      mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.70",
      android:
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
      samsung:
        "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Safari/537.36",
      firefox: "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
    };
    expect(deviceLabel(ua.iphone)).toBe("iPhone · Safari");
    expect(deviceLabel(ua.iphoneChrome)).toBe("iPhone · Chrome");
    expect(deviceLabel(ua.mac)).toBe("Mac · Chrome");
    expect(deviceLabel(ua.edge)).toBe("Windows PC · Edge");
    expect(deviceLabel(ua.android)).toBe("Android phone · Chrome");
    expect(deviceLabel(ua.samsung)).toBe("Android tablet · Samsung Internet");
    expect(deviceLabel(ua.firefox)).toBe("Linux PC · Firefox");
    expect(deviceLabel(null)).toBe("A device");
  });

  it("keeps only the approximate city Vercel sends, never more", () => {
    expect(cityFrom(new Headers({ "x-vercel-ip-city": "S%C3%A3o%20Paulo" }))).toBe("São Paulo");
    expect(cityFrom(new Headers({ "x-vercel-ip-city": "%E0%A4%A" }))).toBeNull();
    expect(cityFrom(new Headers({ "x-vercel-ip-city": "<b>Berlin</b>%0A" }))).toBe("bBerlin/b");
    expect(cityFrom(new Headers({ "x-vercel-ip-city": "x".repeat(200) }))!.length).toBe(80);
    expect(cityFrom(new Headers())).toBeNull();
  });

  it("reads the session id from the access token, and nothing that isn't one", () => {
    expect(sessionIdOf(token({ session_id: PHONE.toUpperCase() }))).toBe(PHONE);
    expect(sessionIdOf(token({ session_id: "x' or 1=1" }))).toBeNull();
    expect(sessionIdOf("not.a-jwt")).toBeNull();
    expect(sessionIdOf(undefined)).toBeNull();
  });

  it("counts a sign-in as recent for 15 minutes", () => {
    const now = Date.parse("2026-11-22T10:00:00Z");
    expect(isRecentSignIn(now - 14 * 60_000, now)).toBe(true);
    expect(isRecentSignIn(now - 16 * 60_000, now)).toBe(false);
  });
});
