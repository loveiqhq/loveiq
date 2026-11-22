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

const deletedPaths = () =>
  vi
    .mocked(supabaseFetch)
    .mock.calls.filter(([, init]) => init?.method === "DELETE")
    .map(([path]) => String(path));

beforeEach(() => vi.clearAllMocks());

describe("stopForMinor", () => {
  it("deletes the body check and a pending change of email with the rest", async () => {
    await stopForMinor(LEA);
    expect(deleted()).toEqual(
      expect.arrayContaining(["/rest/v1/mira_body_check", "/rest/v1/mira_email_change"])
    );
  });

  // Round-2 DATA-5: their beta feedback (its words and, when they allowed it, their address) and
  // the note they gave when stopping nudges (on its event) go too, as at account deletion.
  it("deletes their beta feedback and the words they gave for stopping nudges", async () => {
    await stopForMinor(LEA);
    expect(deletedPaths()).toContain(`/rest/v1/mira_event?user_id=eq.${LEA}&name=eq.feedback`);
    const patched = vi
      .mocked(supabaseFetch)
      .mock.calls.filter(([, init]) => init?.method === "PATCH")
      .map(([path, init]) => [String(path), JSON.parse(String(init?.body ?? "{}"))]);
    expect(patched).toContainEqual([
      `/rest/v1/mira_event?user_id=eq.${LEA}&name=eq.nudge_stopped&props->>reason=not.is.null`,
      { props: {} },
    ]);
  });

  // 22 Nov 2026 safety fixes: the account's KPI rows that say something about the person go too.
  it("deletes the account's own records of the mood check's question-9 support panel", async () => {
    await stopForMinor(LEA);
    expect(deletedPaths()).toContain(
      `/rest/v1/mira_event?user_id=eq.${LEA}&name=eq.check_support_shown`
    );
  });
});
