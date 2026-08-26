import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithTimeout = vi.fn();
const mockSupabaseFetch = vi.fn();
const mockBuildSubmissionJourney = vi.fn();

vi.mock("@shared/observability/logger", () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@shared/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));

vi.mock("@features/attribution/server/journey", () => ({
  buildSubmissionJourney: (...args: unknown[]) => mockBuildSubmissionJourney(...args),
}));

import {
  isSlackBotConfigured,
  postJourneyMessage,
  updateJourneyMessage,
} from "@shared/observability/slack-bot";
import {
  journeyStateOf,
  refreshJourneyMessage,
  tryPostJourneyViaBot,
} from "@features/attribution/server/journey-message";

function json(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response;
}

const ORIGINAL_TOKEN = process.env.SLACK_BOT_TOKEN;
const ORIGINAL_CHANNEL = process.env.SLACK_JOURNEY_CHANNEL_ID;

function configureBot() {
  process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
  process.env.SLACK_JOURNEY_CHANNEL_ID = "C0TEST";
}

function unconfigureBot() {
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.SLACK_JOURNEY_CHANNEL_ID;
}

const message = { text: "Survey completed #1756", blocks: [{ type: "section" }] as never };

const milestones = {
  reportViewedAt: null,
  paywallInitiatedAt: null,
  checkoutStartedAt: null,
  purchasedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  configureBot();
});

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) delete process.env.SLACK_BOT_TOKEN;
  else process.env.SLACK_BOT_TOKEN = ORIGINAL_TOKEN;
  if (ORIGINAL_CHANNEL === undefined) delete process.env.SLACK_JOURNEY_CHANNEL_ID;
  else process.env.SLACK_JOURNEY_CHANNEL_ID = ORIGINAL_CHANNEL;
});

describe("slack-bot transport", () => {
  it("is inert without a token, so behaviour is unchanged with no config", async () => {
    unconfigureBot();
    expect(isSlackBotConfigured()).toBe(false);
    expect(await postJourneyMessage(message)).toBeNull();
    expect(await updateJourneyMessage({ channel: "C0TEST", ts: "1.1", ...message })).toBe(false);
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it("needs BOTH the token and the channel id", async () => {
    delete process.env.SLACK_JOURNEY_CHANNEL_ID;
    expect(isSlackBotConfigured()).toBe(false);
    expect(await postJourneyMessage(message)).toBeNull();
  });

  it("returns the message id so the message can be edited later", async () => {
    mockFetchWithTimeout.mockResolvedValue(
      json({ ok: true, channel: "C0REAL", ts: "1724537.001" })
    );
    expect(await postJourneyMessage(message)).toEqual({ channel: "C0REAL", ts: "1724537.001" });
    const [url, init] = mockFetchWithTimeout.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.channel).toBe("C0TEST");
    // Link previews would push the blocks down and add noise.
    expect(body.unfurl_links).toBe(false);
  });

  it("treats Slack's HTTP-200 {ok:false} as a failure", async () => {
    // Slack answers application errors with a 200 and an `error` in the body, so a
    // status-only check reports success while the message never appears.
    mockFetchWithTimeout.mockResolvedValue(json({ ok: false, error: "channel_not_found" }));
    expect(await postJourneyMessage(message)).toBeNull();
    expect(await updateJourneyMessage({ channel: "C0", ts: "1.1", ...message })).toBe(false);
  });

  it("fails rather than throwing when the post returns no ts", async () => {
    mockFetchWithTimeout.mockResolvedValue(json({ ok: true, channel: "C0REAL" }));
    expect(await postJourneyMessage(message)).toBeNull();
  });

  it("swallows a network error", async () => {
    mockFetchWithTimeout.mockRejectedValue(new Error("socket hang up"));
    expect(await postJourneyMessage(message)).toBeNull();
  });

  it("never puts the token in the request body", async () => {
    mockFetchWithTimeout.mockResolvedValue(json({ ok: true, channel: "C0", ts: "1.1" }));
    await postJourneyMessage(message);
    const [, init] = mockFetchWithTimeout.mock.calls[0] as [string, { body: string }];
    expect(init.body).not.toContain("xoxb-test-token");
  });
});

describe("journeyStateOf", () => {
  it("reports the furthest step reached", () => {
    expect(journeyStateOf(milestones)).toBe("completed");
    expect(journeyStateOf({ ...milestones, reportViewedAt: "x" })).toBe("report_opened");
    expect(journeyStateOf({ ...milestones, paywallInitiatedAt: "x" })).toBe("paywall");
    expect(journeyStateOf({ ...milestones, checkoutStartedAt: "x" })).toBe("checkout");
    expect(journeyStateOf({ ...milestones, purchasedAt: "x" })).toBe("paid");
  });

  it("prefers the furthest step when several are set", () => {
    expect(
      journeyStateOf({
        reportViewedAt: "x",
        paywallInitiatedAt: "x",
        checkoutStartedAt: "x",
        purchasedAt: "x",
      })
    ).toBe("paid");
  });

  it("reports paid even when the earlier consent-gated milestones are missing", () => {
    expect(journeyStateOf({ ...milestones, purchasedAt: "x" })).toBe("paid");
  });
});

describe("tryPostJourneyViaBot", () => {
  it("stores the message id and the question count on a successful post", async () => {
    mockFetchWithTimeout.mockResolvedValue(
      json({ ok: true, channel: "C0REAL", ts: "1724537.001" })
    );
    mockSupabaseFetch.mockResolvedValue(json([], true, 201));

    const posted = await tryPostJourneyViaBot({
      submissionId: 1756,
      questionCount: 59,
      message,
      milestones,
    });
    expect(posted).toBe(true);

    const [, init] = mockSupabaseFetch.mock.calls[0] as [
      string,
      { body: string; headers: Record<string, string> },
    ];
    const row = JSON.parse(init.body) as Record<string, unknown>;
    expect(row.survey_submission_id).toBe(1756);
    expect(row.message_ts).toBe("1724537.001");
    expect(row.state).toBe("completed");
    // Not derivable on refresh: without it the first update would downgrade
    // "59 questions in 12 min" to "0 questions".
    expect(row.question_count).toBe(59);
    expect(init.headers.Prefer).toContain("merge-duplicates");
  });

  it("returns false when unconfigured, so the caller uses the webhook", async () => {
    unconfigureBot();
    expect(
      await tryPostJourneyViaBot({ submissionId: 1, questionCount: 5, message, milestones })
    ).toBe(false);
  });

  it("returns false when Slack rejects, so the notification is not lost", async () => {
    mockFetchWithTimeout.mockResolvedValue(json({ ok: false, error: "not_in_channel" }));
    expect(
      await tryPostJourneyViaBot({ submissionId: 1, questionCount: 5, message, milestones })
    ).toBe(false);
  });
});

describe("refreshJourneyMessage", () => {
  function storedRow(state: string | null, questionCount: number | null = 59) {
    return json([
      { channel: "C0REAL", message_ts: "1724537.001", state, question_count: questionCount },
    ]);
  }

  const journeyAt = (over: Partial<typeof milestones>) => ({
    submissionId: 1756,
    firstName: "Kitten",
    emailMasked: "a***@gmail.com",
    arms: { landing: "white", survey: "white", pricing: "A", paywall: null },
    traffic: { bucket: "Paid", source: "google", medium: "cpc", campaign: null },
    device: "Desktop",
    countryTier: "tier_2",
    timings: {
      durationMs: 720_000,
      startedAt: "2026-08-24T18:27:00.000Z",
      completedAt: "2026-08-24T18:39:00.000Z",
      msToPurchase: null,
      msCheckoutHesitation: null,
    },
    milestones: { ...milestones, ...over },
    money: null,
    quoteCount: 1,
  });

  it("does nothing when the bot is not configured", async () => {
    unconfigureBot();
    await refreshJourneyMessage(1756, "report_opened");
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("does nothing for a submission with no stored message", async () => {
    mockSupabaseFetch.mockResolvedValue(json([]));
    await refreshJourneyMessage(1756, "report_opened");
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it("edits the SAME message and advances the stored state", async () => {
    mockSupabaseFetch.mockResolvedValueOnce(storedRow("completed"));
    mockBuildSubmissionJourney.mockResolvedValue(journeyAt({ reportViewedAt: "x" }));
    mockFetchWithTimeout.mockResolvedValue(json({ ok: true, ts: "1724537.001" }));
    mockSupabaseFetch.mockResolvedValue(json([], true, 204));

    await refreshJourneyMessage(1756, "report_opened");

    const [url, init] = mockFetchWithTimeout.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("https://slack.com/api/chat.update");
    const body = JSON.parse(init.body) as Record<string, unknown>;
    // Same ts = an edit, not a second message.
    expect(body.ts).toBe("1724537.001");
    expect(body.channel).toBe("C0REAL");
    // The stored question count is carried through, not reset to zero.
    expect(JSON.stringify(body.blocks)).toContain("59 questions");
    // And the state moves forward so the next identical milestone is a no-op.
    const patch = mockSupabaseFetch.mock.calls.at(-1) as [string, { body: string }];
    expect(JSON.parse(patch[1].body).state).toBe("report_opened");
  });

  it("skips the Slack call when the journey has not advanced", async () => {
    // A reader opening the same report twenty times must not spend twenty edits.
    mockSupabaseFetch.mockResolvedValueOnce(storedRow("checkout"));
    mockBuildSubmissionJourney.mockResolvedValue(journeyAt({ reportViewedAt: "x" }));
    await refreshJourneyMessage(1756, "report_opened");
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it("skips when the state is already the furthest one", async () => {
    mockSupabaseFetch.mockResolvedValueOnce(storedRow("paid"));
    mockBuildSubmissionJourney.mockResolvedValue(journeyAt({ purchasedAt: "x" }));
    await refreshJourneyMessage(1756, "report_opened");
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it("advances from a null stored state", async () => {
    mockSupabaseFetch.mockResolvedValueOnce(storedRow(null));
    mockBuildSubmissionJourney.mockResolvedValue(journeyAt({}));
    mockFetchWithTimeout.mockResolvedValue(json({ ok: true }));
    mockSupabaseFetch.mockResolvedValue(json([], true, 204));
    await refreshJourneyMessage(1756, "report_opened");
    expect(mockFetchWithTimeout).toHaveBeenCalled();
  });

  it("does not advance the stored state when the edit failed", async () => {
    mockSupabaseFetch.mockResolvedValueOnce(storedRow("completed"));
    mockBuildSubmissionJourney.mockResolvedValue(journeyAt({ purchasedAt: "x" }));
    mockFetchWithTimeout.mockResolvedValue(json({ ok: false, error: "message_not_found" }));
    await refreshJourneyMessage(1756, "report_opened");
    // Only the initial SELECT — no PATCH, so a later retry can still succeed.
    expect(mockSupabaseFetch).toHaveBeenCalledTimes(1);
  });

  it("never throws when the journey cannot be rebuilt", async () => {
    mockSupabaseFetch.mockResolvedValueOnce(storedRow("completed"));
    mockBuildSubmissionJourney.mockResolvedValue(null);
    await expect(refreshJourneyMessage(1756, "report_opened")).resolves.toBeUndefined();
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it("advances on a report open even with NO analytics consent — the bug that shipped", async () => {
    // Exactly the case that failed in production: the report was opened, so
    // report_session exists, but analytics_event has no report_viewed because the
    // reader declined analytics. Deriving the state from milestones returns
    // "completed", isAdvance says no, and the message never updated. The caller
    // witnessed the open, so its word wins.
    mockSupabaseFetch.mockResolvedValueOnce(storedRow("completed"));
    mockBuildSubmissionJourney.mockResolvedValue(journeyAt({}));
    mockFetchWithTimeout.mockResolvedValue(json({ ok: true }));
    mockSupabaseFetch.mockResolvedValue(json([], true, 204));

    await refreshJourneyMessage(1756, "report_opened");

    expect(mockFetchWithTimeout).toHaveBeenCalled();
    const [, init] = mockFetchWithTimeout.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body) as Record<string, unknown>;
    // ...and the rail must SHOW it, not just record it.
    const rail = JSON.stringify(body.blocks);
    expect(rail).toContain(":large_green_circle: Report opened");
    expect(rail).toContain(":red_circle: Checkout");
    const patch = mockSupabaseFetch.mock.calls.at(-1) as [string, { body: string }];
    expect(JSON.parse(patch[1].body).state).toBe("report_opened");
  });

  it("takes whichever is further along, the data or the caller", async () => {
    // Caller only witnessed the report open, but the row already shows a payment:
    // the payment wins, and the rail fills completely.
    mockSupabaseFetch.mockResolvedValueOnce(storedRow("completed"));
    mockBuildSubmissionJourney.mockResolvedValue(journeyAt({ purchasedAt: "x" }));
    mockFetchWithTimeout.mockResolvedValue(json({ ok: true }));
    mockSupabaseFetch.mockResolvedValue(json([], true, 204));

    await refreshJourneyMessage(1756, "report_opened");

    const patch = mockSupabaseFetch.mock.calls.at(-1) as [string, { body: string }];
    expect(JSON.parse(patch[1].body).state).toBe("paid");
  });

  it("still skips when the witnessed step is behind what is already drawn", async () => {
    mockSupabaseFetch.mockResolvedValueOnce(storedRow("checkout"));
    mockBuildSubmissionJourney.mockResolvedValue(journeyAt({}));
    await refreshJourneyMessage(1756, "report_opened");
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it("never throws when the journey lookup itself explodes", async () => {
    mockSupabaseFetch.mockResolvedValueOnce(storedRow("completed"));
    mockBuildSubmissionJourney.mockRejectedValue(new Error("db down"));
    await expect(refreshJourneyMessage(1756, "report_opened")).resolves.toBeUndefined();
  });
});
