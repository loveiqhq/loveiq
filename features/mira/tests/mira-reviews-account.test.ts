import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Deleting a Mira account (Settings, a data request, the memory cron) takes the person's rating
 * and words with it: the table cascades (supabase/migrations/20261122080000), and the public
 * figures are recomputed on the next request, so an approved quote doesn't outlive the account
 * in the ten-minute cache.
 */
const order: string[] = [];
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async (path: string, init: { method?: string } = {}) => {
    order.push(`${init.method ?? "GET"} ${path.split("?")[0]}`);
    return new Response("[]", { status: 200 });
  }),
  fetchAllRows: vi.fn(),
}));
vi.mock("@features/brain/server/sign-in", () => ({
  memberByEmail: vi.fn().mockResolvedValue(null),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: vi.fn((tag: string) => void order.push(`revalidate ${tag}`)),
}));

import { deleteAccount } from "@features/mira/server/store";
import { revalidateTag } from "next/cache";

const LEA = { id: "6f2c4a1e-1111-4222-8333-944455556666", email: "lea@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
});

describe("deleting a Mira account", () => {
  it("clears the public ratings at once, after the account (and so its rating) is gone", async () => {
    await deleteAccount(LEA);
    expect(revalidateTag).toHaveBeenCalledWith("mira-reviews", { expire: 0 });
    const gone = order.indexOf(`DELETE /auth/v1/admin/users/${LEA.id}`);
    expect(gone).toBeGreaterThan(-1);
    expect(order.indexOf("revalidate mira-reviews")).toBeGreaterThan(gone);
  });
});
