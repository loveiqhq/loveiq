import { beforeEach, describe, expect, it, vi } from "vitest";

/** This browser's cookies (the under-18 mark lives here). */
const cookieJar = new Map<string, string>();
const jar = {
  get: vi.fn((name: string) =>
    cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined
  ),
  set: vi.fn((name: string, value: string) => void cookieJar.set(name, value)),
};
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => jar) }));
vi.mock("@features/admin/server/supabase", () => ({ supabaseFetch: vi.fn() }));
vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 7, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/mira/server/session", () => ({
  getMiraAccount: vi.fn().mockResolvedValue(null),
}));
vi.mock("@features/mira/server/anon", () => ({
  anonId: vi.fn().mockResolvedValue("anon_test_123456789"),
}));
vi.mock("@features/mira/server/model", () => ({ askModel: vi.fn() }));
vi.mock("@features/mira/server/store", () => ({
  addMessages: vi.fn().mockResolvedValue([11, 12]),
  createChat: vi.fn().mockResolvedValue("6f2c4a1e-1111-4222-8333-944455556666"),
  deleteChats: vi.fn().mockResolvedValue(undefined),
  updateProfile: vi.fn().mockResolvedValue(undefined),
  findAssessment: vi.fn().mockResolvedValue(null),
  getMessages: vi.fn().mockResolvedValue([]),
  getProfile: vi.fn(),
  logMiraEvent: vi.fn(),
  ownsChat: vi.fn().mockResolvedValue(false),
}));

import miraConfig from "@features/mira/content/mira-config.json";
import { POST, maxDuration } from "@/app/api/mira/chat/route";
import { anonId } from "@features/mira/server/anon";
import {
  ANON_FREE_MESSAGES,
  GLOBAL_DAILY_MESSAGES,
  MODEL_BUDGET_MS,
  MODEL_FIRST_TRY_MS,
} from "@features/mira/server/config";
import { supabaseFetch } from "@features/admin/server/supabase";
import { askModel } from "@features/mira/server/model";
import { getMiraAccount } from "@features/mira/server/session";
import {
  addMessages,
  deleteChats,
  getProfile,
  logMiraEvent,
  ownsChat,
  updateProfile,
} from "@features/mira/server/store";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit } from "@shared/http/ratelimit";

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/mira/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "t", ...headers },
      body: JSON.stringify(body),
    })
  );
}

describe("POST /api/mira/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyCsrfToken).mockResolvedValue(true);
    vi.mocked(getMiraAccount).mockResolvedValue(null);
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 7,
      resetAt: new Date(),
    });
    vi.mocked(askModel).mockResolvedValue({ ok: true, text: "That makes sense.", refused: false });
    cookieJar.clear();
    // No account carries the under-18 mark unless a test says so.
    vi.mocked(supabaseFetch).mockImplementation(async () => new Response("[]"));
  });

  it("lives long enough for both models and still answers (Vercel kills it at maxDuration)", () => {
    expect(MODEL_FIRST_TRY_MS).toBeLessThan(MODEL_BUDGET_MS);
    expect(maxDuration * 1000 - MODEL_BUDGET_MS).toBeGreaterThanOrEqual(20_000);
  });

  it("refuses without the CSRF token", async () => {
    vi.mocked(verifyCsrfToken).mockResolvedValueOnce(false);
    const res = await post({ message: "hi", consent: true });
    expect(res.status).toBe(403);
  });

  it("refuses a message without the 18+ and sensitive-data consent", async () => {
    const res = await post({ message: "hi" });
    expect(res.status).toBe(400);
    expect(askModel).not.toHaveBeenCalled();
  });

  it("answers a crisis message without the model, with support lines", async () => {
    const res = await post(
      { message: "I want to kill myself", consent: true },
      { "x-vercel-ip-country": "DE" }
    );
    const body = await res.json();
    expect(askModel).not.toHaveBeenCalled();
    expect(body.crisis).toBe(true);
    expect(body.reply).toBe(miraConfig.crisisMessage);
    expect(body.crisisLines.code).toBe("DE");
  });

  const limitHit = (bucket: string) =>
    vi
      .mocked(checkRateLimit)
      .mockImplementation(async (_key, cfg) =>
        cfg.bucket === bucket
          ? { allowed: false, remaining: 0, resetAt: new Date() }
          : { allowed: true, remaining: 9, resetAt: new Date() }
      );
  const openChat = [
    { role: "user", content: "I hide during sex" },
    { role: "assistant", content: "Tell me more." },
  ];

  it("counts every anonymous message against the 10 free ones and says how many are left", async () => {
    const free = (key: string) =>
      vi
        .mocked(checkRateLimit)
        .mock.calls.filter(([k, cfg]) => k === key && cfg.bucket === "mira-anon-messages");
    for (const body of [
      { message: "hi", consent: true },
      { message: "and then?", consent: true, history: openChat },
    ]) {
      vi.mocked(checkRateLimit).mockClear();
      expect((await (await post(body)).json()).freeLeft).toBe(7);
      expect(free("anon_test_123456789")).toEqual([
        [
          "anon_test_123456789",
          { bucket: "mira-anon-messages", limit: ANON_FREE_MESSAGES, windowMs: 30 * 86_400_000 },
        ],
      ]);
    }
    expect(ANON_FREE_MESSAGES).toBe(10);
  });

  it("never counts a signed-in person's messages against the free ones", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue({ id: "u1", email: "lea@example.com" });
    vi.mocked(getProfile).mockResolvedValue({
      id: "u1",
      email: "lea@example.com",
      name: null,
      country: null,
      gender: null,
      style: {},
      remember_chats: false,
      use_assessment: false,
      consent_at: "2026-11-18T10:00:00Z",
      consent_version: "mira-2026-11-21",
    } as never);
    const body = await (await post({ message: "hi", consent: true })).json();
    expect(body.freeLeft).toBeUndefined();
    const buckets = vi.mocked(checkRateLimit).mock.calls.map(([, cfg]) => cfg.bucket);
    expect(buckets).not.toContain("mira-anon-messages");
  });

  it("records which starter chip opened a chat, as its index and never as text", async () => {
    const started = () =>
      vi.mocked(logMiraEvent).mock.calls.find(([name]) => name === "chat_started")?.[2];
    await post({ message: miraConfig.starterChips[2], consent: true });
    expect(started()).toEqual({ signedIn: false, chip: 2 });
    vi.mocked(logMiraEvent).mockClear();
    await post({ message: "my own words", consent: true });
    expect(started()).toEqual({ signedIn: false, chip: -1 });
  });

  it("answers an 11th message with the sign-up card, in a new chat or an open one", async () => {
    limitHit("mira-anon-messages");
    for (const body of [
      { message: "hi", consent: true },
      { message: "and then?", consent: true, history: openChat },
    ]) {
      expect(await (await post(body)).json()).toEqual({ gate: true, freeLeft: 0 });
    }
    expect(askModel).not.toHaveBeenCalled();
    expect(vi.mocked(logMiraEvent).mock.calls.map(([name]) => name)).toEqual([
      "gate_shown",
      "gate_shown",
    ]);
  });

  it("logs the sign-up card with the reply that used the last free message, not with a crisis", async () => {
    vi.mocked(checkRateLimit).mockImplementation(async (_key, cfg) => ({
      allowed: true,
      remaining: cfg.bucket === "mira-anon-messages" ? 0 : 9,
      resetAt: new Date(),
    }));
    const gates = () => vi.mocked(logMiraEvent).mock.calls.filter(([n]) => n === "gate_shown");
    const tenth = await (
      await post({ message: "and then?", consent: true, history: openChat })
    ).json();
    expect(tenth).toMatchObject({ reply: "That makes sense.", freeLeft: 0 });
    expect(gates()).toEqual([["gate_shown", expect.anything(), { limit: ANON_FREE_MESSAGES }]]);

    vi.mocked(logMiraEvent).mockClear();
    vi.mocked(askModel).mockResolvedValueOnce({
      ok: true,
      text: "Please reach out now.\n[[CRISIS]]",
      refused: false,
    });
    const crisis = await (
      await post({ message: "everything feels dark", consent: true, history: openChat })
    ).json();
    expect(crisis).toMatchObject({ crisis: true, freeLeft: 0 });
    expect(gates()).toEqual([]);
  });

  it("stops anonymous messages at the daily cap, per browser and per network", async () => {
    for (const bucket of ["mira-anon-daily", "mira-anon-ip"]) {
      vi.mocked(askModel).mockClear();
      limitHit(bucket);
      const res = await post({ message: "and then?", consent: true, history: openChat });
      expect(res.status).toBe(429);
      expect(askModel).not.toHaveBeenCalled();
    }
  });

  it("answers a crisis message with the support lines even when every limit is used", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(),
    });
    const res = await post(
      { message: "I want to kill myself", consent: true },
      { "x-vercel-ip-country": "GB" }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.gate).toBeUndefined();
    expect(body.crisis).toBe(true);
    expect(body.reply).toBe(miraConfig.crisisMessage);
    expect(body.crisisLines.code).toBe("GB");
    // Past the per-minute limit nothing is stored or logged, so crisis words can't flood a table.
    expect(logMiraEvent).not.toHaveBeenCalled();
  });

  it("keeps the per-minute limit in front of every other message", async () => {
    limitHit("mira-chat");
    const res = await post({ message: "hi", consent: true });
    expect(res.status).toBe(429);
    expect(askModel).not.toHaveBeenCalled();
  });

  it("answers a crisis message whatever the rest of the body holds", async () => {
    for (const rest of [
      {}, // no consent
      {
        consent: true,
        history: Array.from({ length: 30 }, () => ({ role: "user", content: "x" })),
      },
      { consent: "yes", chatId: 42, style: { tone: 9 }, surprise: true },
    ]) {
      const res = await post({ message: "I don’t want to live anymore", ...rest });
      expect(res.status).toBe(200);
      expect((await res.json()).crisis).toBe(true);
    }
    expect(askModel).not.toHaveBeenCalled();
  });

  it("answers a crisis message when the account has no profile or the database fails", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue({ id: "u1", email: "lea@example.com" });
    vi.mocked(getProfile).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("down"));
    for (let i = 0; i < 2; i++) {
      const res = await post(
        { message: "I want to kill myself", consent: true },
        { "x-vercel-ip-country": "DE" }
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.reply).toBe(miraConfig.crisisMessage);
      expect(body.crisisLines.code).toBe("DE");
    }
    vi.mocked(getMiraAccount).mockResolvedValue(null);
    vi.mocked(anonId).mockRejectedValueOnce(new Error("no cookies"));
    const res = await post({ message: "I want to kill myself", consent: true });
    expect(res.status).toBe(200);
    expect((await res.json()).crisis).toBe(true);
  });

  it("stores a signed-in crisis exchange when it can, and answers when it can't", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue({ id: "u1", email: "lea@example.com" });
    vi.mocked(getProfile).mockResolvedValue({
      id: "u1",
      email: "lea@example.com",
      name: null,
      country: "GB",
      gender: null,
      style: {},
      remember_chats: true,
      use_assessment: false,
      consent_at: "2026-11-18T10:00:00Z",
      consent_version: "mira-2026-11-18",
    });
    const stored = await (await post({ message: "I want to kill myself", consent: true })).json();
    expect(vi.mocked(addMessages).mock.calls[0]![1]).toEqual([
      { role: "user", content: "I want to kill myself" },
      { role: "assistant", content: miraConfig.crisisMessage },
    ]);
    expect(stored.messageId).toBe(12);
    expect(stored.crisisLines.code).toBe("GB");
    expect(vi.mocked(logMiraEvent).mock.calls.map(([name]) => name)).toContain("crisis_shown");

    vi.mocked(addMessages).mockRejectedValueOnce(new Error("down"));
    const res = await post({ message: "I want to kill myself", consent: true });
    expect(res.status).toBe(200);
    expect((await res.json()).messageId).toBeNull();
  });

  it("answers a signed-in crisis message even at the daily cap", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue({ id: "u1", email: "lea@example.com" });
    vi.mocked(getProfile).mockResolvedValue({
      id: "u1",
      email: "lea@example.com",
      name: null,
      country: "DE",
      gender: null,
      style: {},
      remember_chats: true,
      use_assessment: false,
      consent_at: "2026-11-18T10:00:00Z",
      consent_version: "mira-2026-11-18",
    });
    limitHit("mira-daily");
    const res = await post({ message: "I want to kill myself", consent: true });
    expect(res.status).toBe(200);
    expect((await res.json()).crisisLines.code).toBe("DE");
    expect(addMessages).not.toHaveBeenCalled();
  });

  it("follows Mira's first reply with the intake invitation, and only then", async () => {
    const first = await (await post({ message: "I hide during sex", consent: true })).json();
    expect(first.invitation).toBe(miraConfig.intakeInvitation);
    const later = await (
      await post({ message: "and then?", consent: true, history: openChat })
    ).json();
    expect(later.invitation).toBeUndefined();
    vi.mocked(askModel).mockResolvedValueOnce({ ok: true, text: "", refused: true });
    const refused = await (await post({ message: "hi", consent: true })).json();
    expect(refused.invitation).toBeUndefined();
    const crisis = await (await post({ message: "I want to kill myself", consent: true })).json();
    expect(crisis.invitation).toBeUndefined();
  });

  it("sends the reply and the invitation to the model as one turn, after a yes", async () => {
    await post({
      message: "Yes, let’s do it",
      consent: true,
      history: [
        { role: "user", content: "I hide during sex" },
        { role: "assistant", content: "That sounds hard." },
        { role: "assistant", content: miraConfig.intakeInvitation },
      ],
    });
    const turns = vi.mocked(askModel).mock.calls[0]![2];
    expect(turns.map((t) => t.role)).toEqual(["user", "assistant", "user"]);
    expect(turns[1]!.content).toBe(`That sounds hard.\n\n${miraConfig.intakeInvitation}`);
  });

  it("trims a long anonymous history to its newest turns instead of refusing it", async () => {
    const history = Array.from({ length: 8 }, (_, i) => ({
      role: i % 2 ? "assistant" : "user",
      content: `${i}`.repeat(4000),
    }));
    const res = await post({ message: "and now?", consent: true, history });
    expect(res.status).toBe(200);
    const turns = vi.mocked(askModel).mock.calls[0]![2];
    expect(turns.reduce((n, t) => n + t.content.length, 0)).toBeLessThanOrEqual(24_000);
    expect(turns[0]!.role).toBe("user");
    expect(turns.at(-2)!.content).toBe("7".repeat(4000));
    expect(turns.at(-1)).toEqual({ role: "user", content: "and now?" });
  });

  it("still refuses a body past the hard cap", async () => {
    const turn = { role: "user", content: "x" };
    for (const history of [Array(25).fill(turn), [{ role: "user", content: "x".repeat(4001) }]]) {
      const res = await post({ message: "hi", consent: true, history });
      expect(res.status).toBe(400);
    }
    expect(askModel).not.toHaveBeenCalled();
  });

  it("rests for the day once everyone's model calls reach the ceiling", async () => {
    limitHit("mira-global-day");
    const res = await post({ message: "and then?", consent: true, history: openChat });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("Mira is resting for today. Please come back tomorrow.");
    expect(askModel).not.toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledWith("all", {
      bucket: "mira-global-day",
      limit: GLOBAL_DAILY_MESSAGES,
      windowMs: 24 * 60 * 60 * 1000,
    });
    // A crisis message is never counted, and never stopped.
    vi.mocked(checkRateLimit).mockClear();
    const crisis = await post({ message: "I want to kill myself", consent: true });
    expect((await crisis.json()).crisis).toBe(true);
    const buckets = vi.mocked(checkRateLimit).mock.calls.map(([, cfg]) => cfg.bucket);
    expect(buckets).not.toContain("mira-global-day");
  });

  it("doesn't spend a free message on a resting day", async () => {
    limitHit("mira-global-day");
    const res = await post({ message: "hi", consent: true });
    expect(res.status).toBe(503);
    const buckets = vi.mocked(checkRateLimit).mock.calls.map(([, cfg]) => cfg.bucket);
    expect(buckets).not.toContain("mira-anon-messages");
  });

  it("refuses an absurdly large body before reading it for anything", async () => {
    const res = await post({
      message: "I want to kill myself " + "x".repeat(210_000),
      consent: true,
    });
    expect(res.status).toBe(413);
    expect(logMiraEvent).not.toHaveBeenCalled();
  });

  it("past the day's crisis allowance per network, still answers but stores and logs nothing", async () => {
    limitHit("mira-crisis-day");
    const res = await post({ message: "I want to kill myself", consent: true });
    expect((await res.json()).crisis).toBe(true);
    expect(logMiraEvent).not.toHaveBeenCalled();
  });

  it("gives the model only the time the function has left", async () => {
    await post({ message: "hi", consent: true });
    const until = vi.mocked(askModel).mock.calls[0]![3]!;
    expect(until - Date.now()).toBeGreaterThan(60_000);
    expect(until - Date.now()).toBeLessThanOrEqual(65_000);
  });

  it("says Mira is off when no model key is set", async () => {
    vi.mocked(askModel).mockResolvedValueOnce({ ok: false, reason: "unconfigured" });
    const res = await post({ message: "hi", consent: true });
    expect(res.status).toBe(503);
  });

  it("opens the crisis panel when the model's reply carries the token", async () => {
    vi.mocked(askModel).mockResolvedValueOnce({
      ok: true,
      text: "Please reach out now.\n[[CRISIS]]",
      refused: false,
    });
    const body = await (
      await post({ message: "everything feels pointless", consent: true })
    ).json();
    expect(body.crisis).toBe(true);
    expect(body.reply).toBe("Please reach out now.");
  });

  it("opens the crisis panel when the model's reply is the token and nothing else", async () => {
    for (const text of ["[[CRISIS]]", "Sources: [C01]\n[[CRISIS]]"]) {
      vi.mocked(askModel).mockResolvedValueOnce({ ok: true, text, refused: false });
      const body = await (
        await post(
          { message: "everything feels pointless", consent: true },
          { "x-vercel-ip-country": "IE" }
        )
      ).json();
      expect(body.reply).toBe(miraConfig.crisisMessage);
      expect(body.crisis).toBe(true);
      expect(body.crisisLines.code).toBe("IE");
      expect(body.sources).toEqual([]);
      expect(body.invitation).toBeUndefined();
    }
  });

  it("sends anonymous history, opening with the person, never Mira's greeting", async () => {
    await post({
      message: "and then?",
      consent: true,
      history: [
        { role: "assistant", content: "greeting" },
        { role: "user", content: "I hide during sex" },
        { role: "assistant", content: "Tell me more." },
      ],
    });
    const turns = vi.mocked(askModel).mock.calls[0]![2];
    expect(turns[0]).toEqual({ role: "user", content: "I hide during sex" });
    expect(turns.at(-1)).toEqual({ role: "user", content: "and then?" });
  });

  it("stores a signed-in exchange when remembering is on", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue({ id: "u1", email: "lea@example.com" });
    vi.mocked(getProfile).mockResolvedValue({
      id: "u1",
      email: "lea@example.com",
      name: "Lea",
      country: "DE",
      gender: null,
      style: {},
      remember_chats: true,
      use_assessment: false,
      consent_at: "2026-11-18T10:00:00Z",
      consent_version: "mira-2026-11-18",
    });
    const body = await (await post({ message: "I compare myself a lot", consent: true })).json();
    expect(addMessages).toHaveBeenCalledTimes(1);
    // A first message: the reply, then Sanjin's intake invitation as its own message.
    expect(vi.mocked(addMessages).mock.calls[0]![1].map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "assistant",
    ]);
    expect(vi.mocked(addMessages).mock.calls[0]![1][2]!.content).toBe(miraConfig.intakeInvitation);
    expect(body.messageId).toBe(12);
    expect(body.chatId).toBe("6f2c4a1e-1111-4222-8333-944455556666");
  });

  it("does not store anything when remembering is off", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue({ id: "u1", email: "lea@example.com" });
    vi.mocked(getProfile).mockResolvedValue({
      id: "u1",
      email: "lea@example.com",
      name: null,
      country: null,
      gender: null,
      style: {},
      remember_chats: false,
      use_assessment: false,
      consent_at: "2026-11-18T10:00:00Z",
      consent_version: "mira-2026-11-18",
    });
    await post({ message: "hello", consent: true });
    expect(addMessages).not.toHaveBeenCalled();
  });

  const events = (name: string) =>
    vi
      .mocked(logMiraEvent)
      .mock.calls.filter(([n]) => n === name)
      .map(([, , props]) => props);

  it("asks the model for a topic only on a first message in the person's own words", async () => {
    await post({ message: "I only feel okay with the lights off", consent: true });
    expect(vi.mocked(askModel).mock.calls[0]![1]).toContain("FIRST MESSAGE TOPIC");
    vi.mocked(askModel).mockClear();
    await post({ message: miraConfig.starterChips[0], consent: true });
    expect(vi.mocked(askModel).mock.calls[0]![1]).not.toContain("FIRST MESSAGE TOPIC");
    vi.mocked(askModel).mockClear();
    await post({ message: "and then?", consent: true, history: openChat });
    expect(vi.mocked(askModel).mock.calls[0]![1]).not.toContain("FIRST MESSAGE TOPIC");
  });

  it("logs a new chat's topic as its id, never the words, and never for a starter chip", async () => {
    vi.mocked(askModel).mockResolvedValue({
      ok: true,
      text: "That sounds hard.\n[[TOPIC:hiding]]",
      refused: false,
    });
    const body = await (
      await post({ message: "I only feel okay with the lights off", consent: true })
    ).json();
    expect(body.reply).toBe("That sounds hard.");
    expect(events("chat_topic")).toEqual([{ topic: "hiding" }]);
    vi.mocked(logMiraEvent).mockClear();
    await post({ message: miraConfig.starterChips[0], consent: true });
    expect(events("chat_topic")).toEqual([]);
  });

  it("returns the intake question Mira asked, and stores it with her reply", async () => {
    vi.mocked(askModel).mockResolvedValue({
      ok: true,
      text: "Has this always been there, or is it more recent?\n[[ASK:onset]]",
      refused: false,
    });
    vi.mocked(getMiraAccount).mockResolvedValue({ id: "u1", email: "lea@example.com" });
    vi.mocked(getProfile).mockResolvedValue({
      id: "u1",
      email: "lea@example.com",
      name: null,
      country: null,
      gender: null,
      style: {},
      remember_chats: true,
      use_assessment: false,
      consent_at: "2026-11-18T10:00:00Z",
      consent_version: "mira-2026-11-18",
    } as never);
    const body = await (
      await post({ message: "Yes, let’s do it", consent: true, history: openChat })
    ).json();
    expect(body.ask).toBe("onset");
    expect(body.reply).toBe("Has this always been there, or is it more recent?");
    const stored = vi.mocked(addMessages).mock.calls[0]![1];
    expect(stored[1]).toMatchObject({ role: "assistant", ask: "onset" });
  });

  it("logs which intake question a message answered, by id only, and only a real one", async () => {
    await post({ message: "A few years", consent: true, history: openChat, answering: "onset" });
    expect(events("intake_answered")).toEqual([{ q: "onset" }]);
    vi.mocked(logMiraEvent).mockClear();
    await post({ message: "x", consent: true, history: openChat, answering: "shoesize" });
    expect(events("intake_answered")).toEqual([]);
    const bad = await post({ message: "x", consent: true, answering: "DROP TABLE" });
    expect(bad.status).toBe(400);
  });

  it("logs a referral when Mira suggests a therapist or doctor, never in a crisis reply", async () => {
    vi.mocked(askModel).mockResolvedValue({
      ok: true,
      text: "A pelvic health physiotherapist can help with the pain.\n[[REFER]]",
      refused: false,
    });
    await post({ message: "it hurts during sex", consent: true, history: openChat });
    expect(events("referred")).toHaveLength(1);
    vi.mocked(logMiraEvent).mockClear();
    vi.mocked(askModel).mockResolvedValue({
      ok: true,
      text: "Please reach out now.\n[[REFER]]\n[[CRISIS]]",
      refused: false,
    });
    await post({ message: "everything feels dark", consent: true, history: openChat });
    expect(events("referred")).toEqual([]);
    expect(events("crisis_shown")).toHaveLength(1);
    vi.mocked(logMiraEvent).mockClear();
    // Markers and nothing else: the refusal message is shown, and nobody was referred.
    vi.mocked(askModel).mockResolvedValue({ ok: true, text: "[[REFER]]", refused: false });
    const body = await (await post({ message: "hm", consent: true, history: openChat })).json();
    expect(body.reply).toBe(miraConfig.refusalMessage);
    expect(events("referred")).toEqual([]);
  });

  it("answers a declined reply with a neutral line and the support lines, counted apart from crises", async () => {
    vi.mocked(askModel).mockResolvedValueOnce({
      ok: true,
      text: "",
      refused: true,
      category: "general_harms",
    });
    const body = await (
      await post(
        { message: "something happened to me", consent: true, history: openChat },
        { "x-vercel-ip-country": "DE" }
      )
    ).json();
    expect(body.reply).toBe(miraConfig.refusalMessage);
    expect(body.crisis).toBe(true); // the browser opens the support panel on this
    expect(body.crisisLines.code).toBe("DE");
    expect(events("reply_declined")).toEqual([{ why: "refusal", category: "general_harms" }]);
    expect(events("crisis_shown")).toEqual([]);
    expect(events("reply_shown")).toEqual([{ sources: [], crisis: false }]);
    // An empty reply (here only a Sources line) gets the same, with no category.
    vi.mocked(logMiraEvent).mockClear();
    vi.mocked(askModel).mockResolvedValueOnce({ ok: true, text: "Sources: [C01]", refused: false });
    const empty = await (await post({ message: "hm", consent: true, history: openChat })).json();
    expect(empty.crisisLines).toBeDefined();
    expect(events("reply_declined")).toEqual([{ why: "empty", category: null }]);
  });

  describe("under 18 (rail 15)", () => {
    const signedIn = () => {
      vi.mocked(getMiraAccount).mockResolvedValue({ id: "u1", email: "lea@example.com" });
      vi.mocked(getProfile).mockResolvedValue({
        id: "u1",
        email: "lea@example.com",
        name: null,
        country: "DE",
        gender: null,
        style: {},
        remember_chats: true,
        use_assessment: false,
        consent_at: "2026-11-18T10:00:00Z",
        consent_version: "mira-2026-11-18",
      } as never);
    };
    const saysMinor = (text = "I can only talk about this with adults.\n[[MINOR]]") =>
      vi.mocked(askModel).mockResolvedValueOnce({ ok: true, text, refused: false });

    it("answers with message G and marks this browser, then never asks the model again", async () => {
      saysMinor();
      const body = await (
        await post({ message: "im 15 btw", consent: true, history: openChat })
      ).json();
      expect(body).toMatchObject({ reply: miraConfig.minorMessage, minor: true, crisis: false });
      expect(body.crisisLines).toBeUndefined();
      expect(jar.set).toHaveBeenCalledWith(
        "mira_minor",
        "1",
        expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 31_536_000 })
      );
      expect(events("minor_stop")).toEqual([{ signedIn: false }]);
      expect(events("crisis_shown")).toEqual([]);
      // From then on: message G without the model, even past the free conversations.
      vi.mocked(askModel).mockClear();
      limitHit("mira-anon-chats");
      const again = await (await post({ message: "hello?", consent: true })).json();
      expect(again).toMatchObject({ reply: miraConfig.minorMessage, minor: true });
      expect(askModel).not.toHaveBeenCalled();
    });

    it("still gives a crisis message the crisis reply and the lines", async () => {
      cookieJar.set("mira_minor", "1");
      const body = await (
        await post(
          { message: "I want to kill myself", consent: true },
          { "x-vercel-ip-country": "DE" }
        )
      ).json();
      expect(body.reply).toBe(miraConfig.crisisMessage);
      expect(body.crisisLines.code).toBe("DE");
      expect(askModel).not.toHaveBeenCalled();
    });

    it("marks the account, turns its nudges off and deletes its chats, on every device after", async () => {
      signedIn();
      saysMinor();
      vi.mocked(ownsChat).mockResolvedValueOnce(true); // the chat it was in goes too
      const body = await (
        await post({
          message: "im 16",
          consent: true,
          chatId: "6f2c4a1e-1111-4222-8333-944455556666",
        })
      ).json();
      expect(body).toMatchObject({ reply: miraConfig.minorMessage, minor: true, chatId: null });
      expect(updateProfile).toHaveBeenCalledWith("u1", {
        minor_at: expect.any(String),
        nudges_on: false,
        remember_chats: false,
      });
      expect(deleteChats).toHaveBeenCalledWith("u1");
      expect(addMessages).not.toHaveBeenCalled();
      expect(events("minor_stop")).toEqual([{ signedIn: true }]);
      // Another browser, without the cookie: the account's mark stops it, before any limit.
      cookieJar.clear();
      vi.mocked(askModel).mockClear();
      vi.mocked(supabaseFetch).mockImplementation(
        async () => new Response(JSON.stringify([{ id: "u1" }]))
      );
      limitHit("mira-daily");
      const again = await (await post({ message: "hi", consent: true })).json();
      expect(again).toMatchObject({ reply: miraConfig.minorMessage, minor: true });
      expect(askModel).not.toHaveBeenCalled();
      expect(String(vi.mocked(supabaseFetch).mock.calls.at(-1)![0])).toContain(
        "id=eq.u1&minor_at=not.is.null"
      );
    });

    it("answers with an error, never the model, when the account's mark can't be read", async () => {
      signedIn();
      vi.mocked(supabaseFetch).mockImplementation(async () => new Response("{}", { status: 500 }));
      const res = await post({ message: "hi", consent: true });
      expect(res.status).toBe(500);
      expect(askModel).not.toHaveBeenCalled();
    });

    it("gives the crisis reply and lines when the model also sees danger, and still stops", async () => {
      saysMinor("Please call your local emergency number now.\n[[MINOR]]\n[[CRISIS]]");
      const body = await (
        await post(
          { message: "im 15 and everything feels dark", consent: true, history: openChat },
          { "x-vercel-ip-country": "GB" }
        )
      ).json();
      expect(body).toMatchObject({
        reply: "Please call your local emergency number now.",
        crisis: true,
        minor: true,
      });
      expect(body.crisisLines.code).toBe("GB");
      expect(events("crisis_shown")).toHaveLength(1);
      expect(events("minor_stop")).toHaveLength(1);
      expect(cookieJar.get("mira_minor")).toBe("1");
    });
  });
});
