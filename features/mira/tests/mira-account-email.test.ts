import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, json, type Row } from "./fake-db";

let browser: Map<string, string>;
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (browser.has(name) ? { name, value: browser.get(name)! } : undefined),
  })),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn(),
  checkCooldown: vi.fn(),
  releaseCooldown: vi.fn(),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@features/admin/server/supabase", () => ({ supabaseFetch: vi.fn() }));
vi.mock("@features/brain/server/sign-in", () => ({ memberByEmail: vi.fn() }));
vi.mock("@features/mira/server/alerts", () => ({ alertCodeCap: vi.fn() }));
vi.mock("@shared/emails/suppression", () => ({ isUndeliverable: vi.fn() }));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/mira/server/session", () => ({ getMiraAccount: vi.fn() }));
// No email ever leaves a test: the sender is mocked, the emails' words are real.
vi.mock("@features/mira/server/sign-in", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/mira/server/sign-in")>()),
  sendNeutralEmail: vi.fn(),
}));
vi.mock("@features/mira/server/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/mira/server/store")>()),
  logMiraEvent: vi.fn(),
}));

import { POST } from "@/app/api/mira/email/route";
import { supabaseFetch } from "@features/admin/server/supabase";
import { memberByEmail } from "@features/brain/server/sign-in";
import { alertCodeCap } from "@features/mira/server/alerts";
import { getMiraAccount } from "@features/mira/server/session";
import { sendNeutralEmail } from "@features/mira/server/sign-in";
import { logMiraEvent } from "@features/mira/server/store";
import { isUndeliverable } from "@shared/emails/suppression";
import { flushAfterResponse } from "@shared/http/after-response";
import { checkCooldown, checkRateLimit, releaseCooldown } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-for-tests-only";
const LEA = "6f2c4a1e-1111-4222-8333-944455556666";
const KAI = "7a3d5b2f-2222-4333-8444-a55566667777";

let db: ReturnType<typeof fakeDb>;
/** Auth's users by address: an address another login has is taken. */
let logins: Row[];
/** How Auth refuses a taken address: its usual 422, or the 500 staging's Auth gave on 22 Nov 2026. */
let takenAs: 422 | 500 = 422;
const cooldowns = new Set<string>();
const refuse = (...buckets: string[]) =>
  vi.mocked(checkRateLimit).mockImplementation(async (_k, cfg) => ({
    allowed: !buckets.includes(cfg.bucket),
    remaining: 0,
    resetAt: new Date(),
  }));
const post = async (body: unknown) => {
  const res = await POST(
    new Request("https://www.loveiq.org/api/mira/email", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const start = (email = "lea.new@example.com") => post({ action: "start", email });
/** The code the last email carried (the mocked sender saw it; the database never does). */
const sentCode = () => {
  const last = vi.mocked(sendNeutralEmail).mock.calls.at(-1)!;
  return /is (\d{8})\./.exec(last[1].text)![1]!;
};
const signedIn = (id: string, email: string, minutesAgo = 1) =>
  vi.mocked(getMiraAccount).mockResolvedValue({
    id,
    email,
    session: {
      id: "0b1c2d3e-4f50-4617-8829-3a4b5c6d7e8f",
      signedInAt: Date.now() - minutesAgo * 60_000,
    },
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  browser = new Map();
  cooldowns.clear();
  refuse();
  vi.mocked(checkCooldown).mockImplementation(async (key, bucket) => {
    if (cooldowns.has(`${bucket}:${key}`)) return { allowed: false, retryAfterMs: 1 };
    cooldowns.add(`${bucket}:${key}`);
    return { allowed: true, retryAfterMs: 0 };
  });
  vi.mocked(releaseCooldown).mockImplementation(async (key, bucket) => {
    cooldowns.delete(`${bucket}:${key}`);
  });
  vi.mocked(isUndeliverable).mockResolvedValue(false);
  vi.mocked(memberByEmail).mockResolvedValue(null);
  vi.mocked(sendNeutralEmail).mockResolvedValue(true);
  takenAs = 422;
  logins = [
    { id: LEA, email: "lea@example.com" },
    { id: KAI, email: "kai@example.com" },
  ];
  db = fakeDb(
    {
      mira_user: [
        { id: LEA, email: "lea@example.com", minor_at: null, google_connected_at: "2026-11-20" },
        { id: KAI, email: "kai@example.com", minor_at: null },
      ],
      admin_users: [{ email: "staff@loveiq.org" }],
      mira_sign_in_code: [{ email: "lea@example.com", attempts: 0 }],
    },
    {
      // mira_claim_email_change_attempt, as the migration writes it.
      rpc: {
        mira_claim_email_change_attempt: (b) => {
          const row = (db.tables.mira_email_change ?? []).find(
            (r) =>
              r.user_id === b.p_user &&
              Date.parse(String(r.issued_at)) > Date.now() - Number(b.p_ttl_seconds) * 1000 &&
              Number(r.attempts) < Number(b.p_max)
          );
          if (!row) return json(null);
          row.attempts = Number(row.attempts) + 1;
          return json({ new_email: row.new_email, code_hash: row.code_hash });
        },
      },
      auth: (b, call) => {
        const id = /\/users\/([^/?]+)$/.exec(call)![1];
        if (logins.some((l) => l.email === b.email && l.id !== id)) {
          return takenAs === 422
            ? json({ error_code: "email_exists" }, 422)
            : json(
                {
                  code: "23505",
                  message:
                    'duplicate key value violates unique constraint "users_email_partial_key"',
                },
                500
              );
        }
        logins.find((l) => l.id === id)!.email = b.email;
        return json({ id, email: b.email });
      },
    }
  );
  vi.mocked(supabaseFetch).mockImplementation((p, i) => db.handle(p, i));
  signedIn(LEA, "lea@example.com");
});

describe("changing the email", () => {
  it("sends a code to the new address, keeping only a keyed hash of it", async () => {
    expect(await start()).toEqual({ status: 200, body: { success: true } });
    const [to, mail] = vi.mocked(sendNeutralEmail).mock.calls[0]!;
    expect(to).toBe("lea.new@example.com");
    expect(mail.subject).toMatch(/^Your confirmation code: \d{8}$/);
    const [pending] = db.tables.mira_email_change!;
    expect(pending).toMatchObject({ user_id: LEA, new_email: "lea.new@example.com", attempts: 0 });
    expect(String(pending!.code_hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(pending)).not.toContain(sentCode());
  });

  it("moves the login and the profile with the code, and tells the old address neutrally", async () => {
    await start();
    const res = await post({ action: "confirm", code: sentCode() });
    expect(res).toEqual({ status: 200, body: { success: true, email: "lea.new@example.com" } });
    expect(logins[0]!.email).toBe("lea.new@example.com");
    expect(db.tables.mira_user![0]).toMatchObject({
      email: "lea.new@example.com",
      google_connected_at: null, // Google confirmed the old address, not this one
    });
    expect(db.tables.mira_email_change).toEqual([]);
    expect(db.tables.mira_sign_in_code).toEqual([]); // the old address's waiting code goes too
    await flushAfterResponse();
    const [to, notice] = vi.mocked(sendNeutralEmail).mock.calls.at(-1)!;
    expect(to).toBe("lea@example.com");
    expect(notice.subject).toBe("Your sign-in email was changed");
    expect(notice.text).toContain("l•••@example.com");
    expect(notice.text).not.toMatch(/lea\.new|Mira|chat/i);
    expect(logMiraEvent).toHaveBeenCalledWith("email_changed", { userId: LEA });
  });

  it("uses a code once", async () => {
    await start();
    const code = sentCode();
    expect((await post({ action: "confirm", code })).status).toBe(200);
    signedIn(LEA, "lea.new@example.com");
    expect((await post({ action: "confirm", code })).status).toBe(400);
  });

  it("stops guessing: five tries a code, then even the right one fails", async () => {
    await start();
    const code = sentCode();
    const wrong = String((Number(code) + 1) % 100_000_000).padStart(8, "0");
    for (let i = 0; i < 5; i++)
      expect((await post({ action: "confirm", code: wrong })).status).toBe(400);
    expect((await post({ action: "confirm", code })).status).toBe(400);
    expect(logins[0]!.email).toBe("lea@example.com");
  });

  it("limits guesses per account and network as well", async () => {
    await start();
    refuse("mira-email-guess");
    expect((await post({ action: "confirm", code: sentCode() })).status).toBe(429);
    expect(db.tables.mira_email_change![0]!.attempts).toBe(0);
  });

  it("lets a code live an hour, and only for the account that asked", async () => {
    await start();
    const code = sentCode();
    signedIn(KAI, "kai@example.com");
    expect((await post({ action: "confirm", code })).status).toBe(400);
    signedIn(LEA, "lea@example.com");
    vi.useFakeTimers({ now: Date.now() + 61 * 60_000, toFake: ["Date"] });
    expect((await post({ action: "confirm", code })).status).toBe(400);
    expect(logins[0]!.email).toBe("lea@example.com");
  });

  it("says an address is taken only once the code proved it is theirs", async () => {
    expect((await start("kai@example.com")).status).toBe(200);
    expect(vi.mocked(sendNeutralEmail)).toHaveBeenCalledTimes(1);
    expect((await post({ action: "confirm", code: "00000000" })).status).toBe(400);
    expect((await post({ action: "confirm", code: sentCode() })).status).toBe(409);
    expect(logins.map((l) => l.email)).toEqual(["lea@example.com", "kai@example.com"]);
    expect(db.tables.mira_email_change).toEqual([]);
  });

  it("says taken too when Auth refuses the address with a 500 and a unique violation", async () => {
    takenAs = 500;
    expect((await start("kai@example.com")).status).toBe(200);
    expect((await post({ action: "confirm", code: sentCode() })).status).toBe(409);
    expect(logins.map((l) => l.email)).toEqual(["lea@example.com", "kai@example.com"]);
    takenAs = 422;
  });

  it("never moves an account onto a staff or Jarvis address", async () => {
    await start("staff@loveiq.org");
    expect((await post({ action: "confirm", code: sentCode() })).status).toBe(403);
    expect(logins[0]!.email).toBe("lea@example.com");
  });

  it("needs a recent sign-in, and isn't for team logins or anyone stopped as under 18", async () => {
    signedIn(LEA, "lea@example.com", 16);
    expect(await start()).toMatchObject({ status: 403, body: { reauth: true } });
    signedIn(LEA, "lea@example.com");
    vi.mocked(memberByEmail).mockResolvedValueOnce({ id: 1 } as never);
    expect((await start()).status).toBe(403);
    db.tables.mira_user![0]!.minor_at = new Date().toISOString();
    expect(await start()).toMatchObject({
      status: 403,
      body: { error: "Mira is only for adults.", minor: true },
    });
    db.tables.mira_user![0]!.minor_at = null;
    expect((await start("lea@example.com")).status).toBe(400);
    expect((await start("not an address")).status).toBe(400);
    expect(sendNeutralEmail).not.toHaveBeenCalled();
  });

  it("keeps the sign-in code's limits: one per inbox per 10 minutes, per network, per hour", async () => {
    expect((await start("lea.new@gmail.com")).status).toBe(200);
    // The same inbox spelt another way waits, as sign-in's codes do.
    expect((await start("l.e.a.new+mira@gmail.com")).status).toBe(429);
    refuse("mira-code-all");
    expect((await start("other@example.com")).status).toBe(429);
    expect(alertCodeCap).toHaveBeenCalledWith(60);
    expect(cooldowns.has("mira-code-wait:other@example.com")).toBe(false); // given back
    refuse("mira-email-day");
    expect((await start("third@example.com")).status).toBe(429);
    expect(sendNeutralEmail).toHaveBeenCalledTimes(1);
  });

  it("shares the inbox's five codes a day with sign-in, so neither path can mail it more", async () => {
    for (let i = 1; i <= 5; i++) cooldowns.add(`mira-code-day-${i}:day@example.com`);
    expect((await start("day@example.com")).status).toBe(429);
    expect(sendNeutralEmail).not.toHaveBeenCalled();
    expect(cooldowns.has("mira-code-wait:day@example.com")).toBe(false); // given back
  });

  it("answers as if sent to an address that bounced, and keeps nothing", async () => {
    vi.mocked(isUndeliverable).mockResolvedValue(true);
    expect(await start()).toEqual({ status: 200, body: { success: true } });
    expect(sendNeutralEmail).not.toHaveBeenCalled();
    expect(db.tables.mira_email_change ?? []).toEqual([]);
  });

  it("gives the wait back when the email fails", async () => {
    vi.mocked(sendNeutralEmail).mockResolvedValueOnce(false);
    expect((await start()).status).toBe(500);
    expect(db.tables.mira_email_change).toEqual([]);
    expect(cooldowns.size).toBe(0);
  });

  it("needs a signed-in account", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue(null);
    expect((await start()).status).toBe(401);
  });
});

describe("when a step of the change fails", () => {
  /** supabaseFetch as the fake database answers it, except the calls `fails` picks: a 503. */
  const failing = (fails: (path: string, method: string) => boolean) => {
    const real = vi.mocked(supabaseFetch).getMockImplementation()!;
    vi.mocked(supabaseFetch).mockImplementation(async (p, i) =>
      fails(String(p), i?.method ?? "GET") ? new Response("{}", { status: 503 }) : real(p, i)
    );
    return () => vi.mocked(supabaseFetch).mockImplementation(real);
  };
  const profileWrite = (p: string, m: string) =>
    p.startsWith("/rest/v1/mira_user?") && m === "PATCH";
  const noticesToOld = () =>
    vi.mocked(sendNeutralEmail).mock.calls.filter(([to]) => to === "lea@example.com");

  it("moves nothing when the profile can't follow: the login goes back, and the code still works", async () => {
    await start();
    const code = sentCode();
    const heal = failing(profileWrite);
    const res = await post({ action: "confirm", code });
    expect(res).toMatchObject({ status: 500 });
    expect(logins[0]!.email).toBe("lea@example.com");
    expect(db.tables.mira_user![0]).toMatchObject({
      email: "lea@example.com",
      google_connected_at: "2026-11-20",
    });
    await flushAfterResponse();
    expect(noticesToOld()).toEqual([]); // nothing changed, so nothing to tell
    heal();
    expect(await post({ action: "confirm", code })).toEqual({
      status: 200,
      body: { success: true, email: "lea.new@example.com" },
    });
    expect([logins[0]!.email, db.tables.mira_user![0]!.email]).toEqual([
      "lea.new@example.com",
      "lea.new@example.com",
    ]);
  });

  it("says it changed, and tells the old address, when the login moved and can't go back", async () => {
    await start();
    let puts = 0;
    failing(
      (p, m) => profileWrite(p, m) || (p.startsWith("/auth/v1/") && m === "PUT" && ++puts > 1)
    );
    const res = await post({ action: "confirm", code: sentCode() });
    expect(res).toEqual({ status: 200, body: { success: true, email: "lea.new@example.com" } });
    expect(logins[0]!.email).toBe("lea.new@example.com");
    await flushAfterResponse();
    expect(noticesToOld()).toHaveLength(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/kept the old address/)
    );
  });

  it("gives the inbox's wait back when the waiting change can't be kept", async () => {
    const heal = failing((p, m) => p.startsWith("/rest/v1/mira_email_change") && m === "POST");
    expect((await start()).status).toBe(500);
    expect(sendNeutralEmail).not.toHaveBeenCalled();
    expect(cooldowns.size).toBe(0);
    heal();
    expect(await start()).toEqual({ status: 200, body: { success: true } });
  });
});
