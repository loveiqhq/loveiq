import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/mira/server/session", () => ({ getMiraAccount: vi.fn() }));
vi.mock("@features/mira/server/store", () => ({
  deleteChat: vi.fn(),
  getMessages: vi.fn().mockResolvedValue([]),
  logMiraEvent: vi.fn(),
  ownsChat: vi.fn(),
}));

import { DELETE } from "@/app/api/mira/chats/[id]/route";
import { getMiraAccount } from "@features/mira/server/session";
import { deleteChat, logMiraEvent } from "@features/mira/server/store";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit } from "@shared/http/ratelimit";

const CHAT = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b";
const LEA = { id: "6f2c4a1e-1111-4222-8333-944455556666", email: "lea@example.com" };
const remove = () =>
  DELETE(new Request(`http://localhost/api/mira/chats/${CHAT}`, { method: "DELETE" }), {
    params: Promise.resolve({ id: CHAT }),
  });

/** Round-2 audit CHAT-29, lead decision 4: DELETE /api/mira/chats/[id]. */
describe("DELETE /api/mira/chats/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyCsrfToken).mockResolvedValue(true);
    vi.mocked(getMiraAccount).mockResolvedValue(LEA as never);
    vi.mocked(deleteChat).mockResolvedValue(true);
  });

  it("deletes the account's own chat, and counts it without any words", async () => {
    const res = await remove();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(deleteChat).toHaveBeenCalledWith(LEA.id, CHAT);
    expect(logMiraEvent).toHaveBeenCalledWith("chat_deleted", { userId: LEA.id });
  });

  it("answers 404 for a chat that isn't theirs (or is gone), and deletes nothing else", async () => {
    vi.mocked(deleteChat).mockResolvedValue(false);
    expect((await remove()).status).toBe(404);
    expect(logMiraEvent).not.toHaveBeenCalled();
  });

  it("needs the CSRF token, a sign-in and a calm pace", async () => {
    vi.mocked(verifyCsrfToken).mockResolvedValueOnce(false);
    expect((await remove()).status).toBe(403);
    vi.mocked(getMiraAccount).mockResolvedValueOnce(null);
    expect((await remove()).status).toBe(401);
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: new Date(),
    });
    expect((await remove()).status).toBe(429);
    expect(deleteChat).not.toHaveBeenCalled();
  });

  it("says so when the delete fails", async () => {
    vi.mocked(deleteChat).mockRejectedValueOnce(new Error("down"));
    const res = await remove();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Unable to delete this chat." });
  });
});
