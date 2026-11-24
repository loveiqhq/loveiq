import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSupabaseFetch,
  mockBuild,
  mockConfigured,
  mockPost,
  mockUpdate,
  mockPermalink,
  mockRateLimit,
  mockWarn,
} = vi.hoisted(() => ({
  mockSupabaseFetch: vi.fn(),
  mockBuild: vi.fn(),
  mockConfigured: vi.fn(),
  mockPost: vi.fn(),
  mockUpdate: vi.fn(),
  mockPermalink: vi.fn(),
  mockRateLimit: vi.fn(),
  mockWarn: vi.fn(),
}));

vi.mock("@shared/observability/logger", () => ({
  default: { warn: mockWarn, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));
// The journey's rows are its own tests' business: here it is the input.
vi.mock("@features/attribution/server/journey", async (importActual) => ({
  ...(await importActual<typeof import("@features/attribution/server/journey")>()),
  buildSubmissionJourney: (...args: unknown[]) => mockBuild(...args),
}));
// Never Slack from a test.
vi.mock("@shared/observability/slack-bot", () => ({
  isSlackBotConfigured: () => mockConfigured(),
  postJourneyMessage: (...args: unknown[]) => mockPost(...args),
  updateJourneyMessage: (...args: unknown[]) => mockUpdate(...args),
  getMessagePermalink: (...args: unknown[]) => mockPermalink(...args),
}));
vi.mock("@shared/http/ratelimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

import type { SubmissionJourney } from "@features/attribution/server/journey";
import {
  buildReactivationMessage,
  emailTitleOf,
  formatSince,
  postReactivation,
  reactivationsChannel,
  refreshReactivationPost,
  REDRAW_WINDOW_MS,
} from "@features/attribution/server/reactivation-post";

const GREEN = ":large_green_circle:";
const RED = ":red_circle:";
const CHANNEL = "C0REACTIVATIONS";
const PERMALINK = "https://example.slack.com/archives/C0JOURNEY/p1794893911183509";

/**
 * #2826 as production had it on 19 Nov: finished 17 Nov 06:38 Berlin, the gift unlocked, back
 * through the "gift unopened" email on 19 Nov at 08:12.
 */
function journey(overrides: Partial<SubmissionJourney> = {}): SubmissionJourney {
  return {
    submissionId: 2826,
    firstName: "B",
    emailMasked: "b***@gmail.com",
    internal: false,
    arms: { landing: "pain_point", survey: "white", pricing: null, paywall: null },
    traffic: {
      bucket: "Paid",
      source: "google",
      medium: "cpc",
      campaign: "performance_max",
      isGoogleAds: true,
      keyword: null,
      matchType: null,
      network: "x",
    },
    device: "iOS",
    country: "New Zealand",
    countryTier: "tier_1",
    timings: {
      durationMs: 19 * 60_000,
      startedAt: "2026-11-17T05:19:00.000Z",
      completedAt: "2026-11-17T05:38:31.000Z",
      msToPurchase: null,
      msCheckoutHesitation: null,
      reportDwellMs: 19 * 60_000,
      dwellSinceMs: 4 * 60_000,
    },
    milestones: {
      reportViewedAt: "2026-11-17T05:40:00.000Z",
      paywallInitiatedAt: "2026-11-17T05:41:00.000Z",
      checkoutStartedAt: null,
      purchasedAt: null,
    },
    money: null,
    noMoneyTaken: false,
    quoteCount: 1,
    recordingSessionId: null,
    gateCohort: true,
    paid: [],
    freeUnlocks: ["gift"],
    ...overrides,
  };
}

const RETURNED_AT = "2026-11-19T07:12:08.268Z";
const lines = (built: { blocks: unknown[] }) =>
  ((built.blocks[0] as { text: { text: string } }).text.text ?? "").split("\n");

function res(body: unknown, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: async () => body } as unknown as Response;
}

const ORIGINAL = process.env.SLACK_REACTIVATIONS_CHANNEL_ID;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SLACK_REACTIVATIONS_CHANNEL_ID;
  else process.env.SLACK_REACTIVATIONS_CHANNEL_ID = ORIGINAL;
});

describe("buildReactivationMessage: Marcus's layout, real values", () => {
  it("renders a click in an email, line for line", () => {
    const built = buildReactivationMessage(
      journey(),
      { submissionId: 2826, source: "email", via: "gift_unopened", returnedAt: RETURNED_AT },
      { journeyLink: PERMALINK }
    );
    expect(lines(built)).toEqual([
      `*Report reactivation of survey submission <${PERMALINK}|#2826>* \`b***@gmail.com\``,
      "Reactivation source: *Email*",
      // AP › Emails' name for the stage, the row Marcus reads there.
      "Email: *Your gift is still unopened* (clicked)",
      "Time to reactivation: *2d 1h* (since survey submission)",
      "Report time spent: *4 min*",
      "",
      "Funnel: *€1.99 after the survey*  |  *Free* (€1.99 unlock gifted)",
      "Survey time: *19 min*",
      "Original acquisition: *Google Ads* — performance_max (cross-network)",
      // #2826 came through B, the pain-point page as released, paused on 24 Nov 2026.
      "Landing page design: *Landing Page V4* (Pain Points) _(retired arm)_",
      "Country (self-reported): *New Zealand*",
      "",
      `${GREEN} Survey done  →  ${GREEN} Report opened  →  ${GREEN} Paywall hit  →  ${RED} Checkout  →  ${RED} Paid`,
    ]);
    // The notification text: no address, the id first.
    expect(built.text).toBe(
      "Report reactivation of survey submission #2826: email, 2d 1h after the survey"
    );
  });

  // Sync, 23 Nov: the post named only the landing page, so a reader in the EUR 1.99 page's new
  // half who got the E07 gift came back with neither on show.
  it("names every experiment the reader was in, as the survey's message does", () => {
    const built = buildReactivationMessage(
      journey({ gateRevealArm: "reveal", giftArm: "gift" }),
      { submissionId: 2826, source: "email", via: "gift_unopened", returnedAt: RETURNED_AT },
      { journeyLink: PERMALINK }
    );
    const all = lines(built);
    const at = all.indexOf("Landing page design: *Landing Page V4* (Pain Points) _(retired arm)_");
    expect(all.slice(at, at + 4)).toEqual([
      "Landing page design: *Landing Page V4* (Pain Points) _(retired arm)_",
      "€1.99 page: *Core Archetype shown* (new page)",
      "Gift email (E07): *Gifted* (Core Archetype free on day 1)",
      "Country (self-reported): *New Zealand*",
    ]);
  });

  it("names the email a report link came through, by AP's name first", () => {
    const built = buildReactivationMessage(journey(), {
      submissionId: 2813,
      source: "report",
      via: "initial_gift",
      returnedAt: RETURNED_AT,
    });
    expect(lines(built).slice(1, 3)).toEqual([
      "Reactivation source: *Email*",
      "Email: *Your Core Archetype, unlocked as a gift* (opened the report through it)",
    ]);
  });

  it("says Report link, and no email line, when no email brought them", () => {
    const built = buildReactivationMessage(journey(), {
      submissionId: 2793,
      source: "report",
      via: null,
      returnedAt: RETURNED_AT,
    });
    expect(lines(built)[1]).toBe("Reactivation source: *Report link* (no email)");
    expect(lines(built)[2]).toMatch(/^Time to reactivation:/);
    expect(built.text).toContain(": report link, ");
  });

  it("names the unlock-feedback email for an answer", () => {
    const built = buildReactivationMessage(journey(), {
      submissionId: 2826,
      source: "answer",
      via: "unlock_feedback",
      returnedAt: RETURNED_AT,
    });
    expect(lines(built)[2]).toBe("Email: *Why didn’t you unlock?* (answered its question)");
  });

  it("falls back to the survey message's name, then to 'email link'", () => {
    expect(emailTitleOf("receipt")).toBe("receipt email");
    expect(emailTitleOf("email")).toBe("email link");
    expect(emailTitleOf("nope")).toBe("email link");
  });

  it("prints the plain id without a permalink, or with one that could break the link", () => {
    const r = { submissionId: 1722, source: "report" as const, via: null, returnedAt: RETURNED_AT };
    expect(lines(buildReactivationMessage(journey(), r))[0]).toBe(
      "*Report reactivation of survey submission #1722* `b***@gmail.com`"
    );
    expect(
      lines(buildReactivationMessage(journey(), r, { journeyLink: "https://x|evil>" }))[0]
    ).toContain("submission #1722*");
  });

  it("measures the visit, not the reader's lifetime: an em dash until it can", () => {
    const built = buildReactivationMessage(
      journey({ timings: { ...journey().timings, dwellSinceMs: null } }),
      { submissionId: 2826, source: "email", via: "gift_unopened", returnedAt: RETURNED_AT }
    );
    expect(lines(built)).toContain("Report time spent: *—*");
  });

  it("keeps the rail's floor: a step the server saw stays green", () => {
    const built = buildReactivationMessage(
      journey(),
      { submissionId: 2826, source: "email", via: "gift_unopened", returnedAt: RETURNED_AT },
      { floor: "checkout" }
    );
    expect(lines(built).at(-1)).toContain(`${GREEN} Checkout`);
    expect(lines(built).at(-1)).toContain(`${RED} Paid`);
  });

  it("omits the country when the reader gave none", () => {
    const built = buildReactivationMessage(journey({ country: null }), {
      submissionId: 2826,
      source: "email",
      via: "gift_unopened",
      returnedAt: RETURNED_AT,
    });
    expect(lines(built).some((l) => l.startsWith("Country"))).toBe(false);
  });
});

describe("formatSince", () => {
  it("reads days and hours from a day up, as Marcus wrote it", () => {
    expect(formatSince(2 * 86_400_000 + 3_600_000 + 34 * 60_000)).toBe("2d 1h");
    expect(formatSince(86_400_000)).toBe("1d 0h");
  });
  it("reads the survey message's durations below a day", () => {
    expect(formatSince(45 * 60_000)).toBe("45 min");
    expect(formatSince(5 * 3_600_000 + 12 * 60_000)).toBe("5h 12m");
  });
  it("is an em dash when unknown", () => {
    expect(formatSince(null)).toBe("—");
    expect(formatSince(-1)).toBe("—");
  });
});

describe("reactivationsChannel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is off without the channel, without asking the bot", () => {
    delete process.env.SLACK_REACTIVATIONS_CHANNEL_ID;
    expect(reactivationsChannel()).toBeNull();
    expect(mockConfigured).not.toHaveBeenCalled();
  });

  it("needs the journey bot too", () => {
    process.env.SLACK_REACTIVATIONS_CHANNEL_ID = CHANNEL;
    mockConfigured.mockReturnValue(false);
    expect(reactivationsChannel()).toBeNull();
    mockConfigured.mockReturnValue(true);
    expect(reactivationsChannel()).toBe(CHANNEL);
  });
});

const JOURNEY_ROW = {
  channel: "C0JOURNEY",
  message_ts: "1794893911.183509",
  state: "paywall",
  backfilled_at: null,
};

function backend(
  opts: { journeyRow?: unknown[]; reactivations?: unknown[]; patchOk?: boolean } = {}
) {
  mockSupabaseFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
    if (path.startsWith("/rest/v1/slack_journey_message?"))
      return res(opts.journeyRow ?? [JOURNEY_ROW]);
    if (path.startsWith("/rest/v1/reader_return?") && init?.method === "PATCH") {
      return res(null, opts.patchOk ?? true);
    }
    if (path.startsWith("/rest/v1/reader_return?")) return res(opts.reactivations ?? []);
    throw new Error(`unexpected ${path}`);
  });
}

const calls = (match: (path: string, method?: string) => boolean) =>
  mockSupabaseFetch.mock.calls.filter(([p, init]) =>
    match(String(p), (init as { method?: string } | undefined)?.method)
  );

describe("postReactivation", () => {
  const AT = new Date(RETURNED_AT);

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SLACK_REACTIVATIONS_CHANNEL_ID = CHANNEL;
    mockConfigured.mockReturnValue(true);
    mockBuild.mockResolvedValue(journey());
    mockPermalink.mockResolvedValue(PERMALINK);
    mockPost.mockResolvedValue({ channel: CHANNEL, ts: "1795072330.000100" });
    backend();
  });

  it("posts into the channel, top level, and keeps the post's channel and ts on the day's row", async () => {
    await postReactivation({
      submissionId: 2826,
      source: "email",
      via: "gift_unopened",
      at: AT,
      day: "2026-11-19",
    });

    // The journey, with the visit's time measured from the return.
    expect(mockBuild).toHaveBeenCalledWith(2826, { dwellSince: RETURNED_AT });
    expect(mockPermalink).toHaveBeenCalledWith("C0JOURNEY", "1794893911.183509");
    expect(mockPost).toHaveBeenCalledTimes(1);
    const posted = mockPost.mock.calls[0]![0] as {
      channel: string;
      threadTs?: string;
      blocks: unknown[];
    };
    expect(posted.channel).toBe(CHANNEL);
    expect(posted.threadTs).toBeUndefined();
    expect(lines(posted)[0]).toContain(`<${PERMALINK}|#2826>`);

    const patch = calls((p, m) => p.startsWith("/rest/v1/reader_return?") && m === "PATCH");
    expect(patch).toHaveLength(1);
    expect(patch[0]![0]).toBe(
      "/rest/v1/reader_return?survey_submission_id=eq.2826&day=eq.2026-11-19"
    );
    expect(JSON.parse((patch[0]![1] as { body: string }).body)).toEqual({
      reactivation_channel: CHANNEL,
      reactivation_ts: "1795072330.000100",
    });
  });

  it("takes the rail's floor from the reader's #incoming-surveys message", async () => {
    backend({ journeyRow: [{ ...JOURNEY_ROW, state: "checkout" }] });
    await postReactivation({
      submissionId: 2826,
      source: "email",
      via: "gift_unopened",
      at: AT,
      day: "2026-11-19",
    });
    expect(lines(mockPost.mock.calls[0]![0] as { blocks: unknown[] }).at(-1)).toContain(
      `${GREEN} Checkout`
    );
  });

  it("posts with the plain id when the reader has no message, or only a catch-up one", async () => {
    backend({ journeyRow: [] });
    await postReactivation({
      submissionId: 1722,
      source: "report",
      via: null,
      at: AT,
      day: "2026-11-19",
    });
    backend({ journeyRow: [{ ...JOURNEY_ROW, backfilled_at: "2026-08-25T10:00:00Z" }] });
    await postReactivation({
      submissionId: 1722,
      source: "report",
      via: null,
      at: AT,
      day: "2026-11-19",
    });

    expect(mockPermalink).not.toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledTimes(2);
    for (const [call] of mockPost.mock.calls) {
      expect(lines(call as { blocks: unknown[] })[0]).toContain("submission #1722*");
    }
  });

  it("never posts a finished draft: it is a submission, not a reactivation", async () => {
    await postReactivation({
      submissionId: 2844,
      source: "draft",
      via: null,
      at: AT,
      day: "2026-11-18",
    });
    expect(mockBuild).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("does nothing at all without the channel", async () => {
    delete process.env.SLACK_REACTIVATIONS_CHANNEL_ID;
    await postReactivation({
      submissionId: 2826,
      source: "email",
      via: "gift_unopened",
      at: AT,
      day: "2026-11-19",
    });
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
    expect(mockBuild).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("stores nothing when Slack refuses the post", async () => {
    mockPost.mockResolvedValue(null);
    await postReactivation({
      submissionId: 2826,
      source: "email",
      via: "gift_unopened",
      at: AT,
      day: "2026-11-19",
    });
    expect(calls((_, m) => m === "PATCH")).toHaveLength(0);
  });

  it("posts nothing when the journey cannot be read", async () => {
    mockBuild.mockResolvedValue(null);
    await postReactivation({
      submissionId: 2826,
      source: "email",
      via: "gift_unopened",
      at: AT,
      day: "2026-11-19",
    });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("never throws", async () => {
    mockBuild.mockRejectedValue(new Error("boom"));
    await expect(
      postReactivation({
        submissionId: 2826,
        source: "email",
        via: "gift_unopened",
        at: AT,
        day: "2026-11-19",
      })
    ).resolves.toBeUndefined();
    expect(mockWarn).toHaveBeenCalled();
  });
});

describe("refreshReactivationPost", () => {
  const ROW = {
    returned_at: RETURNED_AT,
    source: "email",
    via: "gift_unopened",
    reactivation_channel: CHANNEL,
    reactivation_ts: "1795072330.000100",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SLACK_REACTIVATIONS_CHANNEL_ID = CHANNEL;
    mockConfigured.mockReturnValue(true);
    mockBuild.mockResolvedValue(journey({ submissionId: 4201 }));
    mockPermalink.mockResolvedValue(null);
    mockRateLimit.mockResolvedValue({ allowed: true });
    mockUpdate.mockResolvedValue(true);
    backend({ reactivations: [ROW] });
  });

  it("asks only for a post under a day old, newest first", async () => {
    const now = Date.parse("2026-11-19T12:00:00.000Z");
    vi.useFakeTimers({ now, toFake: ["Date"] });
    try {
      await refreshReactivationPost(4201);
    } finally {
      vi.useRealTimers();
    }
    const read = calls((p, m) => p.startsWith("/rest/v1/reader_return?") && m !== "PATCH")[0]![0];
    expect(read).toContain("survey_submission_id=eq.4201");
    expect(read).toContain("reactivation_ts=not.is.null");
    expect(read).toContain(
      `returned_at=gte.${encodeURIComponent(new Date(now - REDRAW_WINDOW_MS).toISOString())}`
    );
    expect(read).toContain("order=returned_at.desc&limit=1");
  });

  it("redraws the stored post in place, the time measured from its return", async () => {
    await refreshReactivationPost(4201);
    expect(mockBuild).toHaveBeenCalledWith(4201, { dwellSince: RETURNED_AT });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const edit = mockUpdate.mock.calls[0]![0] as { channel: string; ts: string; blocks: unknown[] };
    expect(edit.channel).toBe(CHANNEL);
    expect(edit.ts).toBe("1795072330.000100");
    expect(lines(edit)).toContain("Report time spent: *4 min*");
  });

  it("does nothing without a post under a day old", async () => {
    backend({ reactivations: [] });
    await refreshReactivationPost(4201);
    expect(mockBuild).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("makes no request at all without the channel", async () => {
    delete process.env.SLACK_REACTIVATIONS_CHANNEL_ID;
    await refreshReactivationPost(4201, "paid");
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
  });

  it("redraws a report reload at most once a minute", async () => {
    mockRateLimit.mockResolvedValue({ allowed: false });
    await refreshReactivationPost(4201, "report_opened");
    expect(mockRateLimit).toHaveBeenCalledWith("4201:report_opened", {
      bucket: "reactivation-redraw",
      limit: 1,
      windowMs: 60_000,
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("redraws a repeated paywall or checkout at most once a minute too, each in its own slot", async () => {
    // Every page load pings the paywall and every Unlock click starts a checkout: unbounded,
    // they would spend the bot's chat.update budget, which #incoming-surveys shares.
    mockRateLimit.mockResolvedValue({ allowed: false });
    await refreshReactivationPost(4201, "paywall");
    await refreshReactivationPost(4201, "checkout");
    expect(mockRateLimit.mock.calls.map(([key]) => key)).toEqual(["4201:paywall", "4201:checkout"]);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("never drops a time update: its callers dedupe it, and the close is the last one", async () => {
    mockRateLimit.mockResolvedValue({ allowed: false });
    await refreshReactivationPost(4201);
    expect(mockRateLimit).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("always redraws a payment, and keeps it green", async () => {
    mockRateLimit.mockResolvedValue({ allowed: false });
    await refreshReactivationPost(4201, "paid");
    expect(mockRateLimit).not.toHaveBeenCalled();
    const edit = mockUpdate.mock.calls[0]![0] as { blocks: unknown[] };
    expect(lines(edit).at(-1)).toContain(`${GREEN} Paid`);
  });

  it("never redraws a draft's row", async () => {
    backend({ reactivations: [{ ...ROW, source: "draft" }] });
    await refreshReactivationPost(4201, "paid");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("never throws", async () => {
    mockSupabaseFetch.mockRejectedValue(new Error("down"));
    await expect(refreshReactivationPost(4201, "paid")).resolves.toBeUndefined();
  });
});
