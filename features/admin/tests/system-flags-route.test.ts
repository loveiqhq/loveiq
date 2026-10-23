import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyAdminSession = vi.fn();
vi.mock("@features/admin/server/auth", () => ({
  verifyAdminSession: (...args: unknown[]) => mockVerifyAdminSession(...(args as [])),
}));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@features/admin/server/audit", () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));
const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));
vi.mock("@shared/observability/slack", () => ({
  notifySlack: vi.fn().mockResolvedValue(undefined),
  escapeSlack: (value: string) => value,
  maskEmail: (value: string) => value,
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { PATCH } from "@/app/api/admin/system-flags/route";

const toggle = (key: string, enabled: boolean) =>
  PATCH(
    new Request("http://localhost/api/admin/system-flags", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, enabled }),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyAdminSession.mockResolvedValue({ email: "admin@loveiq.org", role: "admin" });
  mockSupabaseFetch.mockImplementation(async (path: string) => ({
    ok: true,
    json: async () => [{ key: decodeURIComponent(path.split("key=eq.")[1] ?? ""), enabled: false }],
  }));
});

describe("the pre-unlock switches in the admin panel", () => {
  it.each(["report_initial_unlock_gate", "initial_unlock_gift_email"])(
    "%s can be switched off (and on) by an admin",
    async (key) => {
      const off = await toggle(key, false);
      expect(off.status).toBe(200);
      expect(await off.json()).toMatchObject({ ok: true, flag: { key } });
      const on = await toggle(key, true);
      expect(on.status).toBe(200);
    }
  );

  it("still refuses a flag it doesn't know", async () => {
    const response = await toggle("made_up_flag", true);
    expect(response.status).toBe(400);
  });
});
