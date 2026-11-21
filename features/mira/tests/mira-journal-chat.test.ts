import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("@features/mira/server/session", () => ({
  getMiraAccount: vi.fn().mockResolvedValue({ id: "u1", email: "lea@example.com" }),
}));
vi.mock("@features/mira/server/anon", () => ({ anonId: vi.fn().mockResolvedValue(null) }));
vi.mock("@features/mira/server/model", () => ({ askModel: vi.fn() }));
vi.mock("@features/mira/server/alerts", () => ({ alertDailyCeiling: vi.fn() }));
vi.mock("@features/mira/server/store", () => ({
  addMessages: vi.fn().mockResolvedValue([11, 12]),
  createChat: vi.fn().mockResolvedValue("6f2c4a1e-1111-4222-8333-944455556666"),
  findAssessment: vi.fn().mockResolvedValue(null),
  getMessages: vi.fn().mockResolvedValue([]),
  getProfile: vi.fn().mockResolvedValue({
    id: "u1",
    name: "Lea",
    style: {},
    remember_chats: false,
    use_assessment: false,
    country: "DE",
  }),
  logMiraEvent: vi.fn(),
  ownsChat: vi.fn().mockResolvedValue(false),
}));

import { supabaseFetch } from "@features/admin/server/supabase";
import { POST } from "@/app/api/mira/chat/route";
import { askModel } from "@features/mira/server/model";

const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
let share = "off";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(askModel).mockResolvedValue({ ok: true, text: "Thank you for sharing that." } as never);
  const today = new Date().toISOString().slice(0, 10);
  vi.mocked(supabaseFetch).mockImplementation(async (path: string) =>
    path.includes("select=journal_share")
      ? json([{ journal_share: share, time_zone: "UTC" }])
      : path.startsWith("/rest/v1/mira_journal_entry")
        ? json([{ day: today, mood: 2, body: 4, closeness: null, energy: null }])
        : json([])
  );
});

const send = () =>
  POST(
    new Request("http://localhost/api/mira/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "t" },
      body: JSON.stringify({ message: "How was my week?", consent: true }),
    })
  );

describe("the chat and the daily journal", () => {
  it("gives Mira the journal's last days once the person let her read it", async () => {
    share = "scores";
    expect((await send()).status).toBe(200);
    const personal = vi.mocked(askModel).mock.calls[0]![1];
    expect(personal).toContain("THEIR DAILY JOURNAL");
    expect(personal).toMatch(/: mood 2, body 4\.$/m);
  });

  it("leaves it out otherwise", async () => {
    share = "off";
    expect((await send()).status).toBe(200);
    expect(vi.mocked(askModel).mock.calls[0]![1]).not.toContain("JOURNAL");
  });

  it("still answers when the journal can't be read", async () => {
    share = "scores";
    vi.mocked(supabaseFetch).mockImplementation(async (path: string) =>
      path.includes("journal") ? new Response("{}", { status: 500 }) : json([])
    );
    expect((await send()).status).toBe(200);
    expect(vi.mocked(askModel).mock.calls[0]![1]).not.toContain("JOURNAL");
  });
});
