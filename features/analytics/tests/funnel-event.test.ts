import { readFileSync } from "node:fs";
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

// The route reads the landing arm from the cookie SERVER-side rather than taking
// it from the request body — the body version was client-attested on a surface
// that decides which homepage ships.
const mockCookieValue = vi.fn<() => string | undefined>(() => undefined);
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (_n: string) => ({ value: mockCookieValue() }) }),
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

  it("keeps the intro cards' steps off the start count's rate-limit bucket", async () => {
    mockSupabaseFetch.mockResolvedValue(new Response(null, { status: 201 }));
    const bucketOf = async (event: string) => {
      vi.mocked(ratelimit.checkRateLimit).mockClear();
      await POST(makeRequest({ event, visitor_id: VALID_UUID }));
      return (vi.mocked(ratelimit.checkRateLimit).mock.calls[0]?.[1] as { bucket: string }).bucket;
    };
    expect(await bucketOf("survey_engine_mount")).toBe("funnel-event");
    expect(await bucketOf("intro_slide_2")).toBe("funnel-event");
    expect(await bucketOf("unique_visitor")).toBe("funnel-event");
    for (const e of ["intro_view", "consent_view", "intro_back_2", "intro_skip_4", "consent_back"])
      expect(await bucketOf(e)).toBe("funnel-event-intro");
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

  it("accepts the intro cards' own steps (20261014120200), and nothing beside them", async () => {
    // The table's CHECK must allow every step the route accepts, or the rows are lost silently.
    const check = readFileSync(
      "supabase/migrations/20261014120200_funnel_event_intro_steps.sql",
      "utf8"
    ).split("ADD CONSTRAINT")[1]!;
    mockSupabaseFetch.mockResolvedValue({ ok: true });
    for (const event of [
      "intro_view",
      "consent_view",
      "intro_back_1",
      "intro_back_2",
      "intro_back_3",
      "intro_back_4",
      "intro_skip_1",
      "intro_skip_2",
      "intro_skip_3",
      "intro_skip_4",
      "consent_back",
    ]) {
      expect(check).toContain(`'${event}'`);
      mockSupabaseFetch.mockClear();
      expect((await POST(makeRequest({ event, visitor_id: VALID_UUID }))).status).toBe(204);
      const body = JSON.parse((mockSupabaseFetch.mock.calls[0]![1] as { body: string }).body);
      expect(body.event_type).toBe(event);
    }
    for (const event of ["intro_back_5", "intro_skip_0", "consent_skip"]) {
      expect((await POST(makeRequest({ event, visitor_id: VALID_UUID }))).status).toBe(400);
    }
  });

  it("accepts pay to start's two events again, under its own label and bucket", async () => {
    // The CHECK kept them since June's pay-first test (20261014120200 still lists them).
    const check = readFileSync(
      "supabase/migrations/20261014120200_funnel_event_intro_steps.sql",
      "utf8"
    ).split("ADD CONSTRAINT")[1]!;
    mockSupabaseFetch.mockResolvedValue({ ok: true });
    // A browser that once saw the landing still sends these under pay_to_start, never
    // under its arm: the landing test must not count the ad's traffic.
    mockCookieValue.mockReturnValue("white_video");
    for (const event of ["prepaid_gate_viewed", "prepaid_checkout_started"]) {
      expect(check).toContain(`'${event}'`);
      mockSupabaseFetch.mockClear();
      vi.mocked(ratelimit.checkRateLimit).mockClear();
      expect((await POST(makeRequest({ event, visitor_id: VALID_UUID }))).status).toBe(204);
      const body = JSON.parse((mockSupabaseFetch.mock.calls[0]![1] as { body: string }).body);
      expect(body).toMatchObject({ event_type: event, landing_variant: "pay_to_start" });
      expect(
        (vi.mocked(ratelimit.checkRateLimit).mock.calls[0]?.[1] as { bucket: string }).bucket
      ).toBe("funnel-event-pay-to-start");
    }
    mockCookieValue.mockReturnValue(undefined);
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

  it("accepts an over-long utm_source and stores it truncated (does not drop the event)", async () => {
    mockSupabaseFetch.mockResolvedValue({ ok: true });
    const res = await POST(
      makeRequest({
        event: "survey_engine_mount",
        visitor_id: VALID_UUID,
        utm_source: "g".repeat(100),
      })
    );
    // The event is kept; sanitizeUtmSource caps the utm at 64 chars rather than
    // rejecting the whole survey-start row (the consent-free start denominator).
    expect(res.status).toBe(204);
    expect(mockSupabaseFetch).toHaveBeenCalledOnce();
    const body = JSON.parse((mockSupabaseFetch.mock.calls[0]![1] as { body: string }).body);
    expect(body.utm_source).toBe("g".repeat(64));
  });

  it("sanitizes a dirty utm_source server-side (strips bad chars, lowercases)", async () => {
    mockSupabaseFetch.mockResolvedValue({ ok: true });
    const res = await POST(
      makeRequest({
        event: "survey_engine_mount",
        visitor_id: VALID_UUID,
        utm_source: "Google/CPC!",
      })
    );
    expect(res.status).toBe(204);
    const body = JSON.parse((mockSupabaseFetch.mock.calls[0]![1] as { body: string }).body);
    expect(body.utm_source).toBe("googlecpc");
  });

  it("rejects an abusively long utm_source (>2048 chars)", async () => {
    const res = await POST(
      makeRequest({
        event: "unique_visitor",
        visitor_id: VALID_UUID,
        utm_source: "x".repeat(2049),
      })
    );
    expect(res.status).toBe(400);
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("stamps the landing arm from the cookie, not from the request body", async () => {
    mockCookieValue.mockReturnValue("white_prev");
    mockSupabaseFetch.mockResolvedValue({ ok: true, status: 201 });
    const { POST } = await import("@/app/api/funnel-event/route");
    const res = await POST(
      new Request("https://www.loveiq.org/api/funnel-event", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": "t" },
        body: JSON.stringify({
          event: "survey_engine_mount",
          visitor_id: "11111111-1111-4111-8111-111111111111",
          // A caller trying to attest an arm must be ignored.
          landing_variant: "white",
        }),
      })
    );
    expect(res.status).toBe(204);
    const body = JSON.parse(
      (mockSupabaseFetch.mock.calls.at(-1)![1] as { body: string }).body
    ) as Record<string, unknown>;
    expect(body.landing_variant).toBe("white_prev");
  });

  it("labels a paying browser's survey steps pay_to_start, whatever arm cookie it holds", async () => {
    // proxy.ts labels that survey's page view so; a start credited to the arm would be a
    // start no visit of the arm led to.
    mockCookieValue.mockReturnValue("white_video");
    mockSupabaseFetch.mockResolvedValue({ ok: true, status: 201 });
    const { POST } = await import("@/app/api/funnel-event/route");
    await POST(
      new Request("https://www.loveiq.org/api/funnel-event", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": "t",
          cookie: `__Host-csrf=t; __liq_pp=rpp_${"q".repeat(32)}`,
        },
        body: JSON.stringify({
          event: "survey_engine_mount",
          visitor_id: "33333333-3333-4333-8333-333333333333",
        }),
      })
    );
    const body = JSON.parse(
      (mockSupabaseFetch.mock.calls.at(-1)![1] as { body: string }).body
    ) as Record<string, unknown>;
    expect(body).toMatchObject({
      event_type: "survey_engine_mount",
      landing_variant: "pay_to_start",
    });
    mockCookieValue.mockReturnValue(undefined);
  });

  it("omits the arm entirely when the visitor carries no landing cookie", async () => {
    mockCookieValue.mockReturnValue(undefined);
    mockSupabaseFetch.mockResolvedValue({ ok: true, status: 201 });
    const { POST } = await import("@/app/api/funnel-event/route");
    await POST(
      new Request("https://www.loveiq.org/api/funnel-event", {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": "t" },
        body: JSON.stringify({
          event: "survey_engine_mount",
          visitor_id: "22222222-2222-4222-8222-222222222222",
        }),
      })
    );
    const body = JSON.parse(
      (mockSupabaseFetch.mock.calls.at(-1)![1] as { body: string }).body
    ) as Record<string, unknown>;
    // Absent, not defaulted to a live arm — the reader must be able to see that
    // this start could not be attributed.
    expect(body.landing_variant).toBeUndefined();
  });
});
