import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: vi.fn(), set: vi.fn() })) }));
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async () => new Response("[]", { status: 200 })),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { supabaseFetch } from "@features/admin/server/supabase";
import { stopForMinor } from "@features/mira/server/minor";

/**
 * Rail 15, 22 Nov 2026 (security review L3): the under-18 stop also deletes the body check, as the
 * other self-checks, and any change of email still pending.
 */

const LEA = "6f2c4a1e-1111-4222-8333-944455556666";
const deleted = () =>
  vi
    .mocked(supabaseFetch)
    .mock.calls.filter(([, init]) => init?.method === "DELETE")
    .map(([path]) => String(path).split("?")[0]);

beforeEach(() => vi.clearAllMocks());

describe("stopForMinor", () => {
  it("deletes the body check and a pending change of email with the rest", async () => {
    await stopForMinor(LEA);
    expect(deleted()).toEqual(
      expect.arrayContaining(["/rest/v1/mira_body_check", "/rest/v1/mira_email_change"])
    );
  });
});
