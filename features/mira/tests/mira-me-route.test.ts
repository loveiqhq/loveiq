import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/http/csrf", () => ({ verifyCsrfToken: vi.fn().mockResolvedValue(true) }));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/mira/server/nudges", () => ({ isValidTimeZone: () => true }));
const signOut = vi.fn().mockResolvedValue({ error: null });
vi.mock("@features/mira/server/session", () => ({
  getMiraAccount: vi.fn(),
  createMiraSupabase: vi.fn(async () => ({ auth: { signOut } })),
}));
vi.mock("@features/mira/server/store", () => ({
  deleteAccount: vi.fn().mockResolvedValue(undefined),
  deleteChats: vi.fn().mockResolvedValue(undefined),
  findAssessment: vi.fn().mockResolvedValue(null),
  getProfile: vi.fn(),
  listChats: vi.fn().mockResolvedValue([]),
  logMiraEvent: vi.fn(),
  updateProfile: vi.fn().mockResolvedValue(undefined),
}));

import { DELETE, PATCH } from "@/app/api/mira/me/route";
import { verifyCsrfToken } from "@shared/http/csrf";
import { getMiraAccount } from "@features/mira/server/session";
import {
  deleteAccount,
  deleteChats,
  getProfile,
  logMiraEvent,
  updateProfile,
} from "@features/mira/server/store";

const LEA = { id: "u1", email: "lea@example.com" };
const call = (method: string, query = "", body?: unknown) =>
  new Request(`http://localhost/api/mira/me${query}`, {
    method,
    headers: { "Content-Type": "application/json", "x-csrf-token": "t" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMiraAccount).mockResolvedValue(LEA);
});

describe("DELETE /api/mira/me", () => {
  it("takes only ?what=chats or ?what=account, and still needs the CSRF token", async () => {
    for (const query of ["", "?what=", "?what=everything", "?what=CHATS"]) {
      expect((await DELETE(call("DELETE", query))).status, query).toBe(400);
    }
    expect(deleteChats).not.toHaveBeenCalled();
    expect(deleteAccount).not.toHaveBeenCalled();
    vi.mocked(verifyCsrfToken).mockResolvedValueOnce(false);
    expect((await DELETE(call("DELETE", "?what=account"))).status).toBe(403);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("deletes the chats", async () => {
    expect((await DELETE(call("DELETE", "?what=chats"))).status).toBe(200);
    expect(deleteChats).toHaveBeenCalledWith("u1");
  });

  it("logs the deleted account only once it is gone, then signs out", async () => {
    vi.mocked(deleteAccount).mockRejectedValueOnce(new Error("auth down"));
    expect((await DELETE(call("DELETE", "?what=account"))).status).toBe(500);
    expect(logMiraEvent).not.toHaveBeenCalled();

    expect((await DELETE(call("DELETE", "?what=account"))).status).toBe(200);
    expect(deleteAccount).toHaveBeenLastCalledWith(LEA);
    expect(logMiraEvent).toHaveBeenCalledWith("account_deleted", {});
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

describe("PATCH /api/mira/me", () => {
  const stopped = { nudges_on: false };

  it("keeps an unsubscribe and its reason when Settings saves the same switch again", async () => {
    vi.mocked(getProfile).mockResolvedValue(stopped as never);
    const res = await PATCH(call("PATCH", "", { name: "Lea", nudges_on: false }));
    expect(res.status).toBe(200);
    expect(vi.mocked(updateProfile).mock.calls[0]![1]).toEqual({ name: "Lea" });
  });

  it("moves the stop only on a real switch", async () => {
    vi.mocked(getProfile).mockResolvedValue(stopped as never);
    await PATCH(call("PATCH", "", { nudges_on: true }));
    expect(vi.mocked(updateProfile).mock.calls[0]![1]).toEqual({
      nudges_on: true,
      nudges_stopped_at: null,
      nudge_stop_reason: null,
    });

    vi.mocked(getProfile).mockResolvedValue({ nudges_on: true } as never);
    await PATCH(call("PATCH", "", { nudges_on: false }));
    expect(vi.mocked(updateProfile).mock.calls[1]![1]).toMatchObject({
      nudges_on: false,
      nudges_stopped_at: expect.any(String),
    });
  });

  it("doesn't read the profile when the switch isn't sent", async () => {
    await PATCH(call("PATCH", "", { name: "Lea" }));
    expect(getProfile).not.toHaveBeenCalled();
    expect(vi.mocked(updateProfile).mock.calls[0]![1]).toEqual({ name: "Lea" });
  });
});
