import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithTimeout = vi.fn();
const mockNotifySlack = vi.fn();

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@shared/observability/slack", () => ({
  notifySlack: (...args: unknown[]) => mockNotifySlack(...args),
}));

import { POST } from "@/app/api/calendly/webhook/route";
import { verifyCalendlySignature, calendlyEventKey } from "@features/booking/server/calendly";

const SECRET = "calendly_test_signing_key";
const ORIGINAL_ENV = { ...process.env };

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function sign(rawBody: string, secret = SECRET, tSec = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac("sha256", secret).update(`${tSec}.${rawBody}`).digest("hex");
  return `t=${tSec},v1=${v1}`;
}

function makeRequest(rawBody: string, signature: string | null): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature) headers["calendly-webhook-signature"] = signature;
  return new Request("https://example.test/api/calendly/webhook", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

describe("verifyCalendlySignature", () => {
  it("accepts a correct signature", () => {
    const body = JSON.stringify({ event: "invitee.created" });
    expect(verifyCalendlySignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify({ event: "invitee.created" });
    const sig = sign(body);
    expect(verifyCalendlySignature(body + "x", sig, SECRET)).toBe(false);
  });

  it("rejects a stale timestamp (replay)", () => {
    const body = JSON.stringify({ event: "invitee.created" });
    const staleT = Math.floor(Date.now() / 1000) - 10 * 60;
    expect(verifyCalendlySignature(body, sign(body, SECRET, staleT), SECRET)).toBe(false);
  });

  it("rejects a missing / malformed header", () => {
    expect(verifyCalendlySignature("{}", null, SECRET)).toBe(false);
    expect(verifyCalendlySignature("{}", "garbage", SECRET)).toBe(false);
  });
});

describe("calendlyEventKey", () => {
  it("combines event + invitee uri", () => {
    expect(
      calendlyEventKey({ event: "invitee.created", payload: { uri: "https://api/invitees/abc" } })
    ).toBe("invitee.created:https://api/invitees/abc");
  });
  it("returns null without an invitee uri", () => {
    expect(calendlyEventKey({ event: "invitee.created", payload: {} })).toBeNull();
  });
});

describe("POST /api/calendly/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...ORIGINAL_ENV,
      CALENDLY_WEBHOOK_SECRET: SECRET,
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
    };
    // Default routing: claim succeeds, correlation resolves, insert succeeds.
    mockFetchWithTimeout.mockImplementation(
      (url: string, init?: { method?: string; body?: string }) => {
        if (url.includes("/rest/v1/calendly_webhook_event"))
          return Promise.resolve(jsonResponse({}, 200));
        if (url.includes("/rest/v1/personal_report"))
          return Promise.resolve(jsonResponse([{ id: 555 }]));
        if (url.includes("/rest/v1/booking_event")) return Promise.resolve(jsonResponse({}, 201));
        if (url.includes("/rest/v1/app_user")) return Promise.resolve(jsonResponse([{ id: 1 }]));
        if (url.includes("/rest/v1/survey_submission"))
          return Promise.resolve(jsonResponse([{ id: 780 }]));
        return Promise.resolve(jsonResponse([]));
      }
    );
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns 503 when the signing secret is not configured", async () => {
    delete process.env.CALENDLY_WEBHOOK_SECRET;
    const res = await POST(makeRequest("{}", "t=1,v1=x"));
    expect(res.status).toBe(503);
  });

  it("returns 401 + ops alert on a bad signature", async () => {
    const body = JSON.stringify({ event: "invitee.created" });
    const res = await POST(makeRequest(body, "t=1,v1=deadbeef"));
    expect(res.status).toBe(401);
    expect(mockNotifySlack).toHaveBeenCalledTimes(1);
  });

  it("records call_booked for invitee.created, correlated by utm_content", async () => {
    const rawBody = JSON.stringify({
      event: "invitee.created",
      payload: {
        email: "Call@Example.com",
        uri: "https://api.calendly.com/scheduled_events/E1/invitees/I1",
        scheduled_event: {
          uri: "https://api.calendly.com/scheduled_events/E1",
          start_time: "2026-06-05T15:00:00Z",
        },
        tracking: { utm_content: "780", utm_campaign: "78h_no_unlock" },
      },
    });
    const res = await POST(makeRequest(rawBody, sign(rawBody)));
    expect(res.status).toBe(200);

    const bookingCall = mockFetchWithTimeout.mock.calls.find(
      ([url, init]) =>
        String(url).includes("/rest/v1/booking_event") &&
        (init as { method?: string } | undefined)?.method === "POST"
    );
    expect(bookingCall).toBeTruthy();
    const inserted = JSON.parse((bookingCall![1] as { body: string }).body);
    expect(inserted.event_type).toBe("call_booked");
    expect(inserted.survey_submission_id).toBe(780);
    expect(inserted.personal_report_id).toBe(555);
    expect(inserted.scheduled_at).toBe("2026-06-05T15:00:00Z");
    expect(inserted.email).toBe("call@example.com");
  });

  it("records call_canceled for invitee.canceled", async () => {
    const rawBody = JSON.stringify({
      event: "invitee.canceled",
      payload: {
        email: "x@example.com",
        uri: "https://api.calendly.com/scheduled_events/E2/invitees/I2",
        tracking: { utm_content: "780" },
      },
    });
    const res = await POST(makeRequest(rawBody, sign(rawBody)));
    expect(res.status).toBe(200);
    const bookingCall = mockFetchWithTimeout.mock.calls.find(
      ([url, init]) =>
        String(url).includes("/rest/v1/booking_event") &&
        (init as { method?: string } | undefined)?.method === "POST"
    );
    const inserted = JSON.parse((bookingCall![1] as { body: string }).body);
    expect(inserted.event_type).toBe("call_canceled");
  });

  it("dedupes a replayed event (claim conflict) without inserting", async () => {
    mockFetchWithTimeout.mockImplementation((url: string) => {
      if (url.includes("/rest/v1/calendly_webhook_event"))
        return Promise.resolve(jsonResponse({}, 409));
      if (url.includes("/rest/v1/booking_event")) return Promise.resolve(jsonResponse({}, 201));
      return Promise.resolve(jsonResponse([]));
    });
    const rawBody = JSON.stringify({
      event: "invitee.created",
      payload: { uri: "https://api.calendly.com/scheduled_events/E1/invitees/I1" },
    });
    const res = await POST(makeRequest(rawBody, sign(rawBody)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deduped).toBe(true);
    const bookingCall = mockFetchWithTimeout.mock.calls.find(
      ([url, init]) =>
        String(url).includes("/rest/v1/booking_event") &&
        (init as { method?: string } | undefined)?.method === "POST"
    );
    expect(bookingCall).toBeUndefined();
  });

  it("releases the claim and 500s when the booking insert fails (lets Calendly retry)", async () => {
    mockFetchWithTimeout.mockImplementation((url: string) => {
      // claim POST + release DELETE both hit calendly_webhook_event → ok.
      if (url.includes("/rest/v1/calendly_webhook_event"))
        return Promise.resolve(jsonResponse({}, 200));
      if (url.includes("/rest/v1/personal_report"))
        return Promise.resolve(jsonResponse([{ id: 555 }]));
      // booking insert fails transiently.
      if (url.includes("/rest/v1/booking_event")) return Promise.resolve(jsonResponse({}, 500));
      return Promise.resolve(jsonResponse([]));
    });
    const rawBody = JSON.stringify({
      event: "invitee.created",
      payload: {
        uri: "https://api.calendly.com/scheduled_events/E9/invitees/I9",
        tracking: { utm_content: "780" },
      },
    });
    const res = await POST(makeRequest(rawBody, sign(rawBody)));
    expect(res.status).toBe(500);
    const releaseCall = mockFetchWithTimeout.mock.calls.find(
      ([url, init]) =>
        String(url).includes("/rest/v1/calendly_webhook_event") &&
        (init as { method?: string } | undefined)?.method === "DELETE"
    );
    expect(releaseCall).toBeTruthy();
  });

  it("ignores unrelated event types", async () => {
    const rawBody = JSON.stringify({
      event: "routing_form_submission.created",
      payload: { uri: "https://api.calendly.com/x/y" },
    });
    const res = await POST(makeRequest(rawBody, sign(rawBody)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.handled).toBe(false);
  });
});
