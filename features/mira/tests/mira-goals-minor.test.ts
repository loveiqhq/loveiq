import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: vi.fn(), set: vi.fn() })) }));
vi.mock("@features/admin/server/supabase", () => ({ supabaseFetch: vi.fn() }));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@features/mira/server/store", () => ({
  deleteChats: vi.fn().mockResolvedValue(undefined),
  updateProfile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@features/mira/server/goals", () => ({
  deleteGoals: vi.fn().mockResolvedValue(undefined),
}));

import { deleteGoals } from "@features/mira/server/goals";
import { stopForMinor } from "@features/mira/server/minor";
import { deleteChats } from "@features/mira/server/store";

/** Rail 15 and Challenges & goals: an under-18 stop deletes the account's goals with its chats. */

const LEA = "6f2c4a1e-1111-4222-8333-944455556666";

beforeEach(() => vi.clearAllMocks());

describe("stopForMinor", () => {
  it("deletes the account's goals and their ticks, with its chats", async () => {
    await stopForMinor(LEA);
    expect(deleteGoals).toHaveBeenCalledWith(LEA);
    expect(deleteChats).toHaveBeenCalledWith(LEA);
  });

  it("still deletes the chats when the goals can't be deleted", async () => {
    vi.mocked(deleteGoals).mockRejectedValueOnce(new Error("down"));
    await expect(stopForMinor(LEA)).resolves.toBeUndefined();
    expect(deleteChats).toHaveBeenCalledWith(LEA);
  });

  it("deletes nothing for a browser without an account", async () => {
    await stopForMinor(null);
    expect(deleteGoals).not.toHaveBeenCalled();
  });
});
