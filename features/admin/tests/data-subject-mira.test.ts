// The admin export/erasure tool (F-01) covers Mira, the AI coach: her tables are exported by the
// person's account, and erased through Mira's own account deletion.
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

import { deleteDataSubject, exportDataSubject } from "@features/admin/server/data-subject";
import { deleteAccount } from "@features/mira/server/store";

const UID = "11111111-2222-4333-8444-555555555555";
const ACCOUNT = { id: UID, email: "lea@example.com", name: "Lea" };
const ok = (rows: unknown, deleted = 0) =>
  new Response(JSON.stringify(rows), {
    status: 200,
    headers: { "content-range": `*/${deleted}` },
  });

let accounts: unknown[];
const fetched = () => db.fetch.mock.calls.map(([path, init]) => [init?.method ?? "GET", path]);

beforeEach(() => {
  vi.clearAllMocks();
  accounts = [ACCOUNT];
  db.fetch.mockImplementation(async (path: string, init?: { method?: string }) => {
    if (path.startsWith("/rest/v1/mira_user?email=eq.lea%40example.com")) return ok(accounts);
    if (path.startsWith("/rest/v1/mira_sign_in_code?email=eq.lea%40example.com")) {
      return init?.method === "DELETE" ? ok(null, 1) : ok([{ email: "lea@example.com" }]);
    }
    return ok([]);
  });
  db.all.mockImplementation(async (path: string) => [{ from: path.split("?")[0] }]);
  vi.mocked(deleteAccount).mockResolvedValue(undefined);
});

describe("DSAR export covers Mira (Art. 15)", () => {
  it("exports the account, its chats and messages, body checks, nudges, events, rating and a pending code", async () => {
    const result = await exportDataSubject("lea@example.com");
    expect(result.ok).toBe(true);
    expect(result.exportData?.mira_user).toEqual([ACCOUNT]);
    expect(result.exportData?.mira_sign_in_code).toEqual([{ email: "lea@example.com" }]);
    for (const table of [
      "mira_chat",
      "mira_message",
      "mira_body_check",
      "mira_nudge",
      "mira_event",
      "mira_review", // the rating, and any words with their consent and status
    ]) {
      expect(result.exportData?.[table]).toEqual([{ from: `/rest/v1/${table}` }]);
    }
    // Every row (paged), by the account's id; messages through their chat.
    const paths = db.all.mock.calls.map(([p]) => p as string);
    expect(paths).toContain(`/rest/v1/mira_chat?user_id=in.(${UID})&select=*&order=id.asc`);
    expect(paths).toContain(
      `/rest/v1/mira_message?select=*,mira_chat!inner(user_id)&mira_chat.user_id=in.(${UID})&order=id.asc`
    );
    expect(paths).toContain(`/rest/v1/mira_event?user_id=in.(${UID})&select=*&order=id.asc`);
    expect(paths).toContain(`/rest/v1/mira_review?user_id=in.(${UID})&select=*&order=id.asc`);
  });

  it("reads nothing more when there is no Mira account", async () => {
    accounts = [];
    const result = await exportDataSubject("lea@example.com");
    expect(result.exportData?.mira_user).toEqual([]);
    expect(db.all).not.toHaveBeenCalled();
  });

  it("says so when a Mira table could not be read in full", async () => {
    db.all.mockImplementation(async (path: string) =>
      path.startsWith("/rest/v1/mira_message") ? null : []
    );
    const result = await exportDataSubject("lea@example.com");
    expect(result.ok).toBe(false);
    expect(result.warnings).toContain(
      "mira_message: could not be read in full; run the export again"
    );
  });
});

describe("DSAR delete covers Mira (Art. 17)", () => {
  it("deletes each account through Mira's own account deletion, and a pending code", async () => {
    const result = await deleteDataSubject("lea@example.com");
    expect(result.ok).toBe(true);
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(deleteAccount).toHaveBeenCalledWith(ACCOUNT);
    expect(result.rowsAffected.mira_user).toBe(1);
    expect(result.rowsAffected.mira_sign_in_code).toBe(1);
    // Nothing of Mira's is deleted around that path (it keeps staff and Jarvis logins).
    const miraDeletes = fetched().filter(
      ([m, p]) => m === "DELETE" && /\/mira_(?!sign_in_code)/.test(p)
    );
    expect(miraDeletes).toEqual([]);
  });

  it("reports a partial erasure when an account could not be deleted", async () => {
    vi.mocked(deleteAccount).mockRejectedValueOnce(new Error("auth down"));
    const result = await deleteDataSubject("lea@example.com");
    expect(result.ok).toBe(false);
    expect(result.rowsAffected.mira_user).toBe(0);
    expect(result.warnings).toContain(
      "mira_user: an account was not deleted; run the deletion again"
    );
  });

  it("reports a partial erasure when the accounts could not be looked up", async () => {
    db.fetch.mockImplementation(async (path: string) =>
      path.startsWith("/rest/v1/mira_user") ? new Response("{}", { status: 500 }) : ok([])
    );
    const result = await deleteDataSubject("lea@example.com");
    expect(result.ok).toBe(false);
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(result.warnings).toContain("mira_user: could not be read; run the request again");
  });
});
