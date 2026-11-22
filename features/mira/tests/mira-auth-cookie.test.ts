import { describe, expect, it, vi } from "vitest";

const { createServerClient } = vi.hoisted(() => ({
  createServerClient: vi.fn((..._args: unknown[]) => ({})),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: vi.fn() }),
}));

import { createMiraSupabase } from "@features/mira/server/session";

/**
 * Round-2 audit DATA-6: Mira's sign-in cookie holds the access and refresh tokens and is read
 * only on the server, so no script on the page (analytics, tag managers, an injected one) may
 * read it.
 */
describe("Mira's sign-in cookie", () => {
  it("is httpOnly, lax and under Mira's own name", async () => {
    await createMiraSupabase();
    const options = createServerClient.mock.calls[0]![2] as {
      cookieOptions: Record<string, unknown>;
    };
    expect(options.cookieOptions).toMatchObject({
      name: "mira-auth",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  });
});
