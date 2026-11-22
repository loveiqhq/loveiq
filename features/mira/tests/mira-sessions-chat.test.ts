import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The weekly session in the chat route: what Mira is told about the person's booked session on
 * every signed-in message, and the session she opens when they arrive from its link.
 */

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(), set: vi.fn() })),
}));
vi.mock("@features/admin/server/supabase", () => ({ supabaseFetch: vi.fn() }));
vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 7, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/mira/server/session", () => ({ getMiraAccount: vi.fn() }));
vi.mock("@features/mira/server/anon", () => ({ anonId: vi.fn().mockResolvedValue("anon_1") }));
vi.mock("@features/mira/server/model", () => ({ askModel: vi.fn() }));
vi.mock("@features/mira/server/alerts", () => ({ alertDailyCeiling: vi.fn() }));
vi.mock("@features/mira/server/store", () => ({
  addMessages: vi.fn().mockResolvedValue([11, 12]),
  createChat: vi.fn().mockResolvedValue("6f2c4a1e-1111-4222-8333-944455556666"),
  deleteChats: vi.fn(),
  updateProfile: vi.fn(),
  findAssessment: vi.fn().mockResolvedValue(null),
  getMessages: vi.fn().mockResolvedValue([]),
  getProfile: vi.fn(),
  logMiraEvent: vi.fn(),
  ownsChat: vi.fn().mockResolvedValue(false),
}));
vi.mock("@features/mira/server/weekly-sessions", () => ({
  getSlot: vi.fn(),
  markJoined: vi.fn().mockResolvedValue(false),
}));
vi.mock("@features/mira/server/nudges", () => ({
  lastChat: vi.fn(),
  hadCrisis: vi.fn(),
  CRISIS_QUIET_DAYS: 14,
}));

import { POST } from "@/app/api/mira/chat/route";
import miraConfig from "@features/mira/content/mira-config.json";
import { supabaseFetch } from "@features/admin/server/supabase";
import { askModel } from "@features/mira/server/model";
import { hadCrisis, lastChat } from "@features/mira/server/nudges";
import { getMiraAccount } from "@features/mira/server/session";
import { addMessages, getProfile, logMiraEvent } from "@features/mira/server/store";
import { getSlot, markJoined } from "@features/mira/server/weekly-sessions";

const SLOT = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  weekday: 2,
  time: "19:00",
  timeZone: "Europe/Berlin",
  sequence: 0,
  paused: false,
};
const post = (body: Record<string, unknown>) =>
  POST(
    new Request("http://localhost/api/mira/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "t" },
      body: JSON.stringify({ consent: true, ...body }),
    })
  );
/** What the model was told about this person, this message. */
const personal = () => String(vi.mocked(askModel).mock.calls[0]![1]);
const signedIn = (remember = true) => {
  vi.mocked(getMiraAccount).mockResolvedValue({ id: "u1", email: "lea@example.com" });
  vi.mocked(getProfile).mockResolvedValue({
    id: "u1",
    email: "lea@example.com",
    name: "Lea",
    country: "DE",
    gender: null,
    style: {},
    remember_chats: remember,
    use_assessment: false,
  } as never);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMiraAccount).mockResolvedValue(null);
  vi.mocked(supabaseFetch).mockImplementation(async () => new Response("[]"));
  vi.mocked(askModel).mockResolvedValue({ ok: true, text: "Welcome back.", refused: false });
  vi.mocked(getSlot).mockResolvedValue(null);
  vi.mocked(lastChat).mockResolvedValue(null);
  vi.mocked(hadCrisis).mockResolvedValue(false);
});

describe("what Mira is told about the weekly session", () => {
  it("offers the picker while nothing is booked, and never to promise an invite herself", async () => {
    signedIn();
    await post({ message: "hi" });
    expect(personal()).toContain("WEEKLY SESSION");
    expect(personal()).toContain("Nothing is booked");
    expect(personal()).toContain("[[ASK:weekly]]");
  });

  it("knows the booked time, and that the invite went, so she doesn't ask again", async () => {
    signedIn();
    vi.mocked(getSlot).mockResolvedValue({ ...SLOT, paused: true });
    await post({ message: "hi" });
    expect(personal()).toContain(
      "booked in the app: Tuesdays at 19:00 (Berlin time), reminder emails paused"
    );
    expect(personal()).not.toContain("Nothing is booked");
  });

  it("says nothing either way when the booking can't be read, and still answers", async () => {
    signedIn();
    vi.mocked(getSlot).mockRejectedValue(new Error("db down"));
    const res = await post({ message: "hi" });
    expect(res.status).toBe(200);
    expect(personal()).not.toContain("WEEKLY SESSION");
  });

  it("tells an anonymous chat nothing about a booking", async () => {
    await post({ message: "hi" });
    expect(personal()).not.toContain("WEEKLY SESSION");
    expect(getSlot).not.toHaveBeenCalled();
  });
});

describe("opening the weekly session from its link", () => {
  const LAST = {
    id: "c0",
    turns: [
      { role: "user" as const, content: "I'll try one soft lamp tonight.", created_at: "" },
      { role: "assistant" as const, content: "Lovely. Tell me how it went.", created_at: "" },
    ],
  };

  it("has Mira open it, picking up from the last chat she remembers", async () => {
    signedIn();
    vi.mocked(getSlot).mockResolvedValue(SLOT);
    vi.mocked(lastChat).mockResolvedValue(LAST);
    const body = await (
      await post({ message: "I’m here for my weekly session.", session: true })
    ).json();
    expect(personal()).toContain("THIS IS THEIR WEEKLY SESSION");
    expect(personal()).toContain("Person: I'll try one soft lamp tonight.");
    expect(personal()).toContain("Mira: Lovely. Tell me how it went.");
    // Not a new chat's topic, nor the intake invitation: it's their session.
    expect(personal()).not.toContain("FIRST MESSAGE TOPIC");
    expect(body.invitation).toBeUndefined();
    expect(vi.mocked(addMessages).mock.calls[0]![1]).toHaveLength(2);
    const started = vi.mocked(logMiraEvent).mock.calls.find(([n]) => n === "chat_started");
    expect(started?.[2]).toEqual({ signedIn: true, chip: null });
    // Attendance is checked against the start it was opened for.
    expect(markJoined).toHaveBeenCalledWith(SLOT, "u1", expect.any(Date));
  });

  it("remembers nothing when Remember our conversations is off", async () => {
    signedIn(false);
    vi.mocked(lastChat).mockResolvedValue(LAST);
    await post({ message: "I’m here for my weekly session.", session: true });
    expect(lastChat).not.toHaveBeenCalled();
    expect(personal()).toContain("THIS IS THEIR WEEKLY SESSION");
    expect(personal()).toContain("no earlier chat");
    expect(personal()).not.toContain("soft lamp");
  });

  // Never reopening a crisis: after support lines in the last 14 days, or when that chat holds
  // the crisis message, the opening stays generic (as nudges and reminders pause then).
  it("leaves the last chat out after support lines in the last 14 days", async () => {
    signedIn();
    vi.mocked(lastChat).mockResolvedValue(LAST);
    vi.mocked(hadCrisis).mockResolvedValue(true);
    const before = Date.now();
    await post({ message: "I’m here for my weekly session.", session: true });
    expect(personal()).toContain("THIS IS THEIR WEEKLY SESSION");
    expect(personal()).toContain("no earlier chat");
    expect(personal()).not.toContain("soft lamp");
    const [user, since] = vi.mocked(hadCrisis).mock.calls[0]!;
    expect(user).toBe("u1");
    expect(before - since.getTime()).toBeGreaterThanOrEqual(14 * 24 * 60 * 60 * 1000);
    expect(before - since.getTime()).toBeLessThan(14 * 24 * 60 * 60 * 1000 + 60_000);
  });

  it("leaves out a last chat that holds the crisis message, however old", async () => {
    signedIn();
    vi.mocked(lastChat).mockResolvedValue({
      id: "c0",
      turns: [
        ...LAST.turns,
        { role: "user" as const, content: "I can't do this any more", created_at: "" },
        { role: "assistant" as const, content: miraConfig.crisisMessage, created_at: "" },
      ],
    });
    await post({ message: "I’m here for my weekly session.", session: true });
    expect(personal()).toContain("no earlier chat");
    expect(personal()).not.toContain("soft lamp");
    expect(personal()).not.toContain("any more");
  });

  it("leaves the last chat out when the crisis record can't be read", async () => {
    signedIn();
    vi.mocked(lastChat).mockResolvedValue(LAST);
    vi.mocked(hadCrisis).mockRejectedValue(new Error("db down"));
    const res = await post({ message: "I’m here for my weekly session.", session: true });
    expect(res.status).toBe(200);
    expect(personal()).toContain("no earlier chat");
    expect(personal()).not.toContain("soft lamp");
  });

  it("is an ordinary first message for anyone signed out", async () => {
    const body = await (await post({ message: "hello", session: true })).json();
    expect(personal()).not.toContain("THIS IS THEIR WEEKLY SESSION");
    expect(body.invitation).toBe(miraConfig.intakeInvitation);
    expect(markJoined).not.toHaveBeenCalled();
  });
});
