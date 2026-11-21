import { beforeEach, describe, expect, it, vi } from "vitest";

/** Spoken turns go through the chat route like typed ones (features/mira/ui/voice). */

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(), set: vi.fn() })),
}));
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async () => new Response("[]")),
}));
vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 7, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/mira/server/session", () => ({ getMiraAccount: vi.fn() }));
vi.mock("@features/mira/server/anon", () => ({
  anonId: vi.fn().mockResolvedValue("anon_test_123456789"),
}));
vi.mock("@features/mira/server/model", () => ({ askModel: vi.fn() }));
vi.mock("@features/mira/server/alerts", () => ({ alertDailyCeiling: vi.fn() }));
vi.mock("@features/mira/server/store", () => ({
  addMessages: vi.fn().mockResolvedValue([11, 12, 13]),
  createChat: vi.fn().mockResolvedValue("6f2c4a1e-1111-4222-8333-944455556666"),
  deleteChats: vi.fn(),
  updateProfile: vi.fn(),
  findAssessment: vi.fn().mockResolvedValue(null),
  getMessages: vi.fn().mockResolvedValue([]),
  getProfile: vi.fn(),
  logMiraEvent: vi.fn(),
  ownsChat: vi.fn().mockResolvedValue(false),
}));

import miraConfig from "@features/mira/content/mira-config.json";
import { POST } from "@/app/api/mira/chat/route";
import { askModel } from "@features/mira/server/model";
import { personalInstructions } from "@features/mira/server/prompt";
import { getMiraAccount } from "@features/mira/server/session";
import { addMessages, getProfile } from "@features/mira/server/store";
import { checkRateLimit } from "@shared/http/ratelimit";

const SESSION = "1c2d3e4f-3333-4444-8555-a66677778888";
const LEA = { id: "6f2c4a1e-1111-4222-8333-944455556666", email: "lea@example.com" };

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/mira/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "t" },
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMiraAccount).mockResolvedValue(null);
  vi.mocked(askModel).mockResolvedValue({ ok: true, text: "That makes sense.", refused: false });
});

describe("a spoken turn", () => {
  it("asks Mira for a short spoken reply, with every rule as written; a typed turn doesn't", async () => {
    await post({ message: "I hide during sex", consent: true, voice: { session: SESSION } });
    await post({ message: "I hide during sex", consent: true });
    const spoken = vi.mocked(askModel).mock.calls[0]![1];
    const typed = vi.mocked(askModel).mock.calls[1]![1];
    expect(spoken).toContain("SPOKEN CONVERSATION");
    expect(spoken).toMatch(/no lists/i);
    expect(spoken).toMatch(/rules, fixed messages and markers apply exactly as in writing/i);
    expect(typed).not.toContain("SPOKEN CONVERSATION");
  });

  it("uses a signed-out person's free message like a typed one", async () => {
    await post({ message: "hi", consent: true, voice: { session: SESSION } });
    expect(
      vi.mocked(checkRateLimit).mock.calls.some(([, cfg]) => cfg.bucket === "mira-anon-messages")
    ).toBe(true);
  });

  it("is stored with its session when the chat is remembered, Mira's reply and invitation too", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue(LEA);
    vi.mocked(getProfile).mockResolvedValue({
      id: LEA.id,
      remember_chats: true,
      use_assessment: false,
      style: {},
    } as never);
    await post({ message: "It's the lights", consent: true, voice: { session: SESSION } });
    const [, stored] = vi.mocked(addMessages).mock.calls[0]!;
    expect(stored.map((m) => [m.role, m.voiceSession])).toEqual([
      ["user", SESSION],
      ["assistant", SESSION],
      ["assistant", SESSION], // the intake invitation after a first reply
    ]);
  });

  it("gets the same crisis answer and support lines without the model, stored with its session", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue(LEA);
    vi.mocked(getProfile).mockResolvedValue({ id: LEA.id, remember_chats: true } as never);
    const res = await post({
      message: "I want to kill myself",
      consent: true,
      voice: { session: SESSION },
    });
    const body = await res.json();
    expect(askModel).not.toHaveBeenCalled();
    expect(body).toMatchObject({ crisis: true, reply: miraConfig.crisisMessage });
    expect(body.crisisLines).toBeTruthy();
    const [, stored] = vi.mocked(addMessages).mock.calls[0]!;
    expect(stored.every((m) => m.voiceSession === SESSION)).toBe(true);
  });

  it("refuses a session id that isn't one, but still answers a crisis message", async () => {
    expect((await post({ message: "hi", consent: true, voice: { session: "x" } })).status).toBe(
      400
    );
    const res = await post({
      message: "I want to kill myself",
      consent: true,
      voice: { session: "x" },
    });
    expect((await res.json()).crisis).toBe(true);
  });
});

describe("the spoken instruction", () => {
  it("is only added for a spoken turn, after the person's context", () => {
    const text = personalInstructions({}, { signedIn: false }, { voice: true });
    expect(text.indexOf("ABOUT THIS CONVERSATION")).toBeLessThan(
      text.indexOf("SPOKEN CONVERSATION")
    );
    expect(personalInstructions({}, { signedIn: false })).not.toContain("SPOKEN");
  });
});
