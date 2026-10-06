/**
 * The route that finally writes `report_session.ended_at`.
 *
 * The column existed for the whole life of the product and 0 of 11,230 rows
 * carried a value, so "how long was this reader on the report" had no honest
 * answer and two /admin cards rendered blank. These tests pin the three things
 * that make the answer trustworthy: it stamps the right row, it can stamp the
 * same row twice (a reader who looks away and comes back), and it tells an
 * anonymous caller nothing about which submission ids exist.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@shared/http/csrf", () => ({
  verifyCsrfToken: vi.fn().mockResolvedValue(true),
  verifyCsrfTokenFromBody: vi.fn().mockResolvedValue(true),
  verifyCsrfHeaderOrBody: vi.fn().mockResolvedValue(true),
}));

vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 29, resetAt: new Date() }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

const mockSupabaseFetch = vi.fn();
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST } from "@/app/api/report-session-end/route";

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/report-session-end", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-csrf-token": "valid", ...headers },
    body: JSON.stringify(body),
  });
}

/** One open session for the submission, then a successful PATCH. */
function mockSession(sessionId: string | null) {
  mockSupabaseFetch.mockImplementation((url: string) => {
    if (url.includes("/rest/v1/report_session?select=")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(sessionId ? [{ id: sessionId }] : []),
      });
    }
    return Promise.resolve({ ok: true });
  });
}

const patchCalls = () =>
  mockSupabaseFetch.mock.calls.filter(
    (c) => (c[1] as { method?: string } | undefined)?.method === "PATCH"
  );

describe("POST /api/report-session-end", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stamps ended_at on the reader's session", async () => {
    mockSession("11111111-2222-3333-4444-555555555555");
    const before = Date.now();
    const res = await POST(makeRequest({ submission_id: 2113 }));
    expect(res.status).toBe(204);

    const patch = patchCalls()[0];
    expect(String(patch?.[0])).toContain("id=eq.11111111-2222-3333-4444-555555555555");
    const body = JSON.parse((patch?.[1] as { body: string }).body) as { ended_at: string };
    // Server time, never a client-supplied duration — the client is allowed to
    // say WHEN it left, not HOW LONG it stayed.
    expect(Date.parse(body.ended_at)).toBeGreaterThanOrEqual(before);
    expect(Object.keys(body)).toEqual(["ended_at"]);
  });

  /**
   * The lookup must NOT filter on `ended_at=is.null`.
   *
   * A reader who hides the tab, comes back and reads for another five minutes
   * sends a second beacon. If the first close took the row out of scope, that
   * second visit would be lost and we would have recorded the moment they first
   * looked away as the moment they left — worse than recording nothing.
   */
  it("re-stamps a session that was already closed once", async () => {
    mockSession("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    await POST(makeRequest({ submission_id: 2113 }));
    await POST(makeRequest({ submission_id: 2113 }));
    expect(patchCalls()).toHaveLength(2);

    const lookup = mockSupabaseFetch.mock.calls
      .map((c) => String(c[0]))
      .find((u) => u.includes("select="));
    expect(lookup).not.toContain("ended_at=is.null");
    // Newest first: the session they are in now, not the one they opened last week.
    expect(lookup).toContain("order=started_at.desc");
    expect(lookup).toContain("limit=1");
  });

  it("writes nothing when the report has never been opened", async () => {
    mockSession(null);
    const res = await POST(makeRequest({ submission_id: 999_999 }));
    // 204, same as the success path: an anonymous caller must not be able to
    // tell which submission ids exist by watching the status code.
    expect(res.status).toBe(204);
    expect(patchCalls()).toHaveLength(0);
  });

  it("rejects a request with no CSRF token", async () => {
    const { verifyCsrfHeaderOrBody } = await import("@shared/http/csrf");
    vi.mocked(verifyCsrfHeaderOrBody).mockResolvedValueOnce(false);
    mockSession("11111111-2222-3333-4444-555555555555");
    const res = await POST(makeRequest({ submission_id: 2113 }));
    expect(res.status).toBe(403);
    expect(patchCalls()).toHaveLength(0);
  });

  it("accepts the CSRF token from the body, because sendBeacon cannot set headers", async () => {
    const { verifyCsrfHeaderOrBody } = await import("@shared/http/csrf");
    mockSession("11111111-2222-3333-4444-555555555555");
    await POST(makeRequest({ submission_id: 2113, _csrf: "from-body" }));
    expect(verifyCsrfHeaderOrBody).toHaveBeenCalledWith(expect.anything(), "from-body");
  });

  it("rate-limits by IP", async () => {
    const { checkRateLimit } = await import("@shared/http/ratelimit");
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: new Date(),
    });
    mockSession("11111111-2222-3333-4444-555555555555");
    const res = await POST(makeRequest({ submission_id: 2113 }));
    expect(res.status).toBe(429);
    expect(patchCalls()).toHaveLength(0);
  });

  it.each([
    ["missing submission", {}],
    ["negative id", { submission_id: -1 }],
    ["string id", { submission_id: "2113" }],
  ])("rejects %s", async (_label, body) => {
    mockSession("11111111-2222-3333-4444-555555555555");
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
    expect(patchCalls()).toHaveLength(0);
  });

  it("stays quiet when Supabase is down", async () => {
    // Best-effort: a missed close costs precision on one reader and must never
    // turn into an error the browser retries on its way out of the page.
    mockSupabaseFetch.mockRejectedValue(new Error("supabase down"));
    const res = await POST(makeRequest({ submission_id: 2113 }));
    expect(res.status).toBe(204);
  });
});
