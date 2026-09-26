/**
 * /jarvis/connect: the page Claude sends someone to, and the three routes behind it. Only a
 * member gets a code, only a member's approval counts, and an approval only ever goes back
 * to Claude.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let members: Record<string, string> = {};
// Eight digits, as this project mints them (mailer_otp_length).
let otp: string | undefined = "12345678";
const mockSupabaseFetch = vi.fn(async (path: string, init?: { body?: string }) => {
  if (path.startsWith("/rest/v1/brain_person")) {
    const email = /cs\.%7B%22(.+?)%22%7D/.exec(path)?.[1]?.replace("%40", "@") ?? "";
    const name = members[email];
    return { ok: true, status: 200, json: async () => (name ? [{ canonical: name }] : []) };
  }
  if (path === "/auth/v1/admin/users") return { ok: false, status: 422, json: async () => ({}) };
  if (path === "/auth/v1/admin/generate_link") {
    void init;
    return { ok: true, status: 200, json: async () => ({ email_otp: otp, hashed_token: "h" }) };
  }
  return { ok: false, status: 404, json: async () => ({}) };
});
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...a: unknown[]) => mockSupabaseFetch(...(a as [string])),
}));

const auth = {
  getUser: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  oauth: {
    getAuthorizationDetails: vi.fn(),
    approveAuthorization: vi.fn(),
    denyAuthorization: vi.fn(),
  },
};
vi.mock("@features/admin/server/supabase-server", () => ({
  createSupabaseServer: async () => ({ auth }),
}));

const mockSend = vi.fn(async () => ({ error: null }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...a: unknown[]) => mockSend(...(a as [])) };
  },
}));

let csrfOk = true;
vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: async () => csrfOk }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: async () => ({ allowed: true }),
  getClientIp: () => "1.2.3.4",
}));
const mockNotify = vi.fn();
vi.mock("@shared/observability/slack", () => ({
  notifySlack: (...a: unknown[]) => mockNotify(...a),
  escapeSlack: (s: string) => s,
}));

import { connectState, decide } from "@features/brain/server/connect";
import { forgetSignIns } from "@features/brain/server/sign-in";
import { POST as signInPOST } from "@/app/api/jarvis/sign-in/route";
import { POST as verifyPOST } from "@/app/api/jarvis/verify/route";
import { POST as decisionPOST } from "@/app/api/jarvis/decision/route";
import { POST as signOutPOST } from "@/app/api/jarvis/sign-out/route";

const CLAUDE = "https://claude.ai/api/mcp/auth_callback";
const asking = (redirect_uri = CLAUDE) => ({
  data: {
    authorization_id: "auth-1",
    redirect_uri,
    client: { name: "Claude" },
    user: { id: "u", email: "mo@loveiq.org" },
    scope: "email",
  },
  error: null,
});
const signedIn = (email: string | null) =>
  auth.getUser.mockResolvedValue({ data: { user: email ? { email } : null } });
const post = (body: unknown) =>
  new Request("https://www.loveiq.org/api/jarvis/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  forgetSignIns();
  members = { "mo@loveiq.org": "Mark Oldenburg" };
  otp = "12345678";
  csrfOk = true;
  process.env.RESEND_API_KEY = "re_test";
  auth.oauth.getAuthorizationDetails.mockResolvedValue(asking());
  auth.oauth.approveAuthorization.mockResolvedValue({
    data: { redirect_url: `${CLAUDE}?code=abc&state=s` },
    error: null,
  });
  auth.oauth.denyAuthorization.mockResolvedValue({
    data: { redirect_url: `${CLAUDE}?error=access_denied&state=s` },
    error: null,
  });
});

describe("what the page shows", () => {
  it("walks from no request, to signing in, to asking the member", async () => {
    expect(await connectState(null)).toEqual({ kind: "no-request" });
    signedIn(null);
    expect(await connectState("auth-1")).toEqual({ kind: "sign-in" });
    signedIn("mo@loveiq.org");
    expect(await connectState("auth-1")).toEqual({
      kind: "consent",
      app: "Claude",
      name: "Mark Oldenburg",
      email: "mo@loveiq.org",
    });
  });

  it("tells a signed-in non-member so, and never looks up the request", async () => {
    signedIn("teamwork@loveiq.org");
    expect(await connectState("auth-1")).toEqual({
      kind: "not-member",
      email: "teamwork@loveiq.org",
    });
    expect(auth.oauth.getAuthorizationDetails).not.toHaveBeenCalled();
  });

  it("sends a member who already allowed this app straight back", async () => {
    signedIn("mo@loveiq.org");
    auth.oauth.getAuthorizationDetails.mockResolvedValue({
      data: { redirect_url: `${CLAUDE}?code=xyz` },
      error: null,
    });
    expect(await connectState("auth-1")).toEqual({ kind: "redirect", url: `${CLAUDE}?code=xyz` });
  });

  it("refuses an app that would send the sign-in anywhere but Claude, naming where", async () => {
    signedIn("mo@loveiq.org");
    auth.oauth.getAuthorizationDetails.mockResolvedValue(asking("https://evil.example/cb"));
    expect(await connectState("auth-1")).toEqual({
      kind: "not-claude",
      app: "Claude",
      host: "evil.example",
    });
  });

  it("calls an expired request expired", async () => {
    signedIn("mo@loveiq.org");
    auth.oauth.getAuthorizationDetails.mockResolvedValue({
      data: null,
      error: { message: "gone" },
    });
    expect(await connectState("auth-1")).toMatchObject({ kind: "error" });
  });
});

describe("the decision", () => {
  it("approves for a member and returns Claude's callback with the code", async () => {
    signedIn("mo@loveiq.org");
    expect(await decide("auth-1", true)).toEqual({
      ok: true,
      url: `${CLAUDE}?code=abc&state=s`,
      app: "Claude",
      member: "Mark Oldenburg",
    });
    expect(auth.oauth.approveAuthorization).toHaveBeenCalledWith("auth-1", {
      skipBrowserRedirect: true,
    });
  });

  it("never approves for a stranger's app, a non-member or nobody", async () => {
    signedIn("mo@loveiq.org");
    auth.oauth.getAuthorizationDetails.mockResolvedValue(asking("https://evil.example/cb"));
    expect(await decide("auth-1", true)).toMatchObject({ ok: false, status: 400 });
    signedIn("teamwork@loveiq.org");
    expect(await decide("auth-1", true)).toMatchObject({ ok: false, status: 403 });
    signedIn(null);
    expect(await decide("auth-1", true)).toMatchObject({ ok: false, status: 401 });
    expect(auth.oauth.approveAuthorization).not.toHaveBeenCalled();
  });

  it("posts a new connection to #brain, and a cancel nowhere", async () => {
    signedIn("mo@loveiq.org");
    const res = await decisionPOST(post({ authorization_id: "auth-1", decision: "approve" }));
    expect(await res.json()).toEqual({ redirect_url: `${CLAUDE}?code=abc&state=s` });
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "brain",
        text: ":key: Mark Oldenburg connected Claude to Jarvis",
      })
    );
    mockNotify.mockClear();
    const denied = await decisionPOST(post({ authorization_id: "auth-1", decision: "deny" }));
    expect((await denied.json()).redirect_url).toContain("error=access_denied");
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe("the sign-in code", () => {
  it("emails a member a code, and a non-member nothing, with the same answer", async () => {
    const member = await signInPOST(post({ email: "MO@loveiq.org" }));
    const stranger = await signInPOST(post({ email: "someone@loveiq.org" }));
    expect(member.status).toBe(200);
    expect(await member.json()).toEqual(await stranger.json());
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "mo@loveiq.org",
        subject: "Your Jarvis sign-in code: 12345678",
      })
    );
  });

  it("says so when no code could be minted, rather than claiming one was sent", async () => {
    otp = undefined;
    expect((await signInPOST(post({ email: "mo@loveiq.org" }))).status).toBe(500);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("refuses a request without the CSRF token, or without an address", async () => {
    csrfOk = false;
    expect((await signInPOST(post({ email: "mo@loveiq.org" }))).status).toBe(403);
    csrfOk = true;
    expect((await signInPOST(post({ email: "not an email" }))).status).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("signs a member in with the code, and turns away a code that fails", async () => {
    auth.verifyOtp.mockResolvedValue({ error: null });
    const ok = await verifyPOST(post({ email: "MO@loveiq.org ", code: " 12345678" }));
    expect(ok.status).toBe(200);
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: "mo@loveiq.org",
      token: "12345678",
      type: "email",
    });
    // Any length Supabase can be set to mint, six to ten digits.
    expect((await verifyPOST(post({ email: "mo@loveiq.org", code: "123456" }))).status).toBe(200);

    auth.verifyOtp.mockResolvedValue({ error: { message: "Token has expired or is invalid" } });
    expect((await verifyPOST(post({ email: "mo@loveiq.org", code: "00000000" }))).status).toBe(400);
    for (const code of ["12345", "12345678901", "1234abcd"]) {
      expect((await verifyPOST(post({ email: "mo@loveiq.org", code }))).status, code).toBe(400);
    }
  });

  it("signs straight back out someone whose membership ended after the code was sent", async () => {
    auth.verifyOtp.mockResolvedValue({ error: null });
    members = {};
    expect((await verifyPOST(post({ email: "mo@loveiq.org", code: "12345678" }))).status).toBe(403);
    expect(auth.signOut).toHaveBeenCalled();
  });
});

describe("signing out", () => {
  it("forgets the sign-in, and takes no arguments", async () => {
    expect((await signOutPOST(post({}))).status).toBe(200);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect((await signOutPOST(post({ everywhere: true }))).status).toBe(400);
    csrfOk = false;
    expect((await signOutPOST(post({}))).status).toBe(403);
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });
});
