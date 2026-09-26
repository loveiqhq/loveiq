/**
 * Who is calling Jarvis (features/brain/server/sign-in.ts): the shared token, a member's
 * own sign-in, or nobody. Every refusal is a status the route turns into a response, and a
 * member's sign-in is trusted only while their registry row says they are active.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...a: unknown[]) => mockSupabaseFetch(...a),
}));
const mockFetch = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...a: unknown[]) => mockFetch(...a),
}));

import {
  forgetSignIns,
  isClaudeRedirect,
  memberByEmail,
  protectedResourceMetadata,
  resolveCaller,
  signInChallenge,
} from "@features/brain/server/sign-in";

const BASE = "https://proj.supabase.co";
const NOW = Date.parse("2026-09-26T18:00:00Z");
const SHARED = "shared-token-0123456789";

/** A token shaped like one Supabase's OAuth server issues. The signature is never read here. */
function jwt(claims: Record<string, unknown>): string {
  const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${part({ alg: "HS256" })}.${part(claims)}.sig`;
}
const oauth = (over: Record<string, unknown> = {}) =>
  jwt({
    iss: `${BASE}/auth/v1`,
    client_id: "client-1",
    email: "mo@loveiq.org",
    exp: NOW / 1000 + 3600,
    ...over,
  });
const bearer = (t: string) => `Bearer ${t}`;

/** Supabase answers /auth/v1/user for the token, and the registry holds `person`. */
function signedIn(email: string, person: string | null) {
  mockFetch.mockResolvedValue({ ok: true, json: async () => ({ email }) });
  mockSupabaseFetch.mockResolvedValue({
    ok: true,
    json: async () => (person ? [{ canonical: person }] : []),
  });
}

beforeEach(() => {
  forgetSignIns();
  vi.clearAllMocks();
  process.env.SUPABASE_URL = `${BASE}/`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.LOVEIQ_MCP_TOKEN = SHARED;
});
afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.LOVEIQ_MCP_TOKEN;
});

describe("resolveCaller", () => {
  it("asks anyone with no token to sign in", async () => {
    for (const header of [null, "", "Bearer ", "Basic abc"]) {
      expect(await resolveCaller(header, NOW)).toMatchObject({ ok: false, status: 401 });
    }
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("accepts the shared token as the shared caller, and never an empty one", async () => {
    expect(await resolveCaller(bearer(SHARED), NOW)).toEqual({
      ok: true,
      caller: { kind: "shared" },
    });
    // Wrong value and wrong length are refusals, not a thrown timingSafeEqual.
    expect(await resolveCaller(bearer("shared-token-0123456780"), NOW)).toMatchObject({
      status: 401,
    });
    expect(await resolveCaller(bearer("short"), NOW)).toMatchObject({ status: 401 });
    delete process.env.LOVEIQ_MCP_TOKEN;
    expect(await resolveCaller(bearer(SHARED), NOW)).toMatchObject({ status: 401 });
  });

  it("names a member who signed in, from Supabase and the people registry", async () => {
    signedIn("MO@loveiq.org", "Mark Oldenburg");
    expect(await resolveCaller(bearer(oauth()), NOW)).toEqual({
      ok: true,
      caller: { kind: "person", name: "Mark Oldenburg", email: "mo@loveiq.org" },
    });
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe(`${BASE}/auth/v1/user`);
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe(
      bearer(oauth())
    );
    // Only an active PERSON counts, matched on the address among their aliases.
    const [path] = mockSupabaseFetch.mock.calls[0]!;
    expect(decodeURIComponent(String(path))).toContain(
      'kind=eq.person&active=is.true&aliases=cs.{"mo@loveiq.org"}'
    );
  });

  it("refuses, without asking Supabase, a token no OAuth client was issued", async () => {
    for (const token of [
      "not-a-jwt",
      oauth({ client_id: undefined }), // an admin-panel session token
      oauth({ iss: "https://other.supabase.co/auth/v1" }),
      oauth({ exp: NOW / 1000 - 1 }),
      oauth({ exp: "never" }),
    ]) {
      expect(await resolveCaller(bearer(token), NOW)).toMatchObject({ ok: false, status: 401 });
    }
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refuses a token Supabase no longer vouches for, whatever its answer says", async () => {
    // A refusal is a refusal even when its body happens to carry an address.
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ email: "mo@loveiq.org" }),
    });
    expect(await resolveCaller(bearer(oauth()), NOW)).toMatchObject({ ok: false, status: 401 });
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("refuses a real sign-in by someone not on the member list, and says why", async () => {
    signedIn("teamwork@loveiq.org", null);
    const r = await resolveCaller(bearer(oauth()), NOW);
    expect(r).toMatchObject({ ok: false, status: 403 });
    expect(r.ok ? "" : r.message).toMatch(/teamwork@loveiq\.org is not on the Jarvis member list/);
  });

  it("calls an outage an outage, not a refusal", async () => {
    mockFetch.mockRejectedValue(new Error("timeout"));
    expect(await resolveCaller(bearer(oauth()), NOW)).toMatchObject({ status: 503 });
    signedIn("mo@loveiq.org", "Mark Oldenburg");
    mockSupabaseFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    expect(await resolveCaller(bearer(oauth()), NOW)).toMatchObject({ status: 503 });
  });

  it("trusts a checked sign-in for a minute, and not a moment past the token's expiry", async () => {
    signedIn("mo@loveiq.org", "Mark Oldenburg");
    await resolveCaller(bearer(oauth()), NOW);
    await resolveCaller(bearer(oauth()), NOW + 59_000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await resolveCaller(bearer(oauth()), NOW + 61_000);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // A token with ten seconds left is re-checked after them, and then refused outright.
    forgetSignIns();
    mockFetch.mockClear();
    const short = oauth({ exp: NOW / 1000 + 10 });
    await resolveCaller(bearer(short), NOW);
    expect(await resolveCaller(bearer(short), NOW + 11_000)).toMatchObject({ status: 401 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("stops a member within a minute of their registry row going inactive", async () => {
    signedIn("mo@loveiq.org", "Mark Oldenburg");
    expect((await resolveCaller(bearer(oauth()), NOW)).ok).toBe(true);
    mockSupabaseFetch.mockResolvedValue({ ok: true, json: async () => [] });
    expect(await resolveCaller(bearer(oauth()), NOW + 61_000)).toMatchObject({ status: 403 });
  });
});

describe("memberByEmail", () => {
  it("counts only an @loveiq.org address, and never queries for anything else", async () => {
    for (const email of [
      "mark@gmail.com",
      "mo@loveiq.org.evil.com",
      'a"}@loveiq.org',
      "a,b@loveiq.org",
    ]) {
      expect(await memberByEmail(email, NOW)).toBeNull();
    }
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("does not remember a failed read", async () => {
    mockSupabaseFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await expect(memberByEmail("mo@loveiq.org", NOW)).rejects.toThrow(/could not be read/);
    mockSupabaseFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ canonical: "Mark Oldenburg" }],
    });
    expect(await memberByEmail("mo@loveiq.org", NOW)).toEqual({
      name: "Mark Oldenburg",
      email: "mo@loveiq.org",
    });
  });
});

describe("the sign-in documents", () => {
  it("points Claude at Supabase's OAuth server for this origin, asking only for email", () => {
    expect(protectedResourceMetadata("https://www.loveiq.org")).toMatchObject({
      resource: "https://www.loveiq.org/api/mcp",
      authorization_servers: [`${BASE}/auth/v1`],
      scopes_supported: ["email"],
    });
    expect(signInChallenge("https://www.loveiq.org")).toBe(
      'Bearer resource_metadata="https://www.loveiq.org/.well-known/oauth-protected-resource/api/mcp", scope="email"'
    );
  });

  it("serves the same document at the root and at the resource's own path", async () => {
    const { GET: atRoot } = await import("@/app/.well-known/oauth-protected-resource/route");
    const { GET: atPath } =
      await import("@/app/.well-known/oauth-protected-resource/api/mcp/route");
    for (const get of [atRoot, atPath]) {
      const res = get(new Request("https://www.loveiq.org/.well-known/oauth-protected-resource"));
      expect(await res.json()).toMatchObject({
        resource: "https://www.loveiq.org/api/mcp",
        authorization_servers: [`${BASE}/auth/v1`],
      });
    }
  });

  it("lets an approval go back only to Claude", () => {
    for (const ok of [
      "https://claude.ai/api/mcp/auth_callback",
      "https://claude.com/api/mcp/auth_callback",
      "http://localhost:54123/callback",
      "http://127.0.0.1:8976/callback",
    ]) {
      expect(isClaudeRedirect(ok), ok).toBe(true);
    }
    for (const bad of [
      "https://claude.ai.evil.com/cb",
      "https://evilclaude.ai/cb",
      "http://claude.ai/api/mcp/auth_callback",
      "https://evil.com/cb",
      "https://localhost/cb",
      "javascript:alert(1)",
      "not a url",
    ]) {
      expect(isClaudeRedirect(bad), bad).toBe(false);
    }
  });
});
