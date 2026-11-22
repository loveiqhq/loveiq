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
// No under-18 mark (PATCH refuses one: features/mira/tests/mira-settings-server.test.ts).
vi.mock("@features/mira/server/minor", () => ({ isMinor: vi.fn().mockResolvedValue(false) }));
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
      nudges_paused_until: null,
      nudge_stop_reason: null,
    });

    vi.mocked(getProfile).mockResolvedValue({ nudges_on: true } as never);
    await PATCH(call("PATCH", "", { nudges_on: false }));
    expect(vi.mocked(updateProfile).mock.calls[1]![1]).toMatchObject({
      nudges_on: false,
      nudges_stopped_at: expect.any(String),
    });
  });

  it("counts a Settings switch-off as a nudge stop, and a switch-on as a resume, once", async () => {
    const nudgeEvents = () =>
      vi
        .mocked(logMiraEvent)
        .mock.calls.filter(([name]) => name === "nudge_stopped" || name === "nudge_resumed")
        .map(([name, , props]) => [name, props]);
    vi.mocked(getProfile).mockResolvedValue({ nudges_on: true } as never);
    await PATCH(call("PATCH", "", { nudges_on: false }));
    vi.mocked(getProfile).mockResolvedValue(stopped as never);
    await PATCH(call("PATCH", "", { nudges_on: false })); // the same value again: no event
    await PATCH(call("PATCH", "", { nudges_on: true }));
    expect(nudgeEvents()).toEqual([
      ["nudge_stopped", { reason: null, source: "settings" }],
      ["nudge_resumed", { source: "settings" }],
    ]);
  });

  it("saves 'Mira may use my check results' with the other 'What Mira may use' switches", async () => {
    expect((await PATCH(call("PATCH", "", { use_checks: "yes" }))).status).toBe(400);
    expect((await PATCH(call("PATCH", "", { use_checks: true }))).status).toBe(200);
    expect(vi.mocked(updateProfile).mock.calls[0]).toEqual(["u1", { use_checks: true }]);
    expect(logMiraEvent).toHaveBeenCalledWith(
      "settings_saved",
      { userId: "u1" },
      { fields: ["use_checks"] }
    );
  });

  it("records each turn of 'Mira may use my check results', on or off, with its wording's version", async () => {
    await PATCH(call("PATCH", "", { use_checks: true }));
    await PATCH(call("PATCH", "", { use_checks: false }));
    await PATCH(call("PATCH", "", { name: "Lea" })); // not the switch: no record
    vi.mocked(updateProfile).mockRejectedValueOnce(new Error("db down"));
    expect((await PATCH(call("PATCH", "", { use_checks: true }))).status).toBe(500); // not saved
    expect(vi.mocked(logMiraEvent).mock.calls.filter(([n]) => n === "use_checks_set")).toEqual([
      ["use_checks_set", { userId: "u1" }, { on: true, version: "mira-checks-2026-11-22" }],
      ["use_checks_set", { userId: "u1" }, { on: false, version: "mira-checks-2026-11-22" }],
    ]);
  });

  it("puts the coaching scales sent onto the newest saved style: no tab undoes another's (SET-3)", async () => {
    // Tab A saved Guidance 2; tab B, still showing the old style, now sets Depth 4.
    vi.mocked(getProfile).mockResolvedValue({ nudges_on: true, style: { guidance: 2 } } as never);
    await PATCH(call("PATCH", "", { style: { depth: 4 } }));
    expect(vi.mocked(updateProfile).mock.calls[0]![1]).toEqual({
      style: { guidance: 2, depth: 4 },
    });
    // A point moved back to the middle is sent as 3, balanced, and kept as no entry.
    vi.mocked(getProfile).mockResolvedValue({
      nudges_on: false,
      style: { guidance: 2, depth: 4 },
    } as never);
    await PATCH(call("PATCH", "", { style: { guidance: 3 } }));
    expect(vi.mocked(updateProfile).mock.calls[1]![1]).toEqual({ style: { depth: 4 } });
    // "Reset to balanced": every scale at 3, so nothing is left.
    const all = { guidance: 3, challenge: 3, depth: 3, practical: 3, tone: 3 };
    await PATCH(call("PATCH", "", { style: all }));
    expect(vi.mocked(updateProfile).mock.calls[2]![1]).toEqual({ style: {} });
  });

  it("doesn't read the profile when the switch isn't sent", async () => {
    await PATCH(call("PATCH", "", { name: "Lea" }));
    expect(getProfile).not.toHaveBeenCalled();
    expect(vi.mocked(updateProfile).mock.calls[0]![1]).toEqual({ name: "Lea" });
  });
});
