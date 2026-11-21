// The staff data-request tool (F-01) covers Mira's voice sessions (features/mira/server/voice.ts):
// exported by the person's account. Erasure is Mira's own account deletion, which cascades to them.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ fetch: vi.fn(), all: vi.fn() }));
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: db.fetch,
  fetchAllRows: db.all,
}));
vi.mock("@features/mira/server/store", () => ({ deleteAccount: vi.fn() }));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("resend", () => ({
  Resend: class {
    contacts = { remove: vi.fn().mockResolvedValue({ data: null, error: null }) };
  },
}));

import { exportDataSubject } from "@features/admin/server/data-subject";

const UID = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  vi.clearAllMocks();
  db.fetch.mockImplementation(
    async (path: string) =>
      new Response(
        JSON.stringify(
          path.startsWith("/rest/v1/mira_user?") ? [{ id: UID, email: "lea@example.com" }] : []
        )
      )
  );
  db.all.mockImplementation(async (path: string) => [{ from: path.split("?")[0] }]);
});

describe("a data request covers Mira's voice sessions", () => {
  it("exports every voice session of the account, by its id", async () => {
    const result = await exportDataSubject("lea@example.com");
    expect(result.exportData?.mira_voice_session).toEqual([
      { from: "/rest/v1/mira_voice_session" },
    ]);
    expect(db.all.mock.calls.map(([p]) => p)).toContain(
      `/rest/v1/mira_voice_session?user_id=in.(${UID})&select=*&order=id.asc`
    );
  });

  it("says so when they could not be read in full", async () => {
    db.all.mockImplementation(async (path: string) =>
      path.startsWith("/rest/v1/mira_voice_session") ? null : []
    );
    const result = await exportDataSubject("lea@example.com");
    expect(result.ok).toBe(false);
    expect(result.warnings).toContain(
      "mira_voice_session: could not be read in full; run the export again"
    );
  });
});
