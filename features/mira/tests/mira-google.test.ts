import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => jar) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() }),
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
  getMiraAccount: vi.fn().mockResolvedValue(null),
}));
vi.mock("@features/mira/server/sign-in", () => ({
  mintSignInCode: vi.fn().mockResolvedValue("12345678"),
}));
vi.mock("@features/mira/server/store", () => ({
  getProfile: vi.fn().mockResolvedValue({ name: "Lea" }),
  logMiraEvent: vi.fn(),
  upsertProfileAtSignIn: vi.fn().mockResolvedValue({ name: null, remember_chats: true }),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
}));

import { GET as callback } from "@/app/api/mira/auth/google/callback/route";
import { GET as start } from "@/app/api/mira/auth/google/route";
import MiraPage from "@/app/mira/page";
import MiraStartPage from "@/app/mira/start/page";
import {
  authorizeUrl,
  checkIdToken,
  packStart,
  returnOrigin,
  unpackStart,
} from "@features/mira/server/google";
import { getMiraAccount, safeNext } from "@features/mira/server/session";
import { mintSignInCode } from "@features/mira/server/sign-in";
import { supabaseFetch } from "@features/admin/server/supabase";
import { logMiraEvent, upsertProfileAtSignIn } from "@features/mira/server/store";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";

const CLIENT = "123-abc.apps.googleusercontent.com";
const S = {
  state: "state_aaaaaaaaaaaaaaaa",
  verifier: "verifier_bbbbbbbbbbbbbbbbbbbbbbbb",
  nonce: "nonce_cccccccccccccccc",
};
/** The form's choices when nothing optional was ticked and nothing asked to come back to. */
const NONE = { useAssessment: false, shareRated: false, next: null };
const CHAT = "6f2c4a1e-1111-4222-8333-944455556666";
const NOW = Date.parse("2026-11-19T23:00:00Z");

function idToken(claims: Record<string, unknown>): string {
  const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b({ alg: "RS256" })}.${b(claims)}.sig`;
}
const good = {
  iss: "https://accounts.google.com",
  aud: CLIENT,
  exp: NOW / 1000 + 3600,
  nonce: S.nonce,
  email: "Lea.K@Gmail.com",
  email_verified: true,
};

/** A start request clicked on our own sign-up page (the browser says same-origin). */
const own = (url: string) => new Request(url, { headers: { "sec-fetch-site": "same-origin" } });

describe("Google's ID token", () => {
  it("gives the confirmed email only when every claim checks out", () => {
    expect(checkIdToken(idToken(good), CLIENT, S.nonce, NOW)).toEqual({
      email: "lea.k@gmail.com",
      googleRuns: true,
    });
    for (const bad of [
      { aud: "someone-else.apps.googleusercontent.com" },
      { iss: "https://evil.example" },
      { exp: NOW / 1000 - 1 },
      { nonce: "nonce_dddddddddddddddd" },
      { email_verified: false },
      { email: "not-an-email" },
    ]) {
      expect(checkIdToken(idToken({ ...good, ...bad }), CLIENT, S.nonce, NOW)).toBeNull();
    }
    expect(checkIdToken("garbage", CLIENT, S.nonce, NOW)).toBeNull();
    expect(checkIdToken(undefined, CLIENT, S.nonce, NOW)).toBeNull();
  });
});

describe("which addresses Google may vouch for", () => {
  it("Gmail and Workspace on its own domain only, never an address Google merely checked once", () => {
    const runs = (email: string, hd?: string) =>
      checkIdToken(idToken({ ...good, email, ...(hd ? { hd } : {}) }), CLIENT, S.nonce, NOW)
        ?.googleRuns;
    expect(runs("lea@googlemail.com")).toBe(true);
    expect(runs("lea@acme.de", "acme.de")).toBe(true);
    expect(runs("lea@acme.de")).toBe(false);
    expect(runs("lea@acme.de", "other.de")).toBe(false);
    expect(runs("lea@yahoo.com")).toBe(false);
  });
});

describe("the hand-over to Google", () => {
  it("returns only to our own sites, with PKCE and the narrowest scope", () => {
    expect(returnOrigin("https://www.loveiq.org/api/x")).toBe("https://www.loveiq.org");
    expect(returnOrigin("https://staging.loveiq.org/api/x")).toBe("https://staging.loveiq.org");
    expect(returnOrigin("https://loveiq-abc.vercel.app/api/x")).toBeNull();
    const u = new URL(authorizeUrl(CLIENT, "https://www.loveiq.org", S));
    expect(u.searchParams.get("redirect_uri")).toBe(
      "https://www.loveiq.org/api/mira/auth/google/callback"
    );
    expect(u.searchParams.get("scope")).toBe("openid email");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBe(
      createHash("sha256").update(S.verifier).digest("base64url")
    );
    expect(unpackStart(packStart(S, NONE))).toEqual({ ...S, ...NONE });
    const chosen = { useAssessment: true, shareRated: true, next: `/mira?chat=${CHAT}` };
    expect(unpackStart(packStart(S, chosen))).toEqual({ ...S, ...chosen });
    expect(unpackStart(`${packStart(S, NONE)}.extra_eeeeeeeeeeeeeee`)).toBeNull();
    expect(unpackStart([S.state, S.verifier, S.nonce].join("."))).toBeNull();
    expect(unpackStart(`${S.state}.${S.verifier}.${S.nonce}.bnVsbA`)).toBeNull(); // "null"
    expect(unpackStart(undefined)).toBeNull();
  });
});

describe("where a sign-in returns to (next)", () => {
  it("is one of Mira's own pages, spelt exactly, or nothing", () => {
    for (const ok of ["/mira", `/mira?chat=${CHAT}`, "/mira/home", "/mira/settings"]) {
      expect(safeNext(ok)).toBe(ok);
    }
    for (const bad of [
      "//evil.example",
      "/\\evil.example",
      "https://evil.example/mira",
      "/mira/../admin",
      "/mira/home/../../admin",
      "/miracle",
      "/mira?chat=x",
      `/mira?chat=${CHAT}&then=//evil.example`,
      `/mira?chat=${CHAT}#x`,
      "/mira%2F%2Fevil.example",
      " /mira",
      "/mira\n",
      "/admin",
      "",
      null,
      ["/mira"],
    ]) {
      expect(safeNext(bad)).toBeNull();
    }
  });

  it("a stored chat opened while signed out sends the person to sign in, then back to it", async () => {
    const page = (q: Record<string, string>) => MiraPage({ searchParams: Promise.resolve(q) });
    await expect(page({ chat: CHAT })).rejects.toThrow(
      `redirect:/mira/start?next=${encodeURIComponent(`/mira?chat=${CHAT}`)}`
    );
    // No chat asked for, or not a chat id: the anonymous chat, as before.
    await expect(page({})).resolves.toBeTruthy();
    await expect(page({ chat: "../../admin" })).resolves.toBeTruthy();
    // Signed in: the chat opens.
    vi.mocked(getMiraAccount).mockResolvedValueOnce({ id: "u1", email: "lea@example.com" });
    const el = (await page({ chat: CHAT })) as { props: { initialChatId: string | null } };
    expect(el.props.initialChatId).toBe(CHAT);
  });

  it("an account already signed in on the sign-up page goes straight on to next", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue({ id: "u1", email: "lea@example.com" });
    const startPage = (q: Record<string, string>) =>
      MiraStartPage({ searchParams: Promise.resolve(q) });
    await expect(startPage({ next: `/mira?chat=${CHAT}` })).rejects.toThrow(
      `redirect:/mira?chat=${CHAT}`
    );
    await expect(startPage({ next: "//evil.example" })).rejects.toThrow("redirect:/mira/home");
    vi.mocked(getMiraAccount).mockResolvedValue(null);
  });
});

describe("GET /api/mira/auth/google", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MIRA_GOOGLE_CLIENT_ID = CLIENT;
    process.env.MIRA_GOOGLE_CLIENT_SECRET = "secret";
  });

  it("ignores ticks another site's link sets: back to the form, nothing kept", async () => {
    const q = "adult=1&terms=1&consent=1&assessment=1&share=1";
    for (const headers of [
      { "sec-fetch-site": "cross-site" },
      { referer: "https://evil.example/page" },
      {} as Record<string, string>,
    ]) {
      const res = await start(
        new Request(`https://www.loveiq.org/api/mira/auth/google?${q}`, { headers })
      );
      expect(res.headers.get("location")).toBe("https://www.loveiq.org/mira/start?google=ticks");
    }
    expect(jar.set).not.toHaveBeenCalled();
    // A browser without Sec-Fetch-Site that came from our own page still goes on.
    const ours = await start(
      new Request(`https://www.loveiq.org/api/mira/auth/google?${q}`, {
        headers: { referer: "https://www.loveiq.org/mira/start" },
      })
    );
    expect(ours.headers.get("location")).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2/);
  });

  it("needs the three ticks, then sends the person to Google with a one-use cookie", async () => {
    const noTicks = await start(new Request("https://www.loveiq.org/api/mira/auth/google"));
    expect(noTicks.headers.get("location")).toBe("https://www.loveiq.org/mira/start?google=ticks");

    const res = await start(
      own("https://www.loveiq.org/api/mira/auth/google?adult=1&terms=1&consent=1")
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2/);
    expect(jar.set).toHaveBeenCalledWith(
      "mira-google",
      expect.stringMatching(/^[\w-]+\.[\w-]+\.[\w-]+\.[\w-]+$/),
      expect.objectContaining({ httpOnly: true, path: "/api/mira/auth/google", maxAge: 600 })
    );
    // Nothing optional ticked, nowhere to return to.
    expect(unpackStart(vi.mocked(jar.set).mock.calls[0]![1])).toMatchObject(NONE);
  });

  it("keeps the optional ticks and a Mira page to return to, and nothing else, for the callback", async () => {
    const next = encodeURIComponent(`/mira?chat=${CHAT}`);
    await start(
      own(
        `https://www.loveiq.org/api/mira/auth/google?adult=1&terms=1&consent=1&assessment=1&share=1&next=${next}`
      )
    );
    expect(unpackStart(vi.mocked(jar.set).mock.calls[0]![1])).toMatchObject({
      useAssessment: true,
      shareRated: true,
      next: `/mira?chat=${CHAT}`,
    });
    vi.mocked(jar.set).mockClear();
    await start(
      own(
        "https://www.loveiq.org/api/mira/auth/google?adult=1&terms=1&consent=1&assessment=yes&next=%2F%2Fevil.example"
      )
    );
    expect(unpackStart(vi.mocked(jar.set).mock.calls[0]![1])).toMatchObject(NONE);
    // A refusal keeps where the person was going, for the emailed code.
    const ticks = await start(own(`https://www.loveiq.org/api/mira/auth/google?next=${next}`));
    expect(ticks.headers.get("location")).toBe(
      `https://www.loveiq.org/mira/start?google=ticks&next=${next}`
    );
  });

  it("stays hidden without the Google client", async () => {
    delete process.env.MIRA_GOOGLE_CLIENT_SECRET;
    const res = await start(
      own("https://www.loveiq.org/api/mira/auth/google?adult=1&terms=1&consent=1")
    );
    expect(res.headers.get("location")).toBe("https://www.loveiq.org/mira/start?google=off");
  });
});

describe("GET /api/mira/auth/google/callback", () => {
  const back = (q: string) =>
    callback(new Request(`https://www.loveiq.org/api/mira/auth/google/callback?${q}`));

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MIRA_GOOGLE_CLIENT_ID = CLIENT;
    process.env.MIRA_GOOGLE_CLIENT_SECRET = "secret";
    jar.get.mockReturnValue({ value: packStart(S, NONE) });
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.mocked(fetchWithTimeout).mockImplementation(
      async () => new Response(JSON.stringify({ id_token: idToken(good) }), { status: 200 })
    );
    verifyOtp.mockResolvedValue({
      data: { user: { id: "u1", email: "lea.k@gmail.com" } },
      error: null,
    });
    vi.mocked(supabaseFetch).mockImplementation(async () => new Response("[]", { status: 200 }));
  });

  it("signs in with the confirmed email and asks 'About you' when there's no name yet", async () => {
    const res = await back(`code=abc&state=${S.state}`);
    expect(res.headers.get("location")).toBe(
      "https://www.loveiq.org/mira/start?google=done&about=1"
    );
    expect(mintSignInCode).toHaveBeenCalledWith("lea.k@gmail.com");
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "lea.k@gmail.com",
      token: "12345678",
      type: "email",
    });
    expect(upsertProfileAtSignIn).toHaveBeenCalledWith(
      "u1",
      "lea.k@gmail.com",
      expect.any(String),
      {
        useAssessment: false,
        shareRated: false,
      }
    );
    expect(logMiraEvent).toHaveBeenCalledWith(
      "signup_completed",
      expect.objectContaining({ userId: "u1" }),
      { method: "google" }
    );
    // The PKCE verifier went to Google, and the start cookie is gone.
    const sent = String(vi.mocked(fetchWithTimeout).mock.calls[0]![1]!.body);
    expect(new URLSearchParams(sent).get("code_verifier")).toBe(S.verifier);
    expect(jar.delete).toHaveBeenCalledWith({ name: "mira-google", path: "/api/mira/auth/google" });
  });

  it("records the optional ticks with the consent and goes on to next, checked again", async () => {
    const chosen = { useAssessment: true, shareRated: true, next: `/mira?chat=${CHAT}` };
    jar.get.mockReturnValue({ value: packStart(S, chosen) });
    const res = await back(`code=abc&state=${S.state}`);
    expect(upsertProfileAtSignIn).toHaveBeenCalledWith(
      "u1",
      "lea.k@gmail.com",
      expect.any(String),
      {
        useAssessment: true,
        shareRated: true,
      }
    );
    expect(res.headers.get("location")).toBe(
      `https://www.loveiq.org/mira/start?google=done&about=1&next=${encodeURIComponent(chosen.next)}`
    );
    // A cookie whose next isn't a Mira page (it was edited) goes Home, the usual way.
    jar.get.mockReturnValue({ value: packStart(S, { ...chosen, next: "https://evil.example" }) });
    const edited = await back(`code=abc&state=${S.state}`);
    expect(edited.headers.get("location")).toBe(
      "https://www.loveiq.org/mira/start?google=done&about=1"
    );
  });

  it("refuses a foreign state, a missing cookie, a cancel and a bad token", async () => {
    const at = async (q: string) => (await back(q)).headers.get("location");
    expect(await at("code=abc&state=state_zzzzzzzzzzzzzzzz")).toMatch(/google=failed$/);
    expect(await at("error=access_denied")).toMatch(/google=cancelled$/);
    jar.get.mockReturnValueOnce(undefined);
    expect(await at(`code=abc&state=${S.state}`)).toMatch(/google=failed$/);
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      new Response(JSON.stringify({ id_token: idToken({ ...good, nonce: "x" }) }), { status: 200 })
    );
    expect(await at(`code=abc&state=${S.state}`)).toMatch(/google=failed$/);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("sends addresses Google doesn't run, and staff, to the emailed code", async () => {
    const at = async () => (await back(`code=abc&state=${S.state}`)).headers.get("location");
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      new Response(JSON.stringify({ id_token: idToken({ ...good, email: "lea@yahoo.com" }) }), {
        status: 200,
      })
    );
    expect(await at()).toMatch(/google=other$/);
    vi.mocked(supabaseFetch).mockResolvedValueOnce(
      new Response(JSON.stringify([{ email: "lea.k@gmail.com" }]), { status: 200 })
    );
    expect(await at()).toMatch(/google=other$/);
    vi.mocked(supabaseFetch).mockResolvedValueOnce(new Response("oops", { status: 500 }));
    expect(await at()).toMatch(/google=other$/); // unsure counts as staff
    expect(mintSignInCode).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("signs out again when the profile can't be saved, so the next try starts clean", async () => {
    vi.mocked(upsertProfileAtSignIn).mockRejectedValueOnce(new Error("db down"));
    const res = await back(`code=abc&state=${S.state}`);
    expect(res.headers.get("location")).toMatch(/google=failed$/);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(logMiraEvent).not.toHaveBeenCalled();
  });
});
