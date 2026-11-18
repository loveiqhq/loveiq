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
import { POST } from "@/app/api/mira/chat/route";
import { askModel } from "@features/mira/server/model";
import { getMiraAccount } from "@features/mira/server/session";
import { addMessages, getProfile } from "@features/mira/server/store";
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
    vi.mocked(checkRateLimit).mockImplementation(async (_key, cfg) =>
      cfg.bucket === "mira-chat"
        ? { allowed: true, remaining: 9, resetAt: new Date() }
        : { allowed: false, remaining: 0, resetAt: new Date() }
    );
    const body = await (
      await post(
        { message: "I want to kill myself", consent: true },
        { "x-vercel-ip-country": "GB" }
      )
    ).json();
    expect(body.gate).toBeUndefined();
    expect(body.crisis).toBe(true);
    expect(body.crisisLines.code).toBe("GB");
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

  it("refuses an oversized anonymous history", async () => {
    const big = "x".repeat(4000);
    const history = Array.from({ length: 7 }, (_, i) => ({
      role: i % 2 ? "assistant" : "user",
      content: big,
    }));
    const res = await post({ message: "hi", consent: true, history });
    expect(res.status).toBe(400);
    expect(askModel).not.toHaveBeenCalled();
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
    expect(vi.mocked(addMessages).mock.calls[0]![1].map((m) => m.role)).toEqual([
      "user",
      "assistant",
    ]);
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
});
