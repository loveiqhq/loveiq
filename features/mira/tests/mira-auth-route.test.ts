import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 4, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/mira/server/anon", () => ({
  anonId: vi.fn().mockResolvedValue("anon_test_123456789"),
}));
const verifyOtp = vi.fn();
vi.mock("@features/mira/server/session", () => ({
  createMiraSupabase: vi.fn(async () => ({ auth: { verifyOtp, signOut: vi.fn() } })),
}));
vi.mock("@features/mira/server/sign-in", () => ({
  SIGN_IN_CODE: /^\d{6,10}$/,
  sendSignInCode: vi.fn().mockResolvedValue(true),
}));
vi.mock("@features/mira/server/store", () => ({
  addMessages: vi.fn().mockResolvedValue([1, 2]),
  createChat: vi.fn().mockResolvedValue("6f2c4a1e-1111-4222-8333-944455556666"),
  logMiraEvent: vi.fn(),
  recordCodeIssued: vi.fn().mockResolvedValue(undefined),
  claimCodeAttempt: vi.fn().mockResolvedValue(true),
  consumeCode: vi.fn().mockResolvedValue(undefined),
  upsertProfileAtSignIn: vi.fn().mockResolvedValue({ name: null, remember_chats: true }),
}));

import { POST } from "@/app/api/mira/auth/route";
import { sendSignInCode } from "@features/mira/server/sign-in";
import {
  addMessages,
  claimCodeAttempt,
  consumeCode,
  recordCodeIssued,
  upsertProfileAtSignIn,
} from "@features/mira/server/store";
import { checkRateLimit } from "@shared/http/ratelimit";

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/mira/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": "t" },
      body: JSON.stringify(body),
    })
  );
}

describe("POST /api/mira/auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: new Date(),
    });
    verifyOtp.mockResolvedValue({
      data: { user: { id: "u1", email: "Lea@Example.com" } },
      error: null,
    });
  });

  it("sends a code only with all three ticks", async () => {
    const missing = await post({
      action: "start",
      email: "lea@example.com",
      adult: true,
      terms: true,
    });
    expect(missing.status).toBe(400);
    const ok = await post({
      action: "start",
      email: "lea@example.com",
      adult: true,
      terms: true,
      consent: true,
    });
    expect(ok.status).toBe(200);
    expect(sendSignInCode).toHaveBeenCalledWith("lea@example.com");
  });

  it("accepts the 8-digit codes Supabase mints", async () => {
    const res = await post({ action: "verify", email: "lea@example.com", code: "12345678" });
    expect(res.status).toBe(200);
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "lea@example.com",
      token: "12345678",
      type: "email",
    });
    expect(upsertProfileAtSignIn).toHaveBeenCalledWith("u1", "lea@example.com", "mira-2026-11-18");
  });

  it("checks no code when Mira has no guess left for the address (or never sent one)", async () => {
    vi.mocked(claimCodeAttempt).mockResolvedValueOnce(false);
    const res = await post({ action: "verify", email: "lea@example.com", code: "12345678" });
    expect(res.status).toBe(400);
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("records each sent code, so a new code resets the guesses", async () => {
    await post({
      action: "start",
      email: "lea@example.com",
      adult: true,
      terms: true,
      consent: true,
    });
    expect(recordCodeIssued).toHaveBeenCalledWith("lea@example.com");
  });

  it("fails closed when a sent code cannot be recorded", async () => {
    vi.mocked(recordCodeIssued).mockRejectedValueOnce(new Error("db down"));
    const res = await post({
      action: "start",
      email: "lea@example.com",
      adult: true,
      terms: true,
      consent: true,
    });
    expect(res.status).toBe(500);
  });

  it("uses up the code once it signs the person in", async () => {
    await post({ action: "verify", email: "lea@example.com", code: "12345678" });
    expect(consumeCode).toHaveBeenCalledWith("lea@example.com");
  });

  it("refuses a wrong code without signing in", async () => {
    verifyOtp.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "Token has expired or is invalid" },
    });
    const res = await post({ action: "verify", email: "lea@example.com", code: "00000000" });
    expect(res.status).toBe(400);
    expect(upsertProfileAtSignIn).not.toHaveBeenCalled();
  });

  it("carries the anonymous chat into the new account", async () => {
    await post({
      action: "verify",
      email: "lea@example.com",
      code: "12345678",
      carry: [
        { role: "user", content: "I hide during sex" },
        { role: "assistant", content: "Tell me more." },
      ],
    });
    expect(addMessages).toHaveBeenCalledTimes(1);
    expect(vi.mocked(addMessages).mock.calls[0]![1]).toHaveLength(2);
  });
});
