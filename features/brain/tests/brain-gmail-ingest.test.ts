import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@shared/http/google-oauth", () => ({
  DIRECTORY_SCOPE: "directory",
  GMAIL_SCOPE: "gmail",
  getGoogleAccessToken: vi.fn(async () => "own-token"),
  getDelegatedToken: vi.fn(async () => "delegated-token"),
  googleCredentialShape: () => "oidc=1",
}));

let existing: Array<{ source_id: string; meta: Record<string, unknown> }> = [];
let touchedCount = 0;
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: vi.fn(async (path: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET" && path.includes("select=source_id,meta")) {
      const off = Number(/offset=(\d+)/.exec(path)?.[1] ?? 0);
      return { ok: true, headers: new Headers(), json: async () => (off === 0 ? existing : []) };
    }
    if (method === "PATCH") {
      touchedCount = existing.length;
      return {
        ok: true,
        headers: new Headers({ "content-range": `*/${touchedCount}` }),
        json: async () => [],
      };
    }
    return {
      ok: true,
      status: 201,
      headers: new Headers({ "content-range": "0-0/0" }),
      json: async () => [],
    };
  }),
}));

let listingOk = true;
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string) => {
    // Directory API: pretend delegation cannot resolve the domain's mailboxes,
    // which is the real-world state this test exists for.
    if (url.includes("admin/directory")) {
      return { ok: false, status: 403, text: async () => "not delegated" };
    }
    if (url.includes("/threads")) {
      return listingOk
        ? { ok: true, status: 200, json: async () => ({ threads: [] }), text: async () => "" }
        : {
            ok: false,
            status: 400,
            text: async () => '{"error":{"code":400,"message":"Precondition check failed."}}',
          };
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
  }),
}));

import { ingestGmail } from "@features/brain/server/ingest/gmail";

beforeEach(() => {
  existing = [];
  touchedCount = 0;
  listingOk = true;
  process.env.GMAIL_MAILBOXES = "";
});

describe("a broken Gmail walk must not report success", () => {
  /**
   * THE REGRESSION THIS EXISTS FOR.
   *
   * `gmail-nothing-to-index` is a deliberate skip — it reports success and never
   * alerts, because an empty mailbox is not a fault. It was checked BEFORE
   * `complete`, so a run where Gmail refused every request also matched it.
   *
   * Observed in production on 2026-08-30: delegation stopped resolving mailboxes,
   * Gmail answered 400 "Precondition check failed" to every listing, and the only
   * thing keeping it visible was that the run still touched 9,061 existing rows.
   * A builder-version bump correctly stopped those touches — and the same broken
   * run started reporting success.
   */
  it("reports an incomplete walk, not 'nothing to index', when the API refuses everything", async () => {
    listingOk = false;
    const result = await ingestGmail("2026-08-30T00:00:00.000Z", () => false, null);
    expect(result.skipped).toBe("gmail-walk-incomplete");
    expect(result.skipped).not.toBe("gmail-nothing-to-index");
  });

  it("still reports 'nothing to index' when the walk genuinely completes and finds nothing", async () => {
    listingOk = true;
    const result = await ingestGmail("2026-08-30T00:00:00.000Z", () => false, null);
    expect(result.skipped).toBe("gmail-nothing-to-index");
  });

  it("never sweeps after a failed walk, or an outage would delete the corpus", async () => {
    listingOk = false;
    const result = await ingestGmail("2026-08-30T00:00:00.000Z", () => false, null);
    expect(result.swept).toBe(0);
  });
});
