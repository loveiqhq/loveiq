import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn(),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@features/mira/server/session", () => ({ getMiraAccount: vi.fn() }));
vi.mock("@features/mira/server/anon", () => ({
  anonId: vi.fn().mockResolvedValue("anon_test_123456789"),
}));
vi.mock("@features/mira/server/minor", () => ({ isMinor: vi.fn().mockResolvedValue(false) }));
vi.mock("@features/mira/server/store", () => ({
  logMiraEvent: vi.fn(),
  rateMessage: vi.fn().mockResolvedValue(true),
}));

import { POST } from "@/app/api/mira/event/route";
import { anonId } from "@features/mira/server/anon";
import { isMinor } from "@features/mira/server/minor";
import { getMiraAccount } from "@features/mira/server/session";
import { logMiraEvent, rateMessage } from "@features/mira/server/store";
import { checkRateLimit } from "@shared/http/ratelimit";

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/mira/event", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "t" },
      body: JSON.stringify(body),
    })
  );
}
const loggedProps = () => vi.mocked(logMiraEvent).mock.calls[0]![2];

describe("POST /api/mira/event", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getMiraAccount).mockResolvedValue(null);
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 9,
      resetAt: new Date(),
    });
  });

  it("never keeps a signed-in person's reply text with a rating", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue({ id: "u1", email: "lea@example.com" });
    // Remembering off: no stored message to rate, so the browser sends the reply's text.
    await post({ type: "rating", rating: -1, reply: "What Mira said about their body" });
    expect(loggedProps()).toEqual({ rating: -1, messageId: null, stored: false });

    vi.mocked(logMiraEvent).mockClear();
    await post({ type: "rating", rating: 1, messageId: 12, reply: "text" });
    expect(rateMessage).toHaveBeenCalledWith("u1", 12, 1);
    expect(loggedProps()).toEqual({ rating: 1, messageId: 12, stored: true });
  });

  it("never keeps a reply's words with an anonymous rating, even when an older page sends them", async () => {
    await post({ type: "rating", rating: -1, reply: "x".repeat(4000) });
    expect(loggedProps()).toEqual({ rating: -1 });
  });

  it("caps events a day per person and per network", async () => {
    for (const bucket of ["mira-event-day", "mira-event-ip-day"]) {
      vi.mocked(checkRateLimit).mockImplementation(async (_key, cfg) => ({
        allowed: cfg.bucket !== bucket,
        remaining: 0,
        resetAt: new Date(),
      }));
      const res = await post({ type: "track", name: "chat_opened" });
      expect(res.status).toBe(429);
    }
    expect(logMiraEvent).not.toHaveBeenCalled();
    const keys = vi.mocked(checkRateLimit).mock.calls.map(([key, cfg]) => `${cfg.bucket}=${key}`);
    expect(keys).toContain("mira-event-day=a:anon_test_123456789");
    expect(keys).toContain("mira-event-ip-day=127.0.0.1");
  });

  it("never shares a person's daily allowance between an account and a browser id", async () => {
    // A browser can pick its own id, so it can pick one that equals an account's id.
    const id = "6f2c4a1e-1111-4222-8333-944455556666";
    vi.mocked(anonId).mockResolvedValueOnce(id);
    await post({ type: "track", name: "chat_opened" });
    vi.mocked(getMiraAccount).mockResolvedValue({ id, email: "lea@example.com" });
    await post({ type: "track", name: "chat_opened" });
    const keys = vi
      .mocked(checkRateLimit)
      .mock.calls.filter(([, cfg]) => cfg.bucket === "mira-event-day")
      .map(([key]) => key);
    expect(keys).toEqual([`a:${id}`, `u:${id}`]);
  });

  it("records an NPS answer or a 'Not now', and nothing outside 0 to 10", async () => {
    await post({ type: "nps", score: 9 });
    await post({ type: "nps", score: null });
    expect(vi.mocked(logMiraEvent).mock.calls.map(([n, , p]) => [n, p])).toEqual([
      ["nps", { score: 9 }],
      ["nps", { score: null }],
    ]);
    for (const score of [11, -1, 4.5, "9"]) {
      expect((await post({ type: "nps", score })).status).toBe(400);
    }
  });

  it("refuses feedback with no challenge and no words, which says nothing (UX-16)", async () => {
    for (const body of [
      { type: "feedback", challenges: [], mayEmail: false },
      { type: "feedback", challenges: [], wish: "   ", other: "", mayEmail: true },
    ]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(logMiraEvent).not.toHaveBeenCalled();
    expect(
      (await post({ type: "feedback", challenges: [], other: "More voices", mayEmail: false }))
        .status
    ).toBe(200);
    expect(loggedProps()).toEqual({
      challenges: [],
      wish: null,
      other: "More voices",
      mayEmail: false,
      email: null,
    });
  });

  it("refuses someone stopped as under 18 with the one refusal every page shows (decision 9)", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue({ id: "u1", email: "lea@example.com" });
    vi.mocked(isMinor).mockResolvedValue(true);
    for (const body of [
      { type: "notify", coach: "lena" },
      { type: "coaches", name: "finder_done", detail: "lena" },
      // Beta feedback too: its words and the email address are never kept for them.
      { type: "feedback", challenges: ["Libido challenges"], wish: "Remember me", mayEmail: true },
    ]) {
      const res = await post(body);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "Mira is only for adults.", minor: true });
    }
    expect(logMiraEvent).not.toHaveBeenCalled();
    // Signed out, the browser's own stop counts the same.
    vi.mocked(getMiraAccount).mockResolvedValue(null);
    const anonymous = await post({ type: "feedback", challenges: [], other: "x", mayEmail: false });
    expect(anonymous.status).toBe(403);
    expect(isMinor).toHaveBeenLastCalledWith(null);
    expect(logMiraEvent).not.toHaveBeenCalled();
    vi.mocked(isMinor).mockResolvedValue(false);
  });

  it("takes only the moments the browser sees, never the server's own KPI events", async () => {
    for (const name of ["chat_started", "message_sent", "crisis_shown", "signup_completed"]) {
      expect((await post({ type: "track", name })).status).toBe(400);
    }
    expect(logMiraEvent).not.toHaveBeenCalled();
  });

  it("logs the 'Keep this chat' card: shown, kept, or Not now", async () => {
    for (const name of ["keep_card_shown", "keep_card_keep", "keep_card_not_now"]) {
      expect((await post({ type: "track", name })).status).toBe(200);
    }
    expect(vi.mocked(logMiraEvent).mock.calls.map(([n]) => n)).toEqual([
      "keep_card_shown",
      "keep_card_keep",
      "keep_card_not_now",
    ]);
  });

  it("logs the coaching-style tip and a saved style", async () => {
    for (const name of ["style_tip_shown", "style_tip_opened", "style_saved"]) {
      expect((await post({ type: "track", name })).status).toBe(200);
    }
    expect(vi.mocked(logMiraEvent).mock.calls.map(([n]) => n)).toEqual([
      "style_tip_shown",
      "style_tip_opened",
      "style_saved",
    ]);
  });

  // Settings (21 Nov 2026): the account's own changes are logged by PATCH /api/mira/me, so the
  // browser can't send those (the theme is chosen in Settings only).
  it("never takes Settings changes from the browser", async () => {
    for (const name of [
      "theme_changed",
      "text_size_changed",
      "reply_language_changed",
      "settings_saved",
    ]) {
      expect((await post({ type: "track", name })).status).toBe(400);
    }
    expect(vi.mocked(logMiraEvent)).not.toHaveBeenCalled();
  });

  it("logs the consent with its wording's version, and only so", async () => {
    await post({ type: "consent", version: "mira-2026-11-21-2", shareRated: true });
    expect(vi.mocked(logMiraEvent).mock.calls).toEqual([
      ["consent_given", { anonId: "anon_test_123456789" }, { version: "mira-2026-11-21-2" }],
    ]);
    for (const bad of [
      { type: "track", name: "consent_given" }, // a consent without its version
      { type: "consent" },
      { type: "consent", version: "anything at all" },
    ]) {
      expect((await post(bad)).status).toBe(400);
    }
    expect(logMiraEvent).toHaveBeenCalledTimes(1);
  });

  it("keeps the thumbs of an anonymous rating", async () => {
    await post({ type: "rating", rating: 1 });
    expect(loggedProps()).toEqual({ rating: 1 });
  });

  it("records the agreement to the browser's speech service with its notice's version, and only so", async () => {
    await post({ type: "voice_notice", version: "mira-voice-2026-11-22" });
    vi.mocked(getMiraAccount).mockResolvedValue({ id: "u1", email: "lea@example.com" });
    await post({ type: "voice_notice", version: "mira-voice-2026-11-22" });
    expect(vi.mocked(logMiraEvent).mock.calls).toEqual([
      [
        "voice_notice_agreed",
        { anonId: "anon_test_123456789" },
        { version: "mira-voice-2026-11-22" },
      ],
      ["voice_notice_agreed", { userId: "u1" }, { version: "mira-voice-2026-11-22" }],
    ]);
    for (const bad of [
      { type: "voice_notice" },
      { type: "voice_notice", version: "I agree" },
      { type: "track", name: "voice_notice_agreed" },
    ]) {
      expect((await post(bad)).status).toBe(400);
    }
    expect(logMiraEvent).toHaveBeenCalledTimes(2);
  });

  // Mira's privacy notice promises a count only: the panel the mood check's question 9 opened is
  // logged with no account and no browser id, so it can never be tied to a person.
  it("counts the mood check's support panel without anyone's id, signed in or not", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue({ id: "u1", email: "lea@example.com" });
    expect((await post({ type: "track", name: "check_support_shown" })).status).toBe(200);
    vi.mocked(getMiraAccount).mockResolvedValue(null);
    expect((await post({ type: "track", name: "check_support_shown" })).status).toBe(200);
    expect(vi.mocked(logMiraEvent).mock.calls).toEqual([
      ["check_support_shown", {}],
      ["check_support_shown", {}],
    ]);
    // Other moments keep their person.
    await post({ type: "track", name: "mood_check_started" });
    expect(vi.mocked(logMiraEvent).mock.calls[2]).toEqual([
      "mood_check_started",
      { anonId: "anon_test_123456789" },
    ]);
  });
});
