import { afterEach, describe, expect, it, vi } from "vitest";

const mockError = vi.fn();
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: (...a: unknown[]) => mockError(...a) },
}));

const mockFetch = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...a: unknown[]) => mockFetch(...a),
}));
vi.mock("@shared/http/circuit-breaker", () => ({
  getBreaker: () => ({ fire: (fn: () => Promise<Response>) => fn() }),
}));

import { supabaseFetch } from "@features/admin/server/supabase";

/**
 * A Response that models single-consumption, like the real one: `text()` and
 * `json()` throw once the body is used, and `clone()` yields an independent
 * copy. A mock without this passes whether the code clones or not, which is
 * exactly how the assertion below was vacuous on its first run.
 */
function makeResponse(status: number, body: string): Response {
  let used = false;
  const read = async (): Promise<string> => {
    if (used) throw new TypeError("Body is unusable: Body has already been read");
    used = true;
    return body;
  };
  return {
    ok: status >= 200 && status < 300,
    status,
    get bodyUsed() {
      return used;
    },
    headers: { get: () => null },
    text: read,
    json: async () => JSON.parse(await read()),
    clone: () => makeResponse(status, body),
  } as unknown as Response;
}

function respond(status: number, body: string): void {
  mockFetch.mockResolvedValue(makeResponse(status, body));
}

describe("a write PostgREST refused", () => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";

  afterEach(() => {
    mockError.mockClear();
    mockFetch.mockClear();
  });

  /**
   * A failed write does not throw, and 37 of 182 write call sites never look at
   * the Response. PostgREST rejects the WHOLE body over one bad column, so a
   * single stale field silently drops the entire row.
   */
  it("logs the rejection, with the PostgREST code", async () => {
    respond(400, JSON.stringify({ code: "42703", message: "column x.y does not exist" }));
    await supabaseFetch("/rest/v1/data_subject_request_log?on_conflict=id", {
      method: "POST",
      body: "{}",
    });
    expect(mockError).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(mockError.mock.calls[0]);
    expect(logged).toContain("42703");
    expect(logged).toContain("write REJECTED");
    // the query string is dropped, so a filter value never reaches the log
    expect(logged).not.toContain("on_conflict");
  });

  /** A unique-violation message embeds the user's own value. */
  it("redacts the conflicting value out of the message", async () => {
    respond(
      409,
      JSON.stringify({
        code: "23505",
        message: "duplicate key value violates unique constraint: Key (email)=(a@b.com) exists",
      })
    );
    await supabaseFetch("/rest/v1/email_suppression", { method: "POST", body: "{}" });
    const logged = JSON.stringify(mockError.mock.calls[0]);
    expect(logged).toContain("23505");
    expect(logged).not.toContain("a@b.com");
    expect(logged).toContain("redacted");
  });

  it("leaves the caller's body unconsumed", async () => {
    respond(400, JSON.stringify({ code: "42703", message: "nope" }));
    const res = await supabaseFetch("/rest/v1/x", { method: "PATCH", body: "{}" });
    await expect(res.json()).resolves.toMatchObject({ code: "42703" });
  });

  it("says nothing about a successful write, or about a failed READ", async () => {
    respond(201, "");
    await supabaseFetch("/rest/v1/x", { method: "POST", body: "{}" });
    expect(mockError).not.toHaveBeenCalled();

    respond(404, JSON.stringify({ code: "PGRST116", message: "not found" }));
    await supabaseFetch("/rest/v1/x?select=id");
    expect(mockError).not.toHaveBeenCalled();
  });

  it("still logs when the error body is not JSON", async () => {
    respond(502, "<html>Bad Gateway</html>");
    await supabaseFetch("/rest/v1/x", { method: "DELETE" });
    expect(mockError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mockError.mock.calls[0])).toContain("502");
  });
});
