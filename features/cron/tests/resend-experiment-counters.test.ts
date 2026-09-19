import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Resend webhook recording which A/B arm an email was sent with.
 *
 * This is the whole mechanism that makes the five email experiments readable.
 * Before 2026-09-19 `pickEmailVariant` picked a template and that was the end of
 * it — no column, no analytics property, no tag — so Marcus's "daily chart with
 * CVR per experiment" could only ever have shown the one landing test and
 * silently omitted five others.
 */
const { mockFetch, mockVerify, mockNotifySlack, mockAddToSuppression } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockVerify: vi.fn(),
  mockNotifySlack: vi.fn(),
  mockAddToSuppression: vi.fn(),
}));

vi.mock("svix", () => ({
  Webhook: class {
    verify(...args: unknown[]) {
      return mockVerify(...args);
    }
  },
}));
vi.mock("@upstash/redis", () => ({ Redis: class {} }));
vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetch(...args),
}));
vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@shared/observability/slack", () => ({
  notifySlack: (...args: unknown[]) => mockNotifySlack(...args),
  maskEmail: (e: string) => e,
  escapeSlack: (s: string) => s,
}));
vi.mock("@shared/emails/suppression", () => ({
  addToSuppression: (...args: unknown[]) => mockAddToSuppression(...args),
}));

import { POST } from "@/app/api/resend/webhook/route";

function request() {
  return new Request("https://www.loveiq.org/api/resend/webhook", {
    method: "POST",
    headers: {
      "svix-id": `msg_${Math.random().toString(36).slice(2)}`,
      "svix-timestamp": "1",
      "svix-signature": "v1,x",
    },
    body: "{}",
  });
}

/** The RPC call the webhook makes to bump a counter, if it made one. */
function counterCall(): Record<string, unknown> | null {
  const call = mockFetch.mock.calls.find((c) =>
    String(c[0]).includes("rpc/bump_email_experiment_event")
  );
  if (!call) return null;
  return JSON.parse((call[1] as { body: string }).body) as Record<string, unknown>;
}

describe("resend webhook: per-arm experiment counters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_WEBHOOK_SECRET = "whsec_test";
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    // The idempotency claim and the counter both go through fetchWithTimeout.
    mockFetch.mockResolvedValue({ ok: true, status: 201, headers: new Headers() });
  });

  it("records the arm Resend echoes back, stripping the email. prefix", async () => {
    mockVerify.mockReturnValue({
      type: "email.opened",
      data: {
        to: ["a@example.com"],
        tags: [
          { name: "exp", value: "survey-complete" },
          { name: "arm", value: "b" },
        ],
      },
    });
    const res = await POST(request());
    expect(res.status).toBe(200);
    const body = counterCall();
    expect(body, "the counter RPC must have been called").not.toBeNull();
    expect(body!.p_experiment).toBe("survey-complete");
    expect(body!.p_arm).toBe("b");
    // "opened", not "email.opened" — the readout groups on the bare type.
    expect(body!.p_event_type).toBe("opened");
  });

  it("counts delivered, which is the denominator", async () => {
    /**
     * An email that never arrived cannot be opened, so counting sends instead
     * would penalise whichever arm happened to draw more dead addresses — noise
     * with nothing to do with the copy under test.
     */
    mockVerify.mockReturnValue({
      type: "email.delivered",
      data: {
        to: ["a@example.com"],
        tags: [
          { name: "exp", value: "invite" },
          { name: "arm", value: "a" },
        ],
      },
    });
    await POST(request());
    expect(counterCall()?.p_event_type).toBe("delivered");
  });

  it("counts a complaint against its arm too", async () => {
    // A variant that gets marked as spam more often is a result, not noise.
    mockVerify.mockReturnValue({
      type: "email.complained",
      data: {
        to: ["a@example.com"],
        tags: [
          { name: "exp", value: "report-share" },
          { name: "arm", value: "c" },
        ],
      },
    });
    await POST(request());
    expect(counterCall()?.p_event_type).toBe("complained");
    // …and the suppression behaviour it already had is untouched.
    expect(mockAddToSuppression).toHaveBeenCalled();
  });

  it("records nothing for an untagged email", async () => {
    /**
     * Every transactional send is untagged, as is every A/B email sent before
     * this shipped. Bucketing those into a default arm would invent data, and
     * the arm they would land in is the one that looks like a winner.
     */
    mockVerify.mockReturnValue({ type: "email.opened", data: { to: ["a@example.com"] } });
    await POST(request());
    expect(counterCall()).toBeNull();
  });

  it("records nothing when only one of the two tags is present", async () => {
    mockVerify.mockReturnValue({
      type: "email.opened",
      data: { to: ["a@example.com"], tags: [{ name: "exp", value: "survey-paused" }] },
    });
    await POST(request());
    expect(counterCall()).toBeNull();
  });

  it("accepts tags as a plain object as well as an array", async () => {
    // Resend has shipped both shapes depending on the API version that created
    // the send; handling one silently records nothing the day they change it.
    mockVerify.mockReturnValue({
      type: "email.clicked",
      data: { to: ["a@example.com"], tags: { exp: "survey-paused", arm: "a" } },
    });
    await POST(request());
    expect(counterCall()?.p_experiment).toBe("survey-paused");
    expect(counterCall()?.p_arm).toBe("a");
  });

  it("buckets the day in Berlin, not UTC", async () => {
    /**
     * PINNED TO A MOMENT WHERE THE TWO DIFFER. Written first as
     * `expect(day).toBe(<Berlin today>)`, which passes for 22 hours a day
     * whichever timezone the code uses — a mutation swapping Berlin for UTC
     * survived it. 22:30 UTC is already the next day in Berlin, so the two
     * answers are different strings and the assertion has something to catch.
     */
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-19T22:30:00.000Z"));
      mockVerify.mockReturnValue({
        type: "email.opened",
        data: { to: ["a@example.com"], tags: { exp: "invite", arm: "a" } },
      });
      await POST(request());
      const day = counterCall()?.p_day as string;
      expect(day).toBe("2026-09-20"); // Berlin
      expect(day).not.toBe("2026-09-19"); // UTC
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not double-count when Resend retries the same event", async () => {
    /**
     * LOAD-BEARING ORDERING. `recordExperimentEvent` runs AFTER the svix_id
     * claim, which returns early on a replay — so a retry cannot inflate a
     * counter. Move the call three lines up and every Resend retry inflates the
     * arm it belongs to, which can flip which variant the digest calls a winner.
     * Nothing else in the suite pins that order.
     *
     * The claim is a POST to resend_webhook_event that answers 409 on a
     * duplicate, which is what the second call simulates here.
     */
    const tagged = {
      type: "email.opened",
      data: { to: ["a@example.com"], tags: { exp: "survey-complete", arm: "b" } },
    };
    mockVerify.mockReturnValue(tagged);

    // First delivery: claim succeeds (201), counter is written.
    mockFetch.mockResolvedValue({ ok: true, status: 201, headers: new Headers() });
    await POST(request());
    expect(counterCall(), "first delivery must count").not.toBeNull();

    // Retry of the SAME svix_id: the claim 409s and the handler returns early.
    vi.clearAllMocks();
    mockVerify.mockReturnValue(tagged);
    mockFetch.mockResolvedValue({ ok: false, status: 409, headers: new Headers() });
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(counterCall(), "a replay must not count again").toBeNull();
  });

  it("does not fail the webhook when the counter write throws", async () => {
    /**
     * The webhook's real job is suppressing bounces and complaints. An
     * experiment counter is not worth a non-200 that makes Resend retry, or a
     * hard bounce that never gets suppressed.
     */
    mockVerify.mockReturnValue({
      type: "email.bounced",
      data: { to: ["a@example.com"], tags: { exp: "invite", arm: "b" } },
    });
    mockFetch.mockImplementation((url: string) =>
      String(url).includes("bump_email_experiment_event")
        ? Promise.reject(new Error("counter is down"))
        : Promise.resolve({ ok: true, status: 201, headers: new Headers() })
    );
    const res = await POST(request());
    expect(res.status).toBe(200);
    // The suppression still happened — the point of the whole endpoint.
    expect(mockAddToSuppression).toHaveBeenCalled();
  });
});
