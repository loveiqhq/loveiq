import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@features/mira/server/alerts", () => ({ alertDailyCeiling: vi.fn() }));
vi.mock("@features/mira/server/store", () => ({
  addMessages: vi.fn().mockResolvedValue([11, 12]),
  createChat: vi.fn().mockResolvedValue("6f2c4a1e-1111-4222-8333-944455556666"),
  findAssessment: vi.fn().mockResolvedValue(null),
  getMessages: vi.fn().mockResolvedValue([]),
  getProfile: vi.fn(),
  logMiraEvent: vi.fn(),
  ownsChat: vi.fn().mockResolvedValue(false),
}));

import miraConfig from "@features/mira/content/mira-config.json";
import { POST, maxDuration } from "@/app/api/mira/chat/route";
import { alertDailyCeiling } from "@features/mira/server/alerts";
import { anonId } from "@features/mira/server/anon";
import {
  GLOBAL_DAILY_MESSAGES,
  MODEL_BUDGET_MS,
  MODEL_FIRST_TRY_MS,
} from "@features/mira/server/config";
import { askModel } from "@features/mira/server/model";
import { getMiraAccount } from "@features/mira/server/session";
import { addMessages, getProfile, logMiraEvent } from "@features/mira/server/store";
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

  it("counts a free conversation when a new chat starts and says how many are left", async () => {
    const body = await (await post({ message: "hi", consent: true })).json();
    expect(vi.mocked(checkRateLimit).mock.calls.map(([, cfg]) => cfg.bucket)).toContain(
      "mira-anon-chats"
    );
    expect(body.freeLeft).toBe(7);
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

  it("shows the sign-up card when an 11th conversation starts", async () => {
    limitHit("mira-anon-chats");
    const res = await post({ message: "hi", consent: true });
    expect(await res.json()).toEqual({ gate: true, freeLeft: 0 });
    expect(askModel).not.toHaveBeenCalled();
  });

  it("keeps an open conversation going after the free conversations are used", async () => {
    limitHit("mira-anon-chats");
    const res = await post({ message: "and then?", consent: true, history: openChat });
    const body = await res.json();
    expect(body.reply).toBe("That makes sense.");
    expect(body.freeLeft).toBeUndefined();
    expect(vi.mocked(checkRateLimit).mock.calls.map(([, cfg]) => cfg.bucket)).not.toContain(
      "mira-anon-chats"
    );
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
    // Counted per UTC day, so resting ends at midnight UTC; the team hears of it.
    expect(checkRateLimit).toHaveBeenCalledWith(`all:${new Date().toISOString().slice(0, 10)}`, {
      bucket: "mira-global-day",
      limit: GLOBAL_DAILY_MESSAGES,
      windowMs: 24 * 60 * 60 * 1000,
    });
    expect(alertDailyCeiling).toHaveBeenCalledTimes(1);
    // A crisis message is never counted, and never stopped.
    vi.mocked(checkRateLimit).mockClear();
    const crisis = await post({ message: "I want to kill myself", consent: true });
    expect((await crisis.json()).crisis).toBe(true);
    const buckets = vi.mocked(checkRateLimit).mock.calls.map(([, cfg]) => cfg.bucket);
    expect(buckets).not.toContain("mira-global-day");
  });

  it("rests when the AI budget is used up, and still answers a crisis", async () => {
    vi.mocked(askModel).mockResolvedValue({ ok: false, reason: "budget_exhausted" });
    const res = await post({ message: "and then?", consent: true, history: openChat });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("Mira is resting for today. Please come back tomorrow.");
    expect(alertDailyCeiling).not.toHaveBeenCalled();
    const crisis = await post({ message: "I want to kill myself", consent: true });
    expect(await crisis.json()).toMatchObject({ crisis: true, reply: miraConfig.crisisMessage });
    expect(askModel).toHaveBeenCalledTimes(1);
  });

  it("doesn't spend a free conversation on a resting day", async () => {
    limitHit("mira-global-day");
    const res = await post({ message: "hi", consent: true });
    expect(res.status).toBe(503);
    const buckets = vi.mocked(checkRateLimit).mock.calls.map(([, cfg]) => cfg.bucket);
    expect(buckets).not.toContain("mira-anon-chats");
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
});
