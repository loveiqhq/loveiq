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
    const keys = vi.mocked(checkRateLimit).mock.calls.map(([key, cfg]) => `${cfg.bucket}:${key}`);
    expect(keys).toContain("mira-event-day:anon_test_123456789");
    expect(keys).toContain("mira-event-ip-day:127.0.0.1");
  });

  it("takes only the moments the browser sees, never the server's own KPI events", async () => {
    for (const name of ["chat_started", "message_sent", "crisis_shown", "signup_completed"]) {
      expect((await post({ type: "track", name })).status).toBe(400);
    }
    expect(logMiraEvent).not.toHaveBeenCalled();
  });
});
