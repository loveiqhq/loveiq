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
  postReactivationOnRead,
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
      // Their last minute of reading before this visit: 1d 2h before it.
      lastReadAt: "2026-11-18T05:12:08.268Z",
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
      "Last read: *1d 2h* before this visit",
      "Report time spent: *4 min*",
      "",
      "Funnel: *€1.99 after the survey*  |  *Free* (€1.99 unlock gifted)",
      "Survey time: *19 min*",
      "Original acquisition: *Google Ads* — performance_max (cross-network)",
      "Landing page design: *Landing Page V4* (Pain Points)",
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
    const at = all.indexOf("Landing page design: *Landing Page V4* (Pain Points)");
    expect(all.slice(at, at + 4)).toEqual([
      "Landing page design: *Landing Page V4* (Pain Points)",
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

  it("says none recorded when they never read a minute before this visit", () => {
    const built = buildReactivationMessage(
      journey({ timings: { ...journey().timings, lastReadAt: null } }),
      { submissionId: 2826, source: "email", via: "gift_unopened", returnedAt: RETURNED_AT }
    );
    expect(lines(built)).toContain("Last read: *none recorded*");
  });

  it("calls an untagged email link an older one: only emails sent before 5 Nov carry one", () => {
    const built = buildReactivationMessage(journey(), {
      submissionId: 2826,
      source: "report",
      via: "email",
      returnedAt: RETURNED_AT,
    });
    expect(lines(built)).toContain(
      "Email: *older email link* (before 5 Nov 2026; opened the report through it)"
    );
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

/** The day's return row, as the post's claim hands it back (Prefer: return=representation). */
const CLAIMED = { returned_at: RETURNED_AT, source: "email", via: "gift_unopened" };

function backend(
  opts: {
    journeyRow?: unknown[];
    reactivations?: unknown[];
    patchOk?: boolean;
    claimed?: unknown[] | (() => unknown[]);
    /** The day's active minutes, as their email is looked up: none unless given. */
    minutes?: unknown[];
    minutesOk?: boolean;
    /** The reader's report sessions that day: one unless given. */
    sessions?: unknown[];
    sessionsOk?: boolean;
    /** The reader asked us to restrict processing (Art. 18). */
    restricted?: boolean;
    restrictedOk?: boolean;
  } = {}
) {
  mockSupabaseFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
    if (path.startsWith("/rest/v1/report_session?"))
      return res(opts.sessions ?? [{ id: "a-session" }], opts.sessionsOk ?? true);
    if (path.startsWith("/rest/v1/survey_submission?"))
      return res(
        [
          {
            app_user: { processing_restricted_at: opts.restricted ? "2026-11-19T07:00:00Z" : null },
          },
        ],
        opts.restrictedOk ?? true
      );
    if (path.startsWith("/rest/v1/slack_journey_message?"))
      return res(opts.journeyRow ?? [JOURNEY_ROW]);
    if (path.startsWith("/rest/v1/analytics_event?")) {
      return res(opts.minutes ?? [], opts.minutesOk ?? true);
    }
    if (path.startsWith("/rest/v1/reader_return?") && init?.method === "PATCH") {
      // The claim: the database's conditional update answers the row it took, or none.
      if (path.includes("reactivation_channel=is.null")) {
        const claimed = typeof opts.claimed === "function" ? opts.claimed() : opts.claimed;
        return res(claimed ?? [CLAIMED]);
      }
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

describe("postReactivationOnRead: a returning reader is posted once they have read for a minute", () => {
  /** The active minute, a minute and a half after the day's return. */
  const AT = new Date("2026-11-19T07:13:38.000Z");
  const DONE_TS = "1795072330.000100";

  type Call = [string, { body: string; headers?: Record<string, string> }];
  const claims = () =>
    calls((p, m) => m === "PATCH" && p.includes("reactivation_channel=is.null")) as Call[];
  const otherPatches = () =>
    calls((p, m) => m === "PATCH" && !p.includes("reactivation_channel=is.null")) as Call[];
  const posted = (n = 0) =>
    mockPost.mock.calls[n]![0] as { channel: string; threadTs?: string; blocks: unknown[] };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SLACK_REACTIVATIONS_CHANNEL_ID = CHANNEL;
    mockConfigured.mockReturnValue(true);
    mockBuild.mockResolvedValue(journey());
    mockPermalink.mockResolvedValue(PERMALINK);
    mockPost.mockResolvedValue({ channel: CHANNEL, ts: DONE_TS });
    backend();
  });

  it("posts nothing without a report session that Berlin day: a minute sent for another id", async () => {
    backend({ sessions: [] });
    await postReactivationOnRead({ submissionId: 2826, at: AT, via: null });
    expect(claims()).toHaveLength(0);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("asks for a session of this reader's report from the Berlin day's start", async () => {
    await postReactivationOnRead({ submissionId: 2826, at: AT, via: null });
    const [session] = calls((p) => p.startsWith("/rest/v1/report_session?"));
    // An inner join: without it the filter matches nobody's report and every session passes.
    expect(String(session![0])).toContain(
      "select=id,personal_report!inner(survey_submission_id)&personal_report.survey_submission_id=eq.2826"
    );
    // The restriction is this reader's own.
    expect(calls((p) => p.startsWith("/rest/v1/survey_submission?id=eq.2826&"))).toHaveLength(1);
    // 19 Nov in Berlin began at 23:00 UTC on the 18th.
    expect(String(session![0])).toContain(
      `started_at=gte.${encodeURIComponent("2026-11-18T23:00:00.000Z")}`
    );
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it("posts nothing when the sessions can't be read, and claims nothing", async () => {
    backend({ sessionsOk: false });
    await postReactivationOnRead({ submissionId: 2826, at: AT, via: null });
    expect(claims()).toHaveLength(0);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("posts nothing for a reader who asked us to restrict processing since the return", async () => {
    backend({ restricted: true });
    await postReactivationOnRead({ submissionId: 2826, at: AT, via: null });
    expect(claims()).toHaveLength(0);
    expect(mockPost).not.toHaveBeenCalled();
    // Unknown counts as restricted.
    vi.clearAllMocks();
    backend({ restrictedOk: false });
    await postReactivationOnRead({ submissionId: 2826, at: AT, via: null });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("claims the day's unposted return, posts it top level, and keeps the ts", async () => {
    await postReactivationOnRead({ submissionId: 2826, at: AT, via: null });

    expect(claims()).toHaveLength(1);
    const [claimPath, claimInit] = claims()[0]!;
    expect(claimPath).toContain("survey_submission_id=eq.2826");
    expect(claimPath).toContain("day=eq.2026-11-19");
    // Never a finished draft: that is a submission, with a message of its own.
    expect(claimPath).toContain("source=neq.draft");
    expect(claimPath).toContain("reactivation_channel=is.null");
    expect(JSON.parse(claimInit.body)).toEqual({ reactivation_channel: CHANNEL });
    expect(claimInit.headers).toMatchObject({ Prefer: "return=representation" });

    // The visit measured from the day's return, as every redraw measures it.
    expect(mockBuild).toHaveBeenCalledWith(2826, { dwellSince: RETURNED_AT });
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(posted().channel).toBe(CHANNEL);
    expect(posted().threadTs).toBeUndefined();
    expect(lines(posted())[0]).toContain(`<${PERMALINK}|#2826>`);

    expect(otherPatches()).toHaveLength(1);
    expect(otherPatches()[0]![0]).toBe(
      "/rest/v1/reader_return?survey_submission_id=eq.2826&day=eq.2026-11-19"
    );
    expect(JSON.parse(otherPatches()[0]![1].body)).toEqual({
      reactivation_channel: CHANNEL,
      reactivation_ts: DONE_TS,
    });
  });

  it("the day is Berlin's: 23:30 UTC is already the next day there", async () => {
    await postReactivationOnRead({
      submissionId: 2826,
      at: new Date("2026-11-23T23:30:00.000Z"),
      via: null,
    });
    expect(claims()[0]![0]).toContain("day=eq.2026-11-24");
  });

  it("posts nothing without an unposted return that day: none, already posted, a draft, or a forged event", async () => {
    backend({ claimed: [] });
    await postReactivationOnRead({ submissionId: 2826, at: AT, via: "initial_gift" });
    // The gates' two reads, then the claim that takes nothing: no other write.
    expect(claims()).toHaveLength(1);
    expect(otherPatches()).toHaveLength(0);
    expect(mockBuild).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("two minutes at once post once: the second claim finds the row taken", async () => {
    let taken = false;
    backend({
      claimed: () => {
        if (taken) return [];
        taken = true;
        return [CLAIMED];
      },
    });
    await Promise.all([
      postReactivationOnRead({ submissionId: 2826, at: AT, via: null }),
      postReactivationOnRead({ submissionId: 2826, at: AT, via: null }),
    ]);
    expect(claims()).toHaveLength(2);
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it("names the email the day's first minute came through, and never writes it onto the day's row: AP reads the row's own way back", async () => {
    backend({
      claimed: [{ returned_at: RETURNED_AT, source: "report", via: null }],
      minutes: [{ metadata: { via: "initial_gift" } }],
    });
    await postReactivationOnRead({ submissionId: 2826, at: AT, via: "initial_gift" });
    const shown = lines(posted());
    expect(shown).toContain("Reactivation source: *Email*");
    expect(shown.find((l) => l.startsWith("Email: "))).toMatch(/\(opened the report through it\)$/);

    const minutes = calls((p) => p.startsWith("/rest/v1/analytics_event?"))[0]?.[0];
    expect(minutes).toContain("survey_submission_id=eq.2826");
    expect(minutes).toContain("event_type=eq.report_active_1min");
    expect(minutes).toContain(`event_time=gte.${encodeURIComponent(RETURNED_AT)}`);
    expect(minutes).toContain("order=event_time.asc&limit=1");
    expect(JSON.parse(otherPatches()[0]![1].body)).toEqual({
      reactivation_channel: CHANNEL,
      reactivation_ts: DONE_TS,
    });
  });

  it("falls back to the minute's own email when the day's minutes cannot be read", async () => {
    backend({
      claimed: [{ returned_at: RETURNED_AT, source: "report", via: null }],
      minutesOk: false,
    });
    await postReactivationOnRead({ submissionId: 2826, at: AT, via: "initial_gift" });
    expect(lines(posted())).toContain("Reactivation source: *Email*");
  });

  it("drops a minute's email that is not utm-shaped", async () => {
    backend({
      claimed: [{ returned_at: RETURNED_AT, source: "report", via: null }],
      minutes: [{ metadata: { via: "x y" } }],
    });
    await postReactivationOnRead({ submissionId: 2826, at: AT, via: null });
    expect(lines(posted())).toContain("Reactivation source: *Report link* (no email)");
  });

  it("keeps the day's own email when it has one", async () => {
    await postReactivationOnRead({ submissionId: 2826, at: AT, via: "initial_gift" });
    expect(lines(posted())).toContain("Email: *Your gift is still unopened* (clicked)");
    expect(JSON.parse(otherPatches()[0]![1].body)).toEqual({
      reactivation_channel: CHANNEL,
      reactivation_ts: DONE_TS,
    });
  });

  it("drops a via that is not utm-shaped", async () => {
    backend({
      claimed: [{ returned_at: RETURNED_AT, source: "report", via: null }],
      minutesOk: false,
    });
    await postReactivationOnRead({ submissionId: 2826, at: AT, via: "x y" });
    expect(lines(posted())).toContain("Reactivation source: *Report link* (no email)");
  });

  it("takes the rail's floor from the reader's #incoming-surveys message", async () => {
    backend({ journeyRow: [{ ...JOURNEY_ROW, state: "checkout" }] });
    await postReactivationOnRead({ submissionId: 2826, at: AT, via: null });
    expect(lines(posted()).at(-1)).toContain(`${GREEN} Checkout`);
  });

  it("posts with the plain id when the reader has no message, or only a catch-up one", async () => {
    backend({ journeyRow: [] });
    await postReactivationOnRead({ submissionId: 1722, at: AT, via: null });
    backend({ journeyRow: [{ ...JOURNEY_ROW, backfilled_at: "2026-08-25T10:00:00Z" }] });
    await postReactivationOnRead({ submissionId: 1722, at: AT, via: null });

    expect(mockPermalink).not.toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledTimes(2);
    for (const [call] of mockPost.mock.calls) {
      expect(lines(call as { blocks: unknown[] })[0]).toContain("submission #1722*");
    }
  });

  it("releases the claim when Slack refuses the post, so a later minute can post", async () => {
    mockPost.mockResolvedValue(null);
    await postReactivationOnRead({ submissionId: 2826, at: AT, via: null });
    expect(otherPatches()).toHaveLength(1);
    expect(otherPatches()[0]![0]).toBe(
      "/rest/v1/reader_return?survey_submission_id=eq.2826&day=eq.2026-11-19&reactivation_ts=is.null"
    );
    expect(JSON.parse(otherPatches()[0]![1].body)).toEqual({ reactivation_channel: null });
  });

  it("releases the claim when Slack throws, too", async () => {
    mockPost.mockRejectedValue(new Error("slack down"));
    await postReactivationOnRead({ submissionId: 2826, at: AT, via: null });
    expect(JSON.parse(otherPatches()[0]![1].body)).toEqual({ reactivation_channel: null });
    expect(mockWarn).toHaveBeenCalled();
  });

  it("releases the claim when the journey cannot be read", async () => {
    mockBuild.mockResolvedValue(null);
    await postReactivationOnRead({ submissionId: 2826, at: AT, via: null });
    expect(mockPost).not.toHaveBeenCalled();
    expect(JSON.parse(otherPatches()[0]![1].body)).toEqual({ reactivation_channel: null });
  });

  it("makes no request without the channel", async () => {
    delete process.env.SLACK_REACTIVATIONS_CHANNEL_ID;
    await postReactivationOnRead({ submissionId: 2826, at: AT, via: null });
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("never throws", async () => {
    mockSupabaseFetch.mockRejectedValue(new Error("boom"));
    await expect(
      postReactivationOnRead({ submissionId: 2826, at: AT, via: null })
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

  it("a redraw names the email the day's first minute came through when the row names none", async () => {
    backend({
      reactivations: [{ ...ROW, source: "report", via: null }],
      minutes: [{ metadata: { via: "initial_gift" } }],
    });
    await refreshReactivationPost(4201);
    const edit = mockUpdate.mock.calls[0]![0] as { blocks: unknown[] };
    expect(lines(edit)).toContain("Reactivation source: *Email*");
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
