import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithTimeout = vi.fn();
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { insertBookingEvent } from "@features/booking/server/events";

/**
 * The only writer left in `features/booking` after the Calendly integration was removed
 * on 2026-09-14. It used to be covered indirectly by the webhook's tests; those went with
 * the webhook, and its remaining caller — the admin "grant post-call coupon" action —
 * MOCKS it. So without this file the function is shipped untested.
 *
 * It is best-effort by design: the coupon has already been minted and emailed by the time
 * this runs, so a failed log row must never turn into a failed grant.
 */
describe("insertBookingEvent", () => {
  beforeEach(() => {
    mockFetchWithTimeout.mockReset();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-for-tests";
  });

  const row = {
    submissionId: 42,
    personalReportId: 7,
    email: "buyer@example.com",
    eventType: "call_coupon_sent" as const,
    sourceCampaign: "post_call",
  };

  it("posts the row to booking_event and reports success", async () => {
    mockFetchWithTimeout.mockResolvedValue({ ok: true, status: 201 });

    await expect(insertBookingEvent(row)).resolves.toBe(true);

    const [url, init] = mockFetchWithTimeout.mock.calls[0]!;
    expect(String(url)).toBe("https://example.supabase.co/rest/v1/booking_event");
    const body = JSON.parse((init as { body: string }).body);
    expect(body).toMatchObject({
      survey_submission_id: 42,
      personal_report_id: 7,
      email: "buyer@example.com",
      event_type: "call_coupon_sent",
      source_campaign: "post_call",
    });
    // Columns the caller did not set must be explicit nulls, not absent — the table
    // has no defaults for them and PostgREST would reject a partial object.
    expect(body.calendly_event_uri).toBeNull();
    expect(body.scheduled_at).toBeNull();
    expect(body.raw).toEqual({});
  });

  /** Best-effort: a rejected insert is reported, never thrown, or a coupon grant fails. */
  it("returns false on a non-ok response rather than throwing", async () => {
    mockFetchWithTimeout.mockResolvedValue({ ok: false, status: 409 });
    await expect(insertBookingEvent(row)).resolves.toBe(false);
  });

  it("returns false when the request throws rather than throwing", async () => {
    mockFetchWithTimeout.mockRejectedValue(new Error("network down"));
    await expect(insertBookingEvent(row)).resolves.toBe(false);
  });

  /** No credentials is a clean skip, and must not attempt a request at all. */
  it("skips silently when Supabase is not configured", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await expect(insertBookingEvent(row)).resolves.toBe(false);
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });
});
