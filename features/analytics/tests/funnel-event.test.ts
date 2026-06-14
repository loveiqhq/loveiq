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

import * as csrf from "@shared/http/csrf";
import * as ratelimit from "@shared/http/ratelimit";
import { POST } from "@/app/api/funnel-event/route";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/funnel-event", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": "valid-token",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/funnel-event", () => {
  beforeEach(() => {
    mockSupabaseFetch.mockReset();
    vi.mocked(csrf.verifyCsrfHeaderOrBody).mockResolvedValue(true);
    vi.mocked(ratelimit.checkRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 29,
      resetAt: new Date(),
    });
  });

  it("returns 400 when event_type is invalid", async () => {
    const res = await POST(makeRequest({ event: "bogus", visitor_id: VALID_UUID }));
    expect(res.status).toBe(400);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("returns 400 when visitor_id is not a UUID", async () => {
    const res = await POST(makeRequest({ event: "unique_visitor", visitor_id: "nope" }));
    expect(res.status).toBe(400);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("returns 403 when CSRF check fails", async () => {
    vi.mocked(csrf.verifyCsrfHeaderOrBody).mockResolvedValue(false);
    const res = await POST(makeRequest({ event: "unique_visitor", visitor_id: VALID_UUID }));
    expect(res.status).toBe(403);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limit is hit", async () => {
    vi.mocked(ratelimit.checkRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: new Date(),
    });
    const res = await POST(makeRequest({ event: "unique_visitor", visitor_id: VALID_UUID }));
    expect(res.status).toBe(429);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("returns 204 and inserts the row on success (unique_visitor)", async () => {
    mockSupabaseFetch.mockResolvedValue({ ok: true });
    const res = await POST(makeRequest({ event: "unique_visitor", visitor_id: VALID_UUID }));
    expect(res.status).toBe(204);
    expect(mockSupabaseFetch).toHaveBeenCalledOnce();
    const [path, options] = mockSupabaseFetch.mock.calls[0]!;
    expect(path).toBe("/rest/v1/funnel_event");
    expect((options as { headers: { Prefer: string } }).headers.Prefer).toContain(
      "resolution=ignore-duplicates"
    );
    const body = JSON.parse((options as { body: string }).body);
    expect(body.visitor_id).toBe(VALID_UUID);
    expect(body.event_type).toBe("unique_visitor");
    expect(body.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns 204 and inserts survey_engine_mount with utm_source", async () => {
    mockSupabaseFetch.mockResolvedValue({ ok: true });
    const res = await POST(
      makeRequest({
        event: "survey_engine_mount",
        visitor_id: VALID_UUID,
        utm_source: "google",
      })
    );
    expect(res.status).toBe(204);
    const body = JSON.parse((mockSupabaseFetch.mock.calls[0]![1] as { body: string }).body);
    expect(body.event_type).toBe("survey_engine_mount");
    expect(body.utm_source).toBe("google");
  });

  it("accepts the white pay-first gate events (prepaid_gate_viewed, prepaid_checkout_started)", async () => {
    for (const event of ["prepaid_gate_viewed", "prepaid_checkout_started"] as const) {
      mockSupabaseFetch.mockReset();
      mockSupabaseFetch.mockResolvedValue({ ok: true });
      const res = await POST(makeRequest({ event, visitor_id: VALID_UUID }));
      expect(res.status).toBe(204);
      const body = JSON.parse((mockSupabaseFetch.mock.calls[0]![1] as { body: string }).body);
      expect(body.event_type).toBe(event);
    }
  });

  it("returns 204 even when the insert fails (best-effort)", async () => {
    mockSupabaseFetch.mockResolvedValue({ ok: false, status: 500 });
    const res = await POST(makeRequest({ event: "unique_visitor", visitor_id: VALID_UUID }));
    // Failure is logged but the client gets 204 regardless — same posture as
    // analytics-event. Don't tell the client whether persistence succeeded.
    expect(res.status).toBe(204);
  });

  it("returns 204 when supabaseFetch throws (network error)", async () => {
    mockSupabaseFetch.mockRejectedValue(new Error("network down"));
    const res = await POST(makeRequest({ event: "unique_visitor", visitor_id: VALID_UUID }));
    expect(res.status).toBe(204);
  });

  it("rejects utm_source longer than 64 chars", async () => {
    const res = await POST(
      makeRequest({
        event: "unique_visitor",
        visitor_id: VALID_UUID,
        utm_source: "x".repeat(65),
      })
    );
    expect(res.status).toBe(400);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });
});
