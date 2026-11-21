import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: vi.fn(), set: vi.fn() })) }));
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
vi.mock("@features/mira/server/goals", () => ({
  goalsForPrompt: vi.fn().mockResolvedValue([]),
  deleteGoals: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from "@/app/api/mira/chat/route";
import { goalsForPrompt } from "@features/mira/server/goals";
import { askModel } from "@features/mira/server/model";
import { getMiraAccount } from "@features/mira/server/session";
import { getProfile, logMiraEvent } from "@features/mira/server/store";

/** Challenges & goals in the chat: Mira's suggestion reaches the page, her context gets the goals. */

const LEA = { id: "6f2c4a1e-1111-4222-8333-944455556666", email: "lea@example.com" };
const PROFILE = {
  id: LEA.id,
  email: LEA.email,
  name: "Lea",
  country: "DE",
  gender: null,
  style: {},
  remember_chats: false,
  use_assessment: false,
  consent_at: "2026-11-20T10:00:00Z",
  consent_version: "mira-2026-11-21-2",
  nudges_on: true,
  nudge_time: "19:00" as const,
  time_zone: "Europe/Berlin",
};
const SUGGESTION = "Leave one soft light on for the first minute";
const send = (body: Record<string, unknown> = {}) =>
  POST(
    new Request("http://localhost/api/mira/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "t" },
      body: JSON.stringify({ message: "I'd like to try something small", consent: true, ...body }),
    })
  );
const reply = (text: string) =>
  vi.mocked(askModel).mockResolvedValueOnce({ ok: true, text, refused: false });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMiraAccount).mockResolvedValue(null);
  vi.mocked(getProfile).mockResolvedValue(PROFILE);
  vi.mocked(goalsForPrompt).mockResolvedValue([]);
  vi.mocked(askModel).mockResolvedValue({ ok: true, text: "That makes sense.", refused: false });
});

describe("Mira's goal suggestion in the chat", () => {
  it("reaches the page under her reply, and is counted without its words", async () => {
    reply(`A gentle first step could be the light.\n[[GOAL:${SUGGESTION}]]`);
    const res = await send();
    const body = await res.json();
    expect(body.reply).toBe("A gentle first step could be the light.");
    expect(body.goal).toBe(SUGGESTION);
    expect(logMiraEvent).toHaveBeenCalledWith(
      "goal_suggested",
      expect.objectContaining({ anonId: "anon_test_123456789" }),
      { signedIn: false }
    );
    expect(JSON.stringify(vi.mocked(logMiraEvent).mock.calls)).not.toContain("soft light");
  });

  it("is never offered beside the support lines", async () => {
    reply(`Please reach out to someone now.\n[[GOAL:${SUGGESTION}]]\n[[CRISIS]]`);
    const body = await (await send()).json();
    expect(body.crisis).toBe(true);
    expect(body.goal).toBeUndefined();
    expect(logMiraEvent).not.toHaveBeenCalledWith(
      "goal_suggested",
      expect.anything(),
      expect.anything()
    );
  });

  it("leaves a reply without one as it was", async () => {
    const body = await (await send()).json();
    expect(body).not.toHaveProperty("goal");
  });
});

describe("Mira's context for a signed-in person", () => {
  beforeEach(() => vi.mocked(getMiraAccount).mockResolvedValue(LEA));

  it("carries their goals on the go, counted in their own time zone", async () => {
    vi.mocked(goalsForPrompt).mockResolvedValueOnce([
      { text: SUGGESTION, target: 3, thisWeek: 1, daysSinceLast: 2 },
    ]);
    expect((await send()).status).toBe(200);
    expect(goalsForPrompt).toHaveBeenCalledWith(LEA.id, "Europe/Berlin");
    const personal = vi.mocked(askModel).mock.calls[0]![1];
    expect(personal).toContain("THEIR GOALS");
    expect(personal).toContain(`"${SUGGESTION}": aims for 3 days a week`);
  });

  it("still answers when the goals can't be read", async () => {
    vi.mocked(goalsForPrompt).mockRejectedValueOnce(new Error("relation does not exist"));
    const res = await send();
    expect(res.status).toBe(200);
    expect(vi.mocked(askModel).mock.calls[0]![1]).not.toContain("THEIR GOALS");
  });

  it("reads no goals for someone without an account", async () => {
    vi.mocked(getMiraAccount).mockResolvedValue(null);
    await send();
    expect(goalsForPrompt).not.toHaveBeenCalled();
  });
});
