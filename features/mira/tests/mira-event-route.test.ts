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
vi.mock("@features/mira/server/store", () => ({
  logMiraEvent: vi.fn(),
  rateMessage: vi.fn().mockResolvedValue(true),
}));

import { POST } from "@/app/api/mira/event/route";
import { anonId } from "@features/mira/server/anon";
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

  it("keeps an anonymous rating's reply, cut to 2,000 characters", async () => {
    await post({ type: "rating", rating: -1, reply: "x".repeat(4000) });
    expect(loggedProps()).toEqual({ rating: -1, reply: "x".repeat(2000) });
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

  it("takes only the moments the browser sees, never the server's own KPI events", async () => {
    for (const name of ["chat_started", "message_sent", "crisis_shown", "signup_completed"]) {
      expect((await post({ type: "track", name })).status).toBe(400);
    }
    expect(logMiraEvent).not.toHaveBeenCalled();
  });
});
