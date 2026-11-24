import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, resetAt: new Date() }),
  checkCooldown: vi.fn(),
  releaseCooldown: vi.fn(),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@features/mira/server/alerts", () => ({ alertCodeCap: vi.fn() }));
vi.mock("@shared/emails/suppression", () => ({ isUndeliverable: vi.fn() }));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/mira/server/anon", () => ({
  anonId: vi.fn().mockResolvedValue("anon_test_123456789"),
}));
const verifyOtp = vi.fn();
const signOut = vi.fn().mockResolvedValue({ error: null });
const getMiraAccount = vi.fn();
vi.mock("@features/mira/server/session", () => ({
  createMiraSupabase: vi.fn(async () => ({ auth: { verifyOtp, signOut } })),
  getMiraAccount: () => getMiraAccount(),
}));
// Sign-in & security (22 Nov 2026): the device a sign-in records, and the passkey offer's checks
// (tested in mira-account-sign-in.test.ts).
vi.mock("@features/mira/server/devices", () => ({
  recordSession: vi.fn().mockResolvedValue(undefined),
  signOutDevices: vi.fn().mockResolvedValue(1),
}));
vi.mock("@features/mira/server/minor", () => ({
  isMinor: vi.fn().mockResolvedValue(false),
  carryMinorStop: vi.fn().mockResolvedValue(false),
}));
vi.mock("@features/mira/server/google", () => ({ isStaffEmail: vi.fn().mockResolvedValue(false) }));
// The crisis-word check stands in for itself: "MARKED" plays a message with crisis words, so the
// title rule is tested without writing any (safety.ts has its own tests).
vi.mock("@features/mira/server/safety", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/mira/server/safety")>()),
  isCrisisMessage: (text: string) => text.includes("MARKED"),
}));
vi.mock("@features/mira/server/passkeys", () => ({
  MAX_PASSKEYS: 10,
  listPasskeys: vi.fn().mockResolvedValue([]),
}));
vi.mock("@features/mira/server/sign-in", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@features/mira/server/sign-in")>()),
  sendSignInCode: vi.fn().mockResolvedValue(true),
}));
vi.mock("@features/mira/server/store", () => ({
  addMessages: vi.fn().mockResolvedValue([1, 2]),
  // The chat Mira kept from this browser signed out (24 Nov 2026).
  adoptAnonChat: vi.fn().mockResolvedValue(true),
  deleteAnonChats: vi.fn().mockResolvedValue(undefined),
  createChat: vi.fn().mockResolvedValue("6f2c4a1e-1111-4222-8333-944455556666"),
  getProfile: vi.fn().mockResolvedValue({ name: "Lea", remember_chats: true }),
  logMiraEvent: vi.fn(),
  recordCodeIssued: vi.fn().mockResolvedValue(undefined),
  claimCodeAttempt: vi.fn().mockResolvedValue(true),
  consumeCode: vi.fn().mockResolvedValue(undefined),
  upsertProfileAtSignIn: vi.fn().mockResolvedValue({ name: null, remember_chats: true }),
}));

import { POST } from "@/app/api/mira/auth/route";
import miraConfig from "@features/mira/content/mira-config.json";
import { CONSENT_VERSION } from "@features/mira/server/config";
import { alertCodeCap } from "@features/mira/server/alerts";
import { addressKey, sendSignInCode } from "@features/mira/server/sign-in";
import { isUndeliverable } from "@shared/emails/suppression";
import { isMinor } from "@features/mira/server/minor";
import {
  addMessages,
  adoptAnonChat,
  createChat,
  deleteAnonChats,
  getProfile,
  claimCodeAttempt,
  consumeCode,
  recordCodeIssued,
  upsertProfileAtSignIn,
} from "@features/mira/server/store";
import {
  checkCooldown,
  checkRateLimit,
  getClientIp,
  releaseCooldown,
} from "@shared/http/ratelimit";

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/mira/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "t" },
      body: JSON.stringify(body),
    })
  );
}

const start = (email: string) =>
  post({ action: "start", email, adult: true, terms: true, consent: true });

/** Redis's cooldowns, in memory: a key is taken until it is released. */
const cooldowns = new Set<string>();
/** checkRateLimit refusing the named buckets. */
const refuse = (...buckets: string[]) =>
  vi.mocked(checkRateLimit).mockImplementation(async (_key, cfg) => ({
    allowed: !buckets.includes(cfg.bucket),
    remaining: 0,
    resetAt: new Date(),
  }));

describe("POST /api/mira/auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    vi.mocked(getClientIp).mockReturnValue("127.0.0.1");
    vi.mocked(isUndeliverable).mockResolvedValue(false);
    verifyOtp.mockResolvedValue({
      data: { user: { id: "u1", email: "Lea@Example.com" } },
      error: null,
    });
  });

  it("sends a code only with all three ticks", async () => {
    const missing = await post({
      action: "start",
      email: "lea@example.com",
      adult: true,
      terms: true,
    });
    expect(missing.status).toBe(400);
    const ok = await post({
      action: "start",
      email: "lea@example.com",
      adult: true,
      terms: true,
      consent: true,
    });
    expect(ok.status).toBe(200);
    expect(sendSignInCode).toHaveBeenCalledWith("lea@example.com");
  });

  it("accepts the 8-digit codes Supabase mints", async () => {
    const res = await post({ action: "verify", email: "lea@example.com", code: "12345678" });
    expect(res.status).toBe(200);
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "lea@example.com",
      token: "12345678",
      type: "email",
    });
    expect(upsertProfileAtSignIn).toHaveBeenCalledWith("u1", "lea@example.com", CONSENT_VERSION, {
      useAssessment: false,
    });
  });

  it("records the form's optional tick with the consent, off unless ticked; the rating box is gone", async () => {
    const verify = (ticks: Record<string, unknown>) =>
      post({ action: "verify", email: "lea@example.com", code: "12345678", ...ticks });
    await verify({ useAssessment: true, shareRated: true }); // an older page's box is ignored
    await verify({ useAssessment: false });
    expect(vi.mocked(upsertProfileAtSignIn).mock.calls.map((c) => c[3])).toEqual([
      { useAssessment: true },
      { useAssessment: false },
    ]);
    expect((await verify({ useAssessment: "yes" })).status).toBe(400);
    expect(CONSENT_VERSION).not.toBe("mira-2026-11-18"); // the reworded ticks are asked again
  });

  it("checks no code when Mira has no guess left for the address (or never sent one)", async () => {
    vi.mocked(claimCodeAttempt).mockResolvedValueOnce(false);
    const res = await post({ action: "verify", email: "lea@example.com", code: "12345678" });
    expect(res.status).toBe(400);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("records each sent code, so a new code resets the guesses", async () => {
    await post({
      action: "start",
      email: "lea@example.com",
      adult: true,
      terms: true,
      consent: true,
    });
    expect(recordCodeIssued).toHaveBeenCalledWith("lea@example.com");
  });

  it("fails closed when a sent code cannot be recorded", async () => {
    vi.mocked(recordCodeIssued).mockRejectedValueOnce(new Error("db down"));
    const res = await post({
      action: "start",
      email: "lea@example.com",
      adult: true,
      terms: true,
      consent: true,
    });
    expect(res.status).toBe(500);
  });

  it("uses up the code once it signs the person in", async () => {
    await post({ action: "verify", email: "lea@example.com", code: "12345678" });
    expect(consumeCode).toHaveBeenCalledWith("lea@example.com");
  });

  it("refuses a wrong code without signing in", async () => {
    verifyOtp.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "Token has expired or is invalid" },
    });
    const res = await post({ action: "verify", email: "lea@example.com", code: "00000000" });
    expect(res.status).toBe(400);
    expect(upsertProfileAtSignIn).not.toHaveBeenCalled();
  });

  it("carries the anonymous chat into the new account", async () => {
    await post({
      action: "verify",
      email: "lea@example.com",
      code: "12345678",
      carry: [
        { role: "user", content: "I hide during sex" },
        { role: "assistant", content: "Tell me more." },
      ],
    });
    expect(addMessages).toHaveBeenCalledTimes(1);
    expect(vi.mocked(addMessages).mock.calls[0]![1]).toHaveLength(2);
  });

  it("after Google sign-in, brings the chat along only for a signed-in person who keeps chats", async () => {
    const turns = [
      { role: "user", content: "I avoid mirrors" },
      { role: "assistant", content: "Since when?" },
    ];
    getMiraAccount.mockResolvedValueOnce(null);
    expect((await post({ action: "carry", carry: turns })).status).toBe(401);
    expect(createChat).not.toHaveBeenCalled();

    getMiraAccount.mockResolvedValue({ id: "u1", email: "lea@example.com" });
    const res = await post({ action: "carry", carry: turns });
    expect(await res.json()).toMatchObject({ success: true, chatId: expect.any(String) });
    expect(createChat).toHaveBeenCalledWith("u1", "I avoid mirrors");
    expect(vi.mocked(addMessages).mock.calls[0]![1]).toHaveLength(2);

    vi.mocked(getProfile).mockResolvedValueOnce({ name: "Lea", remember_chats: false } as never);
    vi.mocked(createChat).mockClear();
    // Not kept, and why: the page says so instead of dropping it without a word (ID-20).
    expect(await (await post({ action: "carry", carry: turns })).json()).toMatchObject({
      chatId: null,
      memoryOff: true,
    });
    expect(createChat).not.toHaveBeenCalled();
  });

  it("names a carried chat by its date when its start brought the support lines (CHAT-17)", async () => {
    getMiraAccount.mockResolvedValue({ id: "u1", email: "lea@example.com" });
    const dated = /^Chat on \d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/;
    const title = () => vi.mocked(createChat).mock.calls.at(-1)![1];
    // The first message has crisis words.
    await post({ action: "carry", carry: [{ role: "user", content: "MARKED words" }] });
    expect(title()).toMatch(dated);
    // The first reply was the fixed support reply, or the browser marked it as one.
    const opened = (reply: Record<string, unknown>) =>
      post({ action: "carry", carry: [{ role: "user", content: "about my body" }, reply] });
    await opened({ role: "assistant", content: miraConfig.crisisMessage });
    expect(title()).toMatch(dated);
    await opened({ role: "assistant", content: "A model reply.", crisis: true });
    expect(title()).toMatch(dated);
    // Otherwise its first message, as before; a code sign-in's carry too.
    await opened({ role: "assistant", content: "A model reply." });
    expect(title()).toBe("about my body");
    await post({
      action: "verify",
      email: "lea@example.com",
      code: "12345678",
      carry: [{ role: "user", content: "MARKED words" }],
    });
    expect(title()).toMatch(dated);
  });

  it("says when a code sign-in kept no chat because the account remembers none", async () => {
    vi.mocked(upsertProfileAtSignIn).mockResolvedValueOnce({
      name: "Lea",
      remember_chats: false,
    } as never);
    const carry = [{ role: "user", content: "I avoid mirrors" }];
    const res = await post({ action: "verify", email: "lea@example.com", code: "12345678", carry });
    expect(await res.json()).toMatchObject({ chatId: null, memoryOff: true });
    expect(createChat).not.toHaveBeenCalled();
    // Nothing to keep, nothing to say.
    vi.mocked(upsertProfileAtSignIn).mockResolvedValueOnce({
      name: "Lea",
      remember_chats: false,
    } as never);
    const empty = await post({ action: "verify", email: "lea@example.com", code: "12345678" });
    expect(await empty.json()).not.toHaveProperty("memoryOff");
  });

  describe("code emails", () => {
    it("count one allowance per inbox, however the address is spelled", () => {
      for (const spelling of ["lea+news@gmail.com", "l.e.a@googlemail.com", "Lea@Gmail.com"]) {
        expect(addressKey(spelling)).toBe("lea@gmail.com");
      }
      expect(addressKey("jo.doe+x@acme.de")).toBe("jo.doe@acme.de"); // dots only on Gmail
    });

    it("send 1 code per inbox per 10 minutes, the +tag and dotted spellings included", async () => {
      expect((await start("l.e.a@gmail.com")).status).toBe(200);
      for (const email of ["lea+1@gmail.com", "lea@googlemail.com"]) {
        const again = await start(email);
        expect(again.status).toBe(429);
        // `codeSent`: the page goes on to the code field, as the code that went out still works.
        expect(await again.json()).toMatchObject({
          error: expect.stringMatching(/We just sent you a code/),
          codeSent: true,
        });
      }
      expect(sendSignInCode).toHaveBeenCalledTimes(1);
      // The account keeps the address as typed; only the limit's key is normalised.
      expect(sendSignInCode).toHaveBeenCalledWith("l.e.a@gmail.com");
      expect(recordCodeIssued).toHaveBeenCalledWith("l.e.a@gmail.com");
      expect(checkCooldown).toHaveBeenCalledWith("lea@gmail.com", "mira-code-wait", 600_000);
    });

    it("send 5 codes per inbox a day", async () => {
      for (let i = 0; i < 5; i++) {
        expect((await start("lea@gmail.com")).status).toBe(200);
        cooldowns.delete("mira-code-wait:lea@gmail.com"); // the 10 minutes pass
      }
      const sixth = await start("lea@gmail.com");
      expect(sixth.status).toBe(429);
      expect((await sixth.json()).error).toMatch(/try again tomorrow/);
      expect(sendSignInCode).toHaveBeenCalledTimes(5);
      expect(checkCooldown).toHaveBeenCalledWith("lea@gmail.com", "mira-code-day-5", 86_400_000);
      // The refused sixth gives its 10 minutes back: tomorrow is the next try either way.
      expect(cooldowns.has("mira-code-wait:lea@gmail.com")).toBe(false);
    });

    it("give the inbox's allowance back when no code went out", async () => {
      vi.mocked(sendSignInCode).mockResolvedValueOnce(false).mockResolvedValueOnce(false);
      vi.mocked(recordCodeIssued).mockRejectedValueOnce(new Error("db down"));
      for (let i = 0; i < 3; i++) expect((await start("lea@gmail.com")).status).toBe(500);
      expect(cooldowns.size).toBe(0);
      expect((await start("lea@gmail.com")).status).toBe(200);
      expect((await start("lea@gmail.com")).status).toBe(429);
    });

    it("stop at 10 an hour per network and 60 an hour in all, without spending the inbox's allowance", async () => {
      refuse("mira-code-ip");
      const perIp = await start("lea@gmail.com");
      expect(perIp.status).toBe(429);
      expect(await perIp.json()).toEqual({ error: "Please try again later." });
      expect(checkCooldown).not.toHaveBeenCalled();

      refuse("mira-code-all");
      const global = await start("lea@gmail.com");
      expect(await global.json()).toEqual({ error: "Please try again later." });
      expect(sendSignInCode).not.toHaveBeenCalled();
      expect(cooldowns.size).toBe(0);
      const limits = vi
        .mocked(checkRateLimit)
        .mock.calls.map(([key, cfg]) => [cfg.bucket, key, cfg.limit, cfg.windowMs]);
      expect(limits).toContainEqual(["mira-code-ip", "127.0.0.1", 10, 3_600_000]);
      expect(limits).toContainEqual(["mira-code-all", "all", 60, 3_600_000]);
      // The owner hears of it (alerts.ts sends it at most once a day).
      expect(alertCodeCap).toHaveBeenCalledWith(60);
    });

    it("send nothing to an address that bounced or complained, and answer as if sent", async () => {
      vi.mocked(isUndeliverable).mockResolvedValueOnce(true);
      const t0 = Date.now();
      const res = await start("bounced@example.com");
      // The same answer as a sent code, after about as long as a send takes.
      expect(Date.now() - t0).toBeGreaterThanOrEqual(350);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(isUndeliverable).toHaveBeenCalledWith("bounced@example.com");
      expect(sendSignInCode).not.toHaveBeenCalled();
      expect(recordCodeIssued).not.toHaveBeenCalled();
      // The allowance stays spent, as after a real code, so a second try can't tell either.
      expect((await start("bounced@example.com")).status).toBe(429);
    });

    it("still sends a code to someone who only unsubscribed from our marketing", async () => {
      vi.mocked(isUndeliverable).mockResolvedValueOnce(false);
      const res = await start("unsubscribed@example.com");
      expect(res.status).toBe(200);
      expect(sendSignInCode).toHaveBeenCalledWith("unsubscribed@example.com");
    });

    it("send nothing when the hidden field is filled, spending no allowance, and answer as if sent", async () => {
      const res = await post({
        action: "start",
        email: "lea@example.com",
        adult: true,
        terms: true,
        consent: true,
        website: "https://spam.example",
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(sendSignInCode).not.toHaveBeenCalled();
      expect(checkCooldown).not.toHaveBeenCalled();
      expect(isUndeliverable).not.toHaveBeenCalled();
      // An empty field is a person.
      const person = await post({
        action: "start",
        email: "lea@example.com",
        adult: true,
        terms: true,
        consent: true,
        website: "",
      });
      expect(person.status).toBe(200);
      expect(sendSignInCode).toHaveBeenCalledTimes(1);
    });
  });

  describe("code guesses", () => {
    it("are limited per address and network before one of the code's guesses is used", async () => {
      refuse("mira-code-guess");
      const res = await post({ action: "verify", email: "lea@example.com", code: "00000000" });
      expect(res.status).toBe(429);
      expect(claimCodeAttempt).not.toHaveBeenCalled();
      expect(verifyOtp).not.toHaveBeenCalled();
      const [key, cfg] = vi.mocked(checkRateLimit).mock.calls.at(-1)!;
      expect([key, cfg.limit, cfg.windowMs]).toEqual(["lea@example.com|127.0.0.1", 5, 600_000]);
    });
  });

  it("signs out again when the profile can't be saved, so the next code starts clean", async () => {
    vi.mocked(upsertProfileAtSignIn).mockRejectedValueOnce(new Error("db down"));
    const res = await post({ action: "verify", email: "lea@example.com", code: "12345678" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: "We couldn't finish signing you in. Please send a new code.",
    });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  describe("carrying the anonymous chat", () => {
    const long = (role: "user" | "assistant", i: number) => ({
      role,
      content: `${i} ${"x".repeat(7000)}`,
    });
    const turns = Array.from({ length: 48 }, (_, i) => long(i % 2 ? "assistant" : "user", i));

    it("keeps the chat's own limits: its newest 24 turns, user turns 2,000 characters, Mira's 4,000", async () => {
      getMiraAccount.mockResolvedValue({ id: "u1", email: "lea@example.com" });
      expect((await post({ action: "carry", carry: turns })).status).toBe(200);
      const kept = vi.mocked(addMessages).mock.calls[0]![1];
      expect(kept).toHaveLength(24);
      expect(kept[0]!.content.startsWith("24 ")).toBe(true);
      expect(kept.map((t) => t.content.length)).toEqual(
        kept.map((t) => (t.role === "user" ? 2000 : 4000))
      );
    });

    it("at most 5 times a day per account", async () => {
      getMiraAccount.mockResolvedValue({ id: "u1", email: "lea@example.com" });
      refuse("mira-carry");
      expect((await post({ action: "carry", carry: turns })).status).toBe(429);
      const verified = await post({
        action: "verify",
        email: "lea@example.com",
        code: "12345678",
        carry: turns,
      });
      // Signing in still works; only the copy is skipped.
      expect(await verified.json()).toMatchObject({ success: true, chatId: null });
      expect(createChat).not.toHaveBeenCalled();
      const [key, cfg] = vi
        .mocked(checkRateLimit)
        .mock.calls.find(([, c]) => c.bucket === "mira-carry")!;
      expect([key, cfg.limit, cfg.windowMs]).toEqual(["u1", 5, 86_400_000]);
    });
  });

  // Eman, 24 Nov 2026: a signed-out chat is kept under the browser's id. "Your current chat comes
  // with you": at sign-up that kept chat becomes the account's own, and is never kept twice.
  describe("the chat Mira kept from this browser", () => {
    const KEPT = "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
    const turns = [
      { role: "user", content: "I avoid mirrors" },
      { role: "assistant", content: "Since when?" },
    ];
    const verify = (extra: Record<string, unknown>) =>
      post({ action: "verify", email: "lea@example.com", code: "12345678", ...extra });

    it("moves into the new account at a code sign-in, instead of a copy of the browser's turns", async () => {
      const body = await (await verify({ carry: turns, anonChat: KEPT })).json();
      expect(adoptAnonChat).toHaveBeenCalledWith("anon_test_123456789", KEPT, "u1", 2);
      expect(createChat).not.toHaveBeenCalled();
      expect(addMessages).not.toHaveBeenCalled();
      expect(body).toMatchObject({ success: true, chatId: KEPT });
    });

    it("moves after a Google or passkey sign-in too", async () => {
      getMiraAccount.mockResolvedValue({ id: "u1", email: "lea@example.com" });
      const body = await (await post({ action: "carry", carry: turns, anonChat: KEPT })).json();
      expect(adoptAnonChat).toHaveBeenCalledWith("anon_test_123456789", KEPT, "u1", 2);
      expect(createChat).not.toHaveBeenCalled();
      expect(body).toMatchObject({ success: true, chatId: KEPT });
    });

    it("gives way to the browser's turns when the kept copy can't move", async () => {
      vi.mocked(adoptAnonChat).mockResolvedValueOnce(false);
      await verify({ carry: turns, anonChat: KEPT });
      expect(createChat).toHaveBeenCalledWith("u1", "I avoid mirrors");
      expect(vi.mocked(addMessages).mock.calls[0]![1]).toHaveLength(2);
    });

    it("is deleted when the account keeps no chats, as the page then says it wasn't kept", async () => {
      vi.mocked(upsertProfileAtSignIn).mockResolvedValueOnce({
        name: "Lea",
        remember_chats: false,
      } as never);
      const body = await (await verify({ carry: turns, anonChat: KEPT })).json();
      expect(body).toMatchObject({ chatId: null, memoryOff: true });
      expect(deleteAnonChats).toHaveBeenCalledWith("anon_test_123456789", KEPT);
      expect(adoptAnonChat).not.toHaveBeenCalled();

      getMiraAccount.mockResolvedValue({ id: "u1", email: "lea@example.com" });
      vi.mocked(getProfile).mockResolvedValueOnce({ name: "Lea", remember_chats: false } as never);
      vi.mocked(deleteAnonChats).mockClear();
      await post({ action: "carry", carry: turns, anonChat: KEPT });
      expect(deleteAnonChats).toHaveBeenCalledWith("anon_test_123456789", KEPT);
      expect(adoptAnonChat).not.toHaveBeenCalled();
    });

    it("is deleted, never carried, when the sign-in is refused as under 18", async () => {
      vi.mocked(isMinor).mockResolvedValueOnce(true);
      const body = await (await verify({ carry: turns, anonChat: KEPT })).json();
      expect(body).toMatchObject({ minor: true, chatId: null });
      expect(deleteAnonChats).toHaveBeenCalledWith("anon_test_123456789", KEPT);
      expect(adoptAnonChat).not.toHaveBeenCalled();
    });

    it("refuses a kept chat that isn't a chat id", async () => {
      expect((await verify({ carry: turns, anonChat: "not-a-chat" })).status).toBe(400);
      expect(adoptAnonChat).not.toHaveBeenCalled();
    });
  });
});
