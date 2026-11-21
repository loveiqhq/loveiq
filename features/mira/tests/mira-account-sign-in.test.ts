import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, token, type Row } from "./fake-db";

let browser: Map<string, string>;
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (browser.has(name) ? { name, value: browser.get(name)! } : undefined),
    getAll: () => [...browser].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => void browser.set(name, value),
    delete: (o: { name: string }) => void browser.delete(o.name),
  })),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, resetAt: new Date() }),
  checkCooldown: vi.fn().mockResolvedValue({ allowed: true, retryAfterMs: 0 }),
  releaseCooldown: vi.fn(),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@shared/http/fetch-with-timeout", () => ({ fetchWithTimeout: vi.fn() }));
vi.mock("@features/admin/server/supabase", () => ({ supabaseFetch: vi.fn() }));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/mira/server/anon", () => ({ anonId: vi.fn().mockResolvedValue("anon_1") }));
const verifyOtp = vi.fn();
const signOut = vi.fn().mockResolvedValue({ error: null });
vi.mock("@features/mira/server/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/mira/server/session")>()),
  createMiraSupabase: vi.fn(async () => ({ auth: { verifyOtp, signOut } })),
  getMiraAccount: vi.fn(),
}));
vi.mock("@features/mira/server/sign-in", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/mira/server/sign-in")>()),
  mintSignInCode: vi.fn().mockResolvedValue("12345678"),
}));
vi.mock("@features/mira/server/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/mira/server/store")>()),
  claimCodeAttempt: vi.fn().mockResolvedValue(true),
  consumeCode: vi.fn().mockResolvedValue(undefined),
  logMiraEvent: vi.fn(),
  upsertProfileAtSignIn: vi.fn().mockResolvedValue({ name: "Lea", remember_chats: true }),
}));

import { POST as auth } from "@/app/api/mira/auth/route";
import { GET as googleCallback } from "@/app/api/mira/auth/google/callback/route";
import { GET as googleStart } from "@/app/api/mira/auth/google/route";
import { supabaseFetch } from "@features/admin/server/supabase";
import { packStart } from "@features/mira/server/google";
import { getMiraAccount } from "@features/mira/server/session";
import { mintSignInCode } from "@features/mira/server/sign-in";
import { logMiraEvent } from "@features/mira/server/store";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";

const LEA = "6f2c4a1e-1111-4222-8333-944455556666";
const SID = "0b1c2d3e-4f50-4617-8829-3a4b5c6d7e8f";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const CLIENT = "123-abc.apps.googleusercontent.com";
const S = {
  state: "state_aaaaaaaaaaaaaaaa",
  verifier: "verifier_bbbbbbbbbbbbbbbbbbbbbbbb",
  nonce: "nonce_cccccccccccccccc",
};

let db: ReturnType<typeof fakeDb>;
const lea: Row = { id: LEA, email: "lea@gmail.com", name: "Lea", minor_at: null };
const verify = () =>
  auth(
    new Request("https://www.loveiq.org/api/mira/auth", {
      method: "POST",
      headers: {
        "user-agent": MAC,
        "x-vercel-ip-city": "Berlin",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "verify", email: "lea@gmail.com", code: "12345678" }),
    })
  );
const googleIdToken = (email: string) => {
  const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b({ alg: "RS256" })}.${b({
    iss: "https://accounts.google.com",
    aud: CLIENT,
    exp: Date.now() / 1000 + 3600,
    nonce: S.nonce,
    email,
    email_verified: true,
  })}.sig`;
};
const googleSays = (email: string) =>
  vi
    .mocked(fetchWithTimeout)
    .mockResolvedValue(
      new Response(JSON.stringify({ id_token: googleIdToken(email) }), { status: 200 })
    );

beforeEach(() => {
  vi.clearAllMocks();
  browser = new Map();
  process.env.MIRA_GOOGLE_CLIENT_ID = CLIENT;
  process.env.MIRA_GOOGLE_CLIENT_SECRET = "secret";
  db = fakeDb({ mira_user: [{ ...lea }], admin_users: [{ email: "staff@loveiq.org" }] });
  vi.mocked(supabaseFetch).mockImplementation((p, i) => db.handle(p, i));
  // Every sign-in is a new Supabase session.
  verifyOtp.mockImplementation(async () => ({
    data: {
      user: { id: LEA, email: "lea@gmail.com" },
      session: { access_token: token({ sub: LEA, session_id: crypto.randomUUID() }) },
    },
    error: null,
  }));
  vi.mocked(getMiraAccount).mockResolvedValue({
    id: LEA,
    email: "lea@gmail.com",
    session: { id: SID, signedInAt: Date.now() },
  });
});

describe("a code sign-in", () => {
  it("records this device, and offers a passkey once", async () => {
    const res = await verify();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, offerPasskey: true });
    const issued = (await verifyOtp.mock.results[0]!.value) as {
      data: { session: { access_token: string } };
    };
    const sid = JSON.parse(
      Buffer.from(issued.data.session.access_token.split(".")[1]!, "base64url").toString()
    ).session_id;
    expect(db.tables.mira_session).toEqual([
      expect.objectContaining({
        id: sid,
        user_id: LEA,
        method: "email",
        device: "Mac · Chrome",
        city: "Berlin",
      }),
    ]);
  });

  it("offers no passkey to staff, to anyone stopped as under 18, or at ten", async () => {
    const offer = async () =>
      ((await (await verify()).json()) as { offerPasskey: boolean }).offerPasskey;
    db.tables.admin_users!.push({ email: "lea@gmail.com" });
    expect(await offer()).toBe(false);
    db.tables.admin_users = [];
    db.tables.mira_user![0]!.minor_at = new Date().toISOString();
    expect(await offer()).toBe(false);
    db.tables.mira_user![0]!.minor_at = null;
    db.tables.mira_passkey = Array.from({ length: 10 }, () => ({ user_id: LEA }));
    expect(await offer()).toBe(false);
  });

  it("signs out again when the device can't be recorded: Mira would refuse that session anyway", async () => {
    verifyOtp.mockResolvedValueOnce({
      data: { user: { id: LEA, email: "lea@gmail.com" }, session: null },
      error: null,
    });
    const res = await verify();
    expect(res.status).toBe(500);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(logMiraEvent).not.toHaveBeenCalled();
  });

  it("signing out forgets this device only", async () => {
    db.tables.mira_session = [
      { id: SID, user_id: LEA },
      { id: "1c2d3e4f-5061-4728-9a3b-4c5d6e7f8091", user_id: LEA },
    ];
    const res = await auth(
      new Request("https://www.loveiq.org/api/mira/auth", {
        method: "POST",
        body: JSON.stringify({ action: "logout" }),
      })
    );
    expect(res.status).toBe(200);
    expect(db.tables.mira_session!.map((s) => s.id)).toEqual([
      "1c2d3e4f-5061-4728-9a3b-4c5d6e7f8091",
    ]);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

describe("a Google sign-in", () => {
  it("records the device and shows Google as connected", async () => {
    browser.set("mira-google", packStart(S, { useAssessment: false, next: null }));
    googleSays("lea@gmail.com");
    const res = await googleCallback(
      new Request(`https://www.loveiq.org/api/mira/auth/google/callback?code=c&state=${S.state}`, {
        headers: { "user-agent": MAC },
      })
    );
    expect(res.headers.get("location")).toBe("https://www.loveiq.org/mira/start?google=done");
    expect(db.tables.mira_session).toEqual([
      expect.objectContaining({ user_id: LEA, method: "google", device: "Mac · Chrome" }),
    ]);
    expect(db.tables.mira_user![0]!.google_connected_at).toEqual(expect.any(String));
  });
});

describe("Connect Google, from Settings", () => {
  const own = (url: string) => new Request(url, { headers: { "sec-fetch-site": "same-origin" } });
  const connected = async (email: string) => {
    browser.set("mira-google", packStart(S, { useAssessment: false, next: null, connect: true }));
    googleSays(email);
    const res = await googleCallback(
      new Request(`https://www.loveiq.org/api/mira/auth/google/callback?code=c&state=${S.state}`)
    );
    return res.headers.get("location");
  };

  it("starts for the signed-in account without ticks, asking Google for its own address", async () => {
    const res = await googleStart(own("https://www.loveiq.org/api/mira/auth/google?connect=1"));
    const to = new URL(res.headers.get("location")!);
    expect(to.origin).toBe("https://accounts.google.com");
    expect(to.searchParams.get("login_hint")).toBe("lea@gmail.com");
    expect(browser.get("mira-google")).toBeDefined();
    // Not from our own page: back to Settings, nothing kept.
    browser.clear();
    const foreign = await googleStart(
      new Request("https://www.loveiq.org/api/mira/auth/google?connect=1", {
        headers: { "sec-fetch-site": "cross-site" },
      })
    );
    expect(foreign.headers.get("location")).toBe(
      "https://www.loveiq.org/mira/settings?google=failed#security"
    );
    expect(browser.size).toBe(0);
  });

  it("is refused to staff, under-18s and the signed-out", async () => {
    const at = async () =>
      (await googleStart(own("https://www.loveiq.org/api/mira/auth/google?connect=1"))).headers.get(
        "location"
      );
    db.tables.mira_user![0]!.minor_at = new Date().toISOString();
    expect(await at()).toBe("https://www.loveiq.org/mira/settings?google=minor#security");
    db.tables.mira_user![0]!.minor_at = null;
    db.tables.admin_users!.push({ email: "lea@gmail.com" });
    expect(await at()).toBe("https://www.loveiq.org/mira/settings?google=other#security");
    vi.mocked(getMiraAccount).mockResolvedValue(null);
    expect(await at()).toBe("https://www.loveiq.org/mira/start?next=%2Fmira%2Fsettings");
  });

  it("records the account's own address only, and signs nobody in", async () => {
    expect(await connected("lea.k@gmail.com")).toBe(
      "https://www.loveiq.org/mira/settings?google=mismatch#security"
    );
    expect(db.tables.mira_user![0]!.google_connected_at).toBeUndefined();
    expect(await connected("lea@gmail.com")).toBe(
      "https://www.loveiq.org/mira/settings?google=connected#security"
    );
    expect(db.tables.mira_user![0]!.google_connected_at).toEqual(expect.any(String));
    expect(logMiraEvent).toHaveBeenCalledWith("google_connected", { userId: LEA });
    expect(mintSignInCode).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(db.tables.mira_session ?? []).toEqual([]);
  });

  it("refuses an address Google doesn't run", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue({ id: LEA, email: "lea@yahoo.com" });
    expect(await connected("lea@yahoo.com")).toBe(
      "https://www.loveiq.org/mira/settings?google=other#security"
    );
    expect(db.tables.mira_user![0]!.google_connected_at).toBeUndefined();
  });
});
