import { beforeEach, describe, expect, it, vi } from "vitest";
import { softwarePasskey } from "./authenticator";
import { fakeDb, json, token, type Row } from "./fake-db";

/** A browser's cookie jar: what the route sets is what the same browser sends next. */
type Jar = Map<string, string>;
let browser: Jar;
const cookieStore = () => ({
  get: (name: string) => (browser.has(name) ? { name, value: browser.get(name)! } : undefined),
  getAll: () => [...browser].map(([name, value]) => ({ name, value })),
  set: (name: string, value: string) => void browser.set(name, value),
  delete: (o: { name: string } | string) => void browser.delete(typeof o === "string" ? o : o.name),
});
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore()),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@features/admin/server/supabase", () => ({ supabaseFetch: vi.fn() }));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/mira/server/anon", () => ({ anonId: vi.fn().mockResolvedValue("anon_1") }));
const verifyOtp = vi.fn();
const signOut = vi.fn().mockResolvedValue({ error: null });
vi.mock("@features/mira/server/session", () => ({
  createMiraSupabase: vi.fn(async () => ({ auth: { verifyOtp, signOut } })),
  getMiraAccount: vi.fn(),
}));
vi.mock("@features/mira/server/sign-in", async (importOriginal) => ({
  passkeyAddedNotice: (await importOriginal<typeof import("@features/mira/server/sign-in")>())
    .passkeyAddedNotice,
  mintSignInCode: vi.fn().mockResolvedValue("12345678"),
  sendNeutralEmail: vi.fn().mockResolvedValue(true),
}));
vi.mock("@features/mira/server/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/mira/server/store")>()),
  logMiraEvent: vi.fn(),
  upsertProfileAtSignIn: vi.fn().mockResolvedValue({ name: "Lea" }),
}));

import { DELETE, PATCH, POST } from "@/app/api/mira/passkeys/route";
import { sendNeutralEmail } from "@features/mira/server/sign-in";
import { flushAfterResponse } from "@shared/http/after-response";
import { supabaseFetch } from "@features/admin/server/supabase";
import { CONSENT_VERSION } from "@features/mira/server/config";
import { stopForMinor } from "@features/mira/server/minor";
import { userHandleOf } from "@features/mira/server/passkeys";
import { getMiraAccount } from "@features/mira/server/session";
import { mintSignInCode } from "@features/mira/server/sign-in";
import { logMiraEvent, upsertProfileAtSignIn } from "@features/mira/server/store";
import { checkRateLimit } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

const SITE = "https://www.loveiq.org";
const LEA = "6f2c4a1e-1111-4222-8333-944455556666";
const KAI = "7a3d5b2f-2222-4333-8444-a55566667777";
const SID = "0b1c2d3e-4f50-4617-8829-3a4b5c6d7e8f";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

const profile = (id: string, email: string, over: Row = {}): Row => ({
  id,
  email,
  name: "Lea",
  consent_version: CONSENT_VERSION,
  minor_at: null,
  ...over,
});
let db: ReturnType<typeof fakeDb>;
/** Auth's own record of a login's address, where a test moves it away from the profile's copy. */
let logins: Map<string, string>;

function call(method: string, body?: unknown, query = "", site = SITE) {
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      "user-agent": IPHONE,
      "x-vercel-ip-city": "Berlin",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
  const req = new Request(`${site}/api/mira/passkeys${query}`, init);
  return method === "POST" ? POST(req) : method === "PATCH" ? PATCH(req) : DELETE(req);
}
const post = (body: unknown, site?: string) => call("POST", body, "", site);
const read = async (res: Response) => ({ status: res.status, body: await res.json() });
/** Signed in as `id`, `minutesAgo` minutes after signing in on this device. */
const signedIn = (id: string, minutesAgo = 1) =>
  vi.mocked(getMiraAccount).mockResolvedValue({
    id,
    email: id === LEA ? "lea@example.com" : "kai@example.com",
    session: { id: SID, signedInAt: Date.now() - minutesAgo * 60_000 },
  });

/** Adds a software passkey to Lea's account through the route, as Settings does. */
async function addPasskey(user = LEA, via: "settings" | "offer" = "settings") {
  signedIn(user);
  const key = softwarePasskey(userHandleOf(user));
  const { body } = await read(await post({ action: "register-options", via }));
  const res = await read(
    await post({ action: "register", response: key.create(body.options), via })
  );
  expect(res.status).toBe(200);
  return key;
}
/** The sign-in page: options, then the passkey's answer (bent as asked), then the check. */
async function signInWith(key: ReturnType<typeof softwarePasskey>, bend = {}, extra = {}) {
  const { body } = await read(await post({ action: "sign-in-options" }));
  return read(await post({ action: "sign-in", response: key.get(body.options, bend), ...extra }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  browser = new Map();
  db = fakeDb(
    {
      mira_user: [
        profile(LEA, "lea@example.com"),
        profile(KAI, "kai@example.com", { name: "Kai" }),
      ],
      admin_users: [{ email: "staff@loveiq.org" }],
    },
    {
      // GET /auth/v1/admin/users/<id>: the login, on its profile's address unless moved.
      auth: (_b, call) => {
        const id = /^GET \/auth\/v1\/admin\/users\/([^/?]+)$/.exec(call)?.[1] ?? "";
        const email = logins.get(id) ?? db.tables.mira_user?.find((u) => u.id === id)?.email;
        return email ? json({ id, email }) : json({ msg: "User not found" }, 404);
      },
    }
  );
  logins = new Map();
  vi.mocked(supabaseFetch).mockImplementation((p, i) => db.handle(p, i));
  verifyOtp.mockImplementation(async ({ email }: { email: string }) => {
    const id = (db.tables.mira_user ?? []).find((u) => u.email === email)?.id;
    return {
      data: { user: { id, email }, session: { access_token: token({ sub: id, session_id: SID }) } },
      error: null,
    };
  });
  signedIn(LEA);
});

describe("adding a passkey", () => {
  it("keeps the public key, counter and device, never more, and logs it", async () => {
    const key = await addPasskey(LEA, "offer");
    const [row] = db.tables.mira_passkey!;
    expect(row).toMatchObject({
      id: key.id,
      user_id: LEA,
      counter: 0,
      backed_up: true,
      label: "iPhone · Safari",
      transports: ["internal", "hybrid"],
    });
    expect(String(row!.public_key)).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(logMiraEvent).toHaveBeenCalledWith(
      "passkey_added",
      { userId: LEA },
      { via: "offer", synced: true }
    );
    expect(logMiraEvent).toHaveBeenCalledWith("passkey_offer_accepted", { userId: LEA });
    // The owner hears of every new passkey (security review M1), neutrally.
    await flushAfterResponse();
    const [to, notice] = vi.mocked(sendNeutralEmail).mock.calls.at(-1)!;
    expect(to).toMatch(/@/);
    expect(notice.subject).toBe("A passkey was added to your account");
    expect(notice.text).toContain("iPhone · Safari");
    expect(notice.text).not.toMatch(/chat|journal|goal/i);
    // Requires user verification and a discoverable passkey; never asks for attestation.
    const { body } = await read(await post({ action: "register-options", via: "settings" }));
    expect(body.options.authenticatorSelection).toMatchObject({
      residentKey: "required",
      userVerification: "required",
    });
    expect(body.options.attestation).toBe("none");
    expect(body.options.rp.id).toBe("loveiq.org");
    expect(body.options.excludeCredentials).toEqual([expect.objectContaining({ id: key.id })]);
  });

  it("needs a sign-in from the last 15 minutes", async () => {
    signedIn(LEA, 16);
    const res = await read(await post({ action: "register-options" }));
    expect(res).toMatchObject({ status: 403, body: { reauth: true } });
    expect(db.tables.mira_webauthn_challenge ?? []).toEqual([]);
  });

  it("is never for staff, for anyone stopped as under 18, or past ten passkeys", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue({
      id: LEA,
      email: "staff@loveiq.org",
      session: { id: SID, signedInAt: Date.now() },
    });
    expect((await post({ action: "register-options" })).status).toBe(403);
    signedIn(LEA);
    db.tables.mira_user![0]!.minor_at = new Date().toISOString();
    expect(await read(await post({ action: "register-options" }))).toMatchObject({
      status: 403,
      body: { error: "Mira is only for adults." },
    });
    db.tables.mira_user![0]!.minor_at = null;
    db.tables.mira_passkey = Array.from({ length: 10 }, (_, i) => ({
      id: `credential-number-${i}-xxxxxxxx`,
      user_id: LEA,
      transports: [],
    }));
    expect((await post({ action: "register-options" })).status).toBe(400);
  });

  it("uses each challenge once, only in the browser and for the account that asked", async () => {
    const key = softwarePasskey(userHandleOf(LEA));
    const { body } = await read(await post({ action: "register-options" }));
    const created = key.create(body.options);
    const register = () => post({ action: "register", response: created });
    const cookie = new Map(browser);
    // Kai, in Lea's browser, can't finish Lea's registration with her challenge.
    signedIn(KAI);
    expect((await register()).status).toBe(400);
    // Another browser, without the cookie, can't use it either.
    signedIn(LEA);
    browser = new Map();
    expect((await register()).status).toBe(400);
    // Lea's browser can, once.
    browser = new Map(cookie);
    expect((await register()).status).toBe(200);
    browser = new Map(cookie);
    expect(await read(await register())).toMatchObject({ status: 400, body: { retry: true } });
    expect(db.tables.mira_passkey).toHaveLength(1);
  });

  it("refuses a passkey made for another site or without user verification", async () => {
    for (const bend of [
      { origin: "https://evil.example" },
      { rpId: "evil.example" },
      { verified: false },
    ]) {
      const key = softwarePasskey(userHandleOf(LEA));
      const { body } = await read(await post({ action: "register-options" }));
      const res = await post({ action: "register", response: key.create(body.options, bend) });
      expect(res.status, JSON.stringify(bend)).toBe(400);
    }
    expect(db.tables.mira_passkey ?? []).toEqual([]);
  });
});

describe("signing in with a passkey", () => {
  it("makes the same session an emailed code makes, and records the device", async () => {
    const key = await addPasskey();
    browser = new Map();
    const res = await signInWith(key);
    expect(res).toEqual({ status: 200, body: { success: true, needsProfile: false } });
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "lea@example.com",
      token: "12345678",
      type: "email",
    });
    expect(db.tables.mira_session).toEqual([
      expect.objectContaining({
        id: SID,
        user_id: LEA,
        method: "passkey",
        device: "iPhone · Safari",
        city: "Berlin",
      }),
    ]);
    expect(db.tables.mira_passkey![0]!.last_used_at).toEqual(expect.any(String));
    expect(logMiraEvent).toHaveBeenCalledWith(
      "signup_completed",
      { anonId: "anon_1", userId: LEA },
      { method: "passkey" }
    );
    // Consent on file is this wording's: kept as given, not stamped again.
    expect(upsertProfileAtSignIn).not.toHaveBeenCalled();
  });

  it("refuses a replayed answer, and one signed for another challenge", async () => {
    const key = await addPasskey();
    const { body } = await read(await post({ action: "sign-in-options" }));
    const answer = key.get(body.options);
    const cookie = new Map(browser);
    expect((await post({ action: "sign-in", response: answer })).status).toBe(200);
    browser = new Map(cookie);
    expect(await read(await post({ action: "sign-in", response: answer }))).toMatchObject({
      status: 400,
      body: { retry: true },
    });
    await post({ action: "sign-in-options" }); // a fresh challenge, the old answer
    expect((await post({ action: "sign-in", response: answer })).status).toBe(400);
    expect(verifyOtp).toHaveBeenCalledTimes(1);
  });

  it("refuses an answer after the challenge's 5 minutes", async () => {
    const key = await addPasskey();
    const { body } = await read(await post({ action: "sign-in-options" }));
    vi.useFakeTimers({ now: Date.now() + 5 * 60_000 + 1_000, toFake: ["Date"] });
    expect((await post({ action: "sign-in", response: key.get(body.options) })).status).toBe(400);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("refuses another site's origin or RP ID, and no user verification", async () => {
    const key = await addPasskey();
    for (const bend of [
      { origin: "https://evil.example" },
      { rpId: "evil.example" },
      { verified: false },
      { type: "webauthn.create" },
    ]) {
      expect((await signInWith(key, bend)).status, JSON.stringify(bend)).toBe(400);
    }
    // Production's passkeys don't work on staging, which has its own relying party.
    const { body } = await read(
      await post({ action: "sign-in-options" }, "https://staging.loveiq.org")
    );
    expect(body.options.rpId).toBe("staging.loveiq.org");
    expect(
      (await post({ action: "sign-in-options" }, "https://loveiq-preview.vercel.app")).status
    ).toBe(503);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("refuses a counter that went backwards, and one that moved during the check", async () => {
    const key = await addPasskey();
    db.tables.mira_passkey![0]!.counter = 10;
    expect((await signInWith(key, { counter: 5 })).status).toBe(400);
    expect(logger.warn).toHaveBeenCalledWith(
      { reason: expect.stringMatching(/counter/) },
      "mira: a passkey sign-in was refused"
    );
    expect((await signInWith(key, { counter: 11 })).status).toBe(200);
    expect(db.tables.mira_passkey![0]!.counter).toBe(11);
    // A parallel sign-in moves the counter between the check and the save: this one loses.
    const handle = db.handle;
    vi.mocked(supabaseFetch).mockImplementation(async (p, i) => {
      const res = await handle(p, i);
      if (p.startsWith("/rest/v1/mira_passkey?id=eq.") && !i?.method) {
        db.tables.mira_passkey![0]!.counter = 12;
      }
      return res;
    });
    expect((await signInWith(key, { counter: 12 })).status).toBe(400);
    expect(verifyOtp).toHaveBeenCalledTimes(1);
  });

  it("never signs anyone in with another account's passkey, or one we don't know", async () => {
    const key = await addPasskey();
    expect((await signInWith(key, { userHandle: userHandleOf(KAI) })).status).toBe(400);
    const stranger = softwarePasskey(userHandleOf(LEA));
    expect(await signInWith(stranger)).toMatchObject({
      status: 400,
      body: { unknown: true, rpID: "loveiq.org" },
    });
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("never for staff or anyone stopped as under 18: no session either way", async () => {
    const key = await addPasskey();
    db.tables.mira_user![0]!.email = "staff@loveiq.org";
    expect((await signInWith(key)).status).toBe(403);
    db.tables.mira_user![0]!.email = "lea@example.com";
    db.tables.mira_user![0]!.minor_at = new Date().toISOString();
    expect(await signInWith(key)).toMatchObject({
      status: 403,
      body: { error: "Mira is only for adults." },
    });
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(db.tables.mira_session ?? []).toEqual([]);
  });

  it("signs in with the login's own address when the profile's copy is behind, making no other login", async () => {
    const key = await addPasskey();
    // A change of email moved the login, and the profile's copy didn't follow.
    logins.set(LEA, "lea.new@example.com");
    const made: string[] = [];
    vi.mocked(mintSignInCode).mockImplementation(async (email: string) => {
      // As Supabase does: a code for an address no login has makes a new login.
      if (![...logins.values(), "kai@example.com"].includes(email)) made.push(email);
      return "12345678";
    });
    verifyOtp.mockImplementation(async ({ email }: { email: string }) => ({
      data: {
        user: { id: email === "lea.new@example.com" ? LEA : crypto.randomUUID(), email },
        session: { access_token: token({ sub: LEA, session_id: SID }) },
      },
      error: null,
    }));
    const ticks = { adult: true, terms: true, consent: true, useAssessment: false };
    expect(await signInWith(key, {}, { ticks })).toMatchObject({ status: 200 });
    expect(made).toEqual([]);
    expect(verifyOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "lea.new@example.com" })
    );
    // The ticks bring the profile's copy up to date, as a code sign-in does.
    expect(upsertProfileAtSignIn).toHaveBeenCalledWith(
      LEA,
      "lea.new@example.com",
      CONSENT_VERSION,
      { useAssessment: false }
    );
  });

  it("starts no session when the login's address can't be read", async () => {
    const key = await addPasskey();
    const real = vi.mocked(supabaseFetch).getMockImplementation()!;
    vi.mocked(supabaseFetch).mockImplementation(async (p, i) =>
      String(p).startsWith("/auth/v1/") ? new Response("{}", { status: 503 }) : real(p, i)
    );
    expect((await signInWith(key)).status).toBe(500);
    expect(mintSignInCode).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("asks for the ticks when the consent on file is an older wording's, then records them", async () => {
    const key = await addPasskey();
    db.tables.mira_user![0]!.consent_version = "mira-2026-11-18";
    expect(await signInWith(key)).toMatchObject({ status: 409, body: { needsConsent: true } });
    expect(verifyOtp).not.toHaveBeenCalled();
    const ticks = { adult: true, terms: true, consent: true, useAssessment: true };
    expect((await signInWith(key, {}, { ticks })).status).toBe(200);
    expect(upsertProfileAtSignIn).toHaveBeenCalledWith(LEA, "lea@example.com", CONSENT_VERSION, {
      useAssessment: true,
    });
  });

  it("signs out again when the device can't be recorded", async () => {
    const key = await addPasskey();
    verifyOtp.mockResolvedValueOnce({
      data: {
        user: { id: LEA, email: "lea@example.com" },
        session: { access_token: "no.session.id" },
      },
      error: null,
    });
    expect((await signInWith(key)).status).toBe(500);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(logMiraEvent).not.toHaveBeenCalledWith(
      "signup_completed",
      expect.anything(),
      expect.anything()
    );
  });

  it("is rate limited per network", async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: new Date(),
    });
    expect((await post({ action: "sign-in-options" })).status).toBe(429);
  });
});

describe("a passkey from a browser Mira stopped as under 18", () => {
  it("is refused, and the account it belongs to takes the stop too", async () => {
    const key = await addPasskey();
    browser = new Map([["mira_minor", "1"]]);
    expect(await signInWith(key)).toMatchObject({
      status: 403,
      body: { error: "Mira is only for adults." },
    });
    expect(db.tables.mira_user![0]!.minor_at).toEqual(expect.any(String));
    expect(db.tables.mira_passkey).toEqual([]);
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});

describe("an account Mira stopped as under 18", () => {
  it("loses its passkeys, can't add one, and keeps its devices until signed out", async () => {
    const key = await addPasskey();
    db.tables.mira_session = [{ id: SID, user_id: LEA, method: "email", device: "Mac · Safari" }];
    await stopForMinor(LEA);
    expect(db.tables.mira_passkey).toEqual([]);
    expect(db.tables.mira_session).toHaveLength(1);
    expect((await post({ action: "register-options" })).status).toBe(403);
    browser = new Map();
    expect(await signInWith(key)).toMatchObject({ status: 400, body: { unknown: true } });
    // Removing and renaming stay open: they only ever take something away.
    expect((await call("DELETE", undefined, `?id=${key.id}`)).status).toBe(404);
  });
});

describe("renaming and removing", () => {
  it("only ever touches the account's own passkeys", async () => {
    const key = await addPasskey();
    signedIn(KAI);
    expect((await call("PATCH", { id: key.id, label: "Mine now" })).status).toBe(404);
    expect((await call("DELETE", undefined, `?id=${key.id}`)).status).toBe(404);
    expect(db.tables.mira_passkey).toHaveLength(1);
    signedIn(LEA);
    expect((await call("PATCH", { id: key.id, label: "  Lea's iPhone  " })).status).toBe(200);
    expect(db.tables.mira_passkey![0]!.label).toBe("Lea's iPhone");
    expect((await call("PATCH", { id: key.id, label: "x".repeat(61) })).status).toBe(400);
    expect((await call("DELETE", undefined, `?id=${key.id}`)).status).toBe(200);
    expect(db.tables.mira_passkey).toEqual([]);
    expect(logMiraEvent).toHaveBeenCalledWith("passkey_removed", { userId: LEA });
    // A removed passkey signs nobody in.
    browser = new Map();
    expect(await signInWith(key)).toMatchObject({ status: 400, body: { unknown: true } });
  });

  it("needs a signed-in account", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue(null);
    expect((await post({ action: "register-options" })).status).toBe(401);
    expect((await call("DELETE", undefined, "?id=credential-number-1-xxxxxxxx")).status).toBe(401);
  });
});
