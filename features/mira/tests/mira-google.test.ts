import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => jar) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@shared/http/fetch-with-timeout", () => ({ fetchWithTimeout: vi.fn() }));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/mira/server/anon", () => ({ anonId: vi.fn().mockResolvedValue("anon_1") }));
const verifyOtp = vi.fn();
vi.mock("@features/mira/server/session", () => ({
  createMiraSupabase: vi.fn(async () => ({ auth: { verifyOtp } })),
}));
vi.mock("@features/mira/server/sign-in", () => ({
  mintSignInCode: vi.fn().mockResolvedValue("12345678"),
}));
vi.mock("@features/mira/server/store", () => ({
  logMiraEvent: vi.fn(),
  upsertProfileAtSignIn: vi.fn().mockResolvedValue({ name: null, remember_chats: true }),
}));

import { GET as callback } from "@/app/api/mira/auth/google/callback/route";
import { GET as start } from "@/app/api/mira/auth/google/route";
import {
  authorizeUrl,
  checkIdToken,
  packStart,
  returnOrigin,
  unpackStart,
} from "@features/mira/server/google";
import { mintSignInCode } from "@features/mira/server/sign-in";
import { logMiraEvent, upsertProfileAtSignIn } from "@features/mira/server/store";
import { fetchWithTimeout } from "@shared/http/fetch-with-timeout";

const CLIENT = "123-abc.apps.googleusercontent.com";
const S = {
  state: "state_aaaaaaaaaaaaaaaa",
  verifier: "verifier_bbbbbbbbbbbbbbbbbbbbbbbb",
  nonce: "nonce_cccccccccccccccc",
};
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
  email: "Lea@Example.com",
  email_verified: true,
};

describe("Google's ID token", () => {
  it("gives the confirmed email only when every claim checks out", () => {
    expect(checkIdToken(idToken(good), CLIENT, S.nonce, NOW)).toEqual({ email: "lea@example.com" });
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
    expect(unpackStart(packStart(S))).toEqual(S);
    expect(unpackStart(`${packStart(S)}.extra_eeeeeeeeeeeeeee`)).toBeNull();
    expect(unpackStart(undefined)).toBeNull();
  });
});

describe("GET /api/mira/auth/google", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MIRA_GOOGLE_CLIENT_ID = CLIENT;
    process.env.MIRA_GOOGLE_CLIENT_SECRET = "secret";
  });

  it("needs the three ticks, then sends the person to Google with a one-use cookie", async () => {
    const noTicks = await start(new Request("https://www.loveiq.org/api/mira/auth/google"));
    expect(noTicks.headers.get("location")).toBe("https://www.loveiq.org/mira/start?google=ticks");

    const res = await start(
      new Request("https://www.loveiq.org/api/mira/auth/google?adult=1&terms=1&consent=1")
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2/);
    expect(jar.set).toHaveBeenCalledWith(
      "mira-google",
      expect.stringMatching(/^[\w-]+\.[\w-]+\.[\w-]+$/),
      expect.objectContaining({ httpOnly: true, path: "/api/mira/auth/google", maxAge: 600 })
    );
  });

  it("stays hidden without the Google client", async () => {
    delete process.env.MIRA_GOOGLE_CLIENT_SECRET;
    const res = await start(
      new Request("https://www.loveiq.org/api/mira/auth/google?adult=1&terms=1&consent=1")
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
    jar.get.mockReturnValue({ value: packStart(S) });
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.mocked(fetchWithTimeout).mockResolvedValue(
      new Response(JSON.stringify({ id_token: idToken(good) }), { status: 200 })
    );
    verifyOtp.mockResolvedValue({
      data: { user: { id: "u1", email: "lea@example.com" } },
      error: null,
    });
  });

  it("signs in with the confirmed email and asks 'About you' when there's no name yet", async () => {
    const res = await back(`code=abc&state=${S.state}`);
    expect(res.headers.get("location")).toBe(
      "https://www.loveiq.org/mira/start?google=done&about=1"
    );
    expect(mintSignInCode).toHaveBeenCalledWith("lea@example.com");
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "lea@example.com",
      token: "12345678",
      type: "email",
    });
    expect(upsertProfileAtSignIn).toHaveBeenCalledWith("u1", "lea@example.com", expect.any(String));
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
});
