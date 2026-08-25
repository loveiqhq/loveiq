import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabaseFetch = vi.fn();
const mockPost = vi.fn();
const mockUpdate = vi.fn();
const mockBotConfigured = vi.fn();
const mockIsProdCronHost = vi.fn();
const mockBuildJourney = vi.fn();

vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...a: unknown[]) => mockSupabaseFetch(...a),
}));
vi.mock("@shared/observability/slack-bot", () => ({
  isSlackBotConfigured: () => mockBotConfigured(),
  postJourneyMessage: (...a: unknown[]) => mockPost(...a),
  updateJourneyMessage: (...a: unknown[]) => mockUpdate(...a),
}));
vi.mock("@shared/http/is-prod-cron-host", () => ({
  isProdCronHost: () => mockIsProdCronHost(),
}));
vi.mock("@shared/observability/slack-alert-dedup", () => ({
  recordCronRun: vi.fn(),
  startCronTimer: () => vi.fn(),
}));
vi.mock("@features/attribution/server/journey", () => ({
  buildSubmissionJourney: (...a: unknown[]) => mockBuildJourney(...a),
}));

import { GET } from "@/app/api/cron/journey-backfill/route";

const SECRET = "test-cron-secret";
const req = (qs = "") =>
  new Request(`https://www.loveiq.org/api/cron/journey-backfill${qs}`, {
    headers: { authorization: `Bearer ${SECRET}` },
  });

function journey(id: number, opts: { viewed?: boolean } = {}) {
  return {
    submissionId: id,
    firstName: "Ada",
    emailMasked: "a***@example.com",
    arms: { landing: "white", survey: "dark", pricing: "A", paywall: null },
    traffic: { source: null, medium: null, campaign: null, clickId: null },
    device: "Desktop",
    country: "Germany",
    countryTier: "tier_1",
    timings: {
      completedAt: "2026-08-20T10:00:00.000Z",
      durationMs: 540_000,
      msToPurchase: null,
      msCheckoutHesitation: null,
    },
    milestones: {
      reportViewedAt: opts.viewed ? "2026-08-20T11:00:00.000Z" : null,
      paywallInitiatedAt: null,
      checkoutStartedAt: null,
      purchasedAt: null,
    },
    money: null,
    quoteCount: 0,
  };
}

/**
 * `supabaseFetch` is dispatched on the URL because the route makes five
 * different reads and writes. Keyed on distinctive substrings rather than call
 * order, so adding a query does not silently shift every expectation.
 */
function routeData(opts: {
  submissions?: Array<{ id: number; count: number }>;
  marks?: Array<{
    survey_submission_id: number;
    channel: string;
    message_ts: string;
    backfilled_at: string | null;
  }>;
  serverOpens?: number[];
}) {
  const subs = opts.submissions ?? [{ id: 101, count: 59 }];
  mockSupabaseFetch.mockImplementation((url: string) => {
    const ok = (body: unknown) => Promise.resolve({ ok: true, json: async () => body } as never);
    if (url.includes("survey_submission?status=eq.completed")) {
      return ok(subs.map((s) => ({ id: s.id, survey_submission_answer: [{ count: s.count }] })));
    }
    if (url.includes("slack_journey_message?survey_submission_id=in.")) {
      return ok(opts.marks ?? []);
    }
    if (url.includes("survey_submission_id=eq.0")) return ok([]);
    if (url.includes("personal_report")) {
      return ok(
        (opts.serverOpens ?? []).map((id) => ({
          survey_submission_id: id,
          report_session: [{ count: 1 }],
        }))
      );
    }
    return ok([]); // the writes
  });
}

describe("GET /api/cron/journey-backfill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
    process.env.JOURNEY_BACKFILL_ENABLED = "true";
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.loveiq.org";
    mockIsProdCronHost.mockReturnValue(true);
    mockBotConfigured.mockReturnValue(true);
    mockPost.mockResolvedValue({ channel: "C1", ts: "111.1" });
    mockUpdate.mockResolvedValue(true);
    mockBuildJourney.mockImplementation((id: number) => Promise.resolve(journey(id)));
    routeData({});
  });

  afterEach(() => {
    delete process.env.JOURNEY_BACKFILL_ENABLED;
  });

  it("refuses a request without the cron secret", async () => {
    const res = await GET(new Request("https://www.loveiq.org/api/cron/journey-backfill") as never);
    expect(res.status).toBe(401);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("does nothing at all unless the enable flag is set", async () => {
    // The annual schedule exists only to give the dashboard a Run button, so a
    // scheduled firing must never post 80 messages by itself.
    delete process.env.JOURNEY_BACKFILL_ENABLED;
    const body = await (await GET(req())).json();
    expect(body.skipped).toBe(true);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("counts without posting in dry-run, even with the flag unset", async () => {
    delete process.env.JOURNEY_BACKFILL_ENABLED;
    routeData({
      submissions: [
        { id: 101, count: 59 },
        { id: 102, count: 58 },
      ],
      marks: [{ survey_submission_id: 101, channel: "C1", message_ts: "9.9", backfilled_at: null }],
      serverOpens: [102],
    });
    const body = await (await GET(req("?dryRun=1"))).json();
    expect(body.dryRun).toBe(true);
    expect(body.pending).toBe(2);
    expect(body.editableInPlace).toBe(1);
    expect(body.threadOnly).toBe(1);
    expect(body.serverKnownReportOpens).toBe(1);
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("skips submissions already backfilled, so a second run cannot double-post", async () => {
    routeData({
      submissions: [
        { id: 101, count: 59 },
        { id: 102, count: 59 },
      ],
      marks: [
        {
          survey_submission_id: 101,
          channel: "C1",
          message_ts: "9.9",
          backfilled_at: "2026-08-25T09:00:00.000Z",
        },
      ],
    });
    const body = await (await GET(req())).json();
    expect(body.posted).toBe(1);
    // One parent + one reply. 101 is done and must not be touched again.
    const replies = mockPost.mock.calls.filter((c) => (c[0] as { threadTs?: string }).threadTs);
    expect(replies).toHaveLength(1);
    expect(mockBuildJourney).toHaveBeenCalledTimes(1);
    expect(mockBuildJourney).toHaveBeenCalledWith(102);
  });

  it("posts the week as thread replies under one parent", async () => {
    routeData({
      submissions: [
        { id: 101, count: 59 },
        { id: 102, count: 59 },
      ],
    });
    await GET(req());
    const calls = mockPost.mock.calls.map((c) => c[0] as { threadTs?: string; text: string });
    // First call is the parent: no thread_ts, and it explains the format change.
    expect(calls[0]!.threadTs).toBeUndefined();
    expect(calls[0]!.text).toContain("new format");
    // Everything after is a reply on that parent's ts.
    expect(calls.slice(1).every((c) => c.threadTs === "111.1")).toBe(true);
    expect(calls).toHaveLength(3);
  });

  it("also corrects in place the messages that ARE editable", async () => {
    routeData({
      submissions: [{ id: 101, count: 59 }],
      marks: [
        { survey_submission_id: 101, channel: "CHAN", message_ts: "555.5", backfilled_at: null },
      ],
    });
    const body = await (await GET(req())).json();
    expect(body.updated).toBe(1);
    // Edited at its ORIGINAL id, not the thread reply's — that message stays the
    // live one its future milestones update.
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "CHAN", ts: "555.5" })
    );
  });

  it("paints a report open the server saw, even with no analytics consent", async () => {
    // 28 of the 83 in this window opened their report per report_session but are
    // absent from consent-gated analytics_event. Rendering off the milestones
    // alone would show those people a RED "Report opened", which in a red/green
    // rail reads as a failure rather than as missing telemetry.
    routeData({ submissions: [{ id: 101, count: 59 }], serverOpens: [101] });
    await GET(req());
    const reply = mockPost.mock.calls.find((c) => (c[0] as { threadTs?: string }).threadTs)!;
    const rendered = JSON.stringify((reply[0] as { blocks: unknown }).blocks);
    expect(rendered).toContain(":large_green_circle: Report opened");
    expect(rendered).not.toContain(":red_circle: Report opened");
  });

  it("leaves a step red when neither the server nor analytics saw it", async () => {
    routeData({ submissions: [{ id: 101, count: 59 }], serverOpens: [] });
    await GET(req());
    const reply = mockPost.mock.calls.find((c) => (c[0] as { threadTs?: string }).threadTs)!;
    const rendered = JSON.stringify((reply[0] as { blocks: unknown }).blocks);
    expect(rendered).toContain(":red_circle: Report opened");
    // The survey itself is always reached — these are completions.
    expect(rendered).toContain(":large_green_circle: Survey done");
  });

  it("reuses an existing thread parent instead of starting a second thread", async () => {
    mockSupabaseFetch.mockImplementation((url: string) => {
      const ok = (body: unknown) => Promise.resolve({ ok: true, json: async () => body } as never);
      if (url.includes("survey_submission?status=eq.completed")) {
        return ok([{ id: 101, survey_submission_answer: [{ count: 59 }] }]);
      }
      if (url.includes("survey_submission_id=eq.0")) return ok([{ message_ts: "PARENT.1" }]);
      if (url.includes("slack_journey_message?survey_submission_id=in.")) return ok([]);
      if (url.includes("personal_report")) return ok([]);
      return ok([]);
    });
    await GET(req());
    const calls = mockPost.mock.calls.map((c) => c[0] as { threadTs?: string });
    // No new parent: every post is a reply on the stored ts.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.threadTs).toBe("PARENT.1");
  });

  it("does not mark a submission done when its Slack post failed", async () => {
    mockPost
      .mockResolvedValueOnce({ channel: "C1", ts: "111.1" }) // parent
      .mockResolvedValueOnce(null); // the reply fails
    const body = await (await GET(req())).json();
    expect(body.posted).toBe(0);
    expect(body.failed).toBe(1);
    const writes = mockSupabaseFetch.mock.calls.filter(
      (c) => (c[1] as { method?: string } | undefined)?.method === "POST"
    );
    // Only the thread-parent row was written; the submission stays pending so a
    // re-run picks it up.
    expect(writes).toHaveLength(1);
  });
});
