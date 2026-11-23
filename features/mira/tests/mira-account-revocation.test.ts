import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, token } from "./fake-db";

/**
 * A device signed out from Settings is refused by every Mira route and page, not just hidden: the
 * real getMiraAccount runs here against a session Supabase still accepts, whose device row is gone.
 */
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
const auth = { getSession: vi.fn(), getUser: vi.fn(), signOut: vi.fn(), verifyOtp: vi.fn() };
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth }) }));
vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() }),
  checkCooldown: vi.fn().mockResolvedValue({ allowed: true, retryAfterMs: 0 }),
  releaseCooldown: vi.fn(),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@features/admin/server/supabase", () => ({ supabaseFetch: vi.fn() }));
vi.mock("@features/brain/server/sign-in", () => ({
  memberByEmail: vi.fn().mockResolvedValue(null),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
}));

import { POST as authRoute } from "@/app/api/mira/auth/route";
import { GET as googleStart } from "@/app/api/mira/auth/google/route";
import { POST as bodyCheck } from "@/app/api/mira/body-check/route";
import { POST as chat } from "@/app/api/mira/chat/route";
import { GET as chatById } from "@/app/api/mira/chats/[id]/route";
import { POST as email } from "@/app/api/mira/email/route";
import { POST as event } from "@/app/api/mira/event/route";
import { DELETE as meDelete, GET as meGet, PATCH as mePatch } from "@/app/api/mira/me/route";
import { DELETE as keyDelete, POST as keys } from "@/app/api/mira/passkeys/route";
import { DELETE as securityDelete, GET as security } from "@/app/api/mira/security/route";
import SettingsPage from "@/app/mira/settings/page";
import { supabaseFetch } from "@features/admin/server/supabase";
import { flushAfterResponse } from "@shared/http/after-response";

const LEA = "6f2c4a1e-1111-4222-8333-944455556666";
const SID = "0b1c2d3e-4f50-4617-8829-3a4b5c6d7e8f";
const CHAT = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b";
const SITE = "https://www.loveiq.org";
let db: ReturnType<typeof fakeDb>;

const req = (path: string, method = "GET", body?: unknown) =>
  new Request(`${SITE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "sec-fetch-site": "same-origin" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  browser = new Map();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.example";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  process.env.MIRA_GOOGLE_CLIENT_ID = "client";
  process.env.MIRA_GOOGLE_CLIENT_SECRET = "secret";
  db = fakeDb({
    mira_user: [
      { id: LEA, email: "lea@example.com", name: "Lea", remember_chats: true, minor_at: null },
    ],
    mira_chat: [{ id: CHAT, user_id: LEA, title: "Mine" }],
    mira_message: [{ id: 1, chat_id: CHAT, role: "assistant", content: "Hi Lea", rating: null }],
    // Lea's session is valid at Supabase, but its device was signed out: no mira_session row.
    mira_session: [],
    admin_users: [],
  });
  vi.mocked(supabaseFetch).mockImplementation((p, i) => db.handle(p, i));
  auth.getSession.mockResolvedValue({
    data: { session: { access_token: token({ sub: LEA, session_id: SID }) } },
  });
  auth.getUser.mockResolvedValue({ data: { user: { id: LEA, email: "lea@example.com" } } });
  auth.signOut.mockResolvedValue({ error: null });
});

describe("a signed-out device, on every Mira route", () => {
  it("gets nothing of the account from the account routes", async () => {
    const answers = {
      "GET me": await meGet(req("/api/mira/me")),
      "PATCH me": await mePatch(req("/api/mira/me", "PATCH", { name: "Someone else" })),
      "DELETE me": await meDelete(req("/api/mira/me?what=chats", "DELETE")),
      "GET chat": await chatById(req(`/api/mira/chats/${CHAT}`), {
        params: Promise.resolve({ id: CHAT }),
      }),
      "POST body-check": await bodyCheck(
        req("/api/mira/body-check", "POST", { answers: Array(10).fill(3) })
      ),
      "POST carry": await authRoute(
        req("/api/mira/auth", "POST", { action: "carry", carry: [{ role: "user", content: "hi" }] })
      ),
      "GET security": await security(req("/api/mira/security")),
      "DELETE security": await securityDelete(req("/api/mira/security?device=all", "DELETE")),
      "POST passkey": await keys(req("/api/mira/passkeys", "POST", { action: "register-options" })),
      "DELETE passkey": await keyDelete(
        req("/api/mira/passkeys?id=credential-number-1-xxxxxxxx", "DELETE")
      ),
      "POST email": await email(
        req("/api/mira/email", "POST", { action: "start", email: "x@example.com" })
      ),
    };
    for (const [name, res] of Object.entries(answers)) expect(res.status, name).toBe(401);
    expect(db.tables.mira_user![0]!.name).toBe("Lea");
    expect(db.tables.mira_chat).toHaveLength(1);
    // And the session itself is ended at Supabase, so its refresh token is dead too.
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("is a stranger to the chat, the ratings and Connect Google", async () => {
    // A crisis message (answered without the model) with the account's chat id: nothing is
    // stored in that chat, and it counts as a signed-out visitor's.
    const res = await chat(
      req("/api/mira/chat", "POST", {
        message: "I want to kill myself",
        chatId: CHAT,
        consent: true,
      })
    );
    expect(((await res.json()) as { chatId: unknown }).chatId).toBeNull();
    expect(db.tables.mira_message).toHaveLength(1);
    const rated = await event(
      req("/api/mira/event", "POST", { type: "rating", rating: -1, messageId: 1 })
    );
    expect(rated.status).toBe(200);
    expect(db.tables.mira_message![0]!.rating).toBeNull();
    await flushAfterResponse();
    expect((db.tables.mira_event ?? []).map((e) => e.user_id)).not.toContain(LEA);
    const google = await googleStart(req("/api/mira/auth/google?connect=1"));
    expect(google.headers.get("location")).toBe(`${SITE}/mira/start?next=%2Fmira%2Fsettings`);
  });

  it("is sent to sign in by the pages", async () => {
    await expect(SettingsPage()).rejects.toThrow("redirect:/mira/start");
  });

  it("works again only after a new sign-in records a device", async () => {
    db.tables.mira_session = [
      {
        id: SID,
        user_id: LEA,
        created_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      },
    ];
    expect((await meGet(req("/api/mira/me"))).status).toBe(200);
  });
});

describe("every route and page reads the account through getMiraAccount", () => {
  /** Every .ts/.tsx file under `dir`. */
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
    });
  it("so none asks Supabase for the user or session itself", () => {
    const offenders = [
      ...files("app/api/mira"),
      ...files("app/mira"),
      ...files("features/mira/server"),
    ]
      // join() writes "\" on Windows; compare the path as written here.
      .filter((f) => !f.replace(/\\/g, "/").endsWith("features/mira/server/session.ts"))
      .filter((f) => /auth\.(getUser|getSession|getClaims)\(/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
