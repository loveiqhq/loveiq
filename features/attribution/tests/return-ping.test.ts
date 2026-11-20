import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSupabaseFetch, mockPost, mockConfigured, mockWarn, mockReactivation } = vi.hoisted(
  () => ({
    mockSupabaseFetch: vi.fn(),
    mockPost: vi.fn(),
    mockConfigured: vi.fn(),
    mockWarn: vi.fn(),
    mockReactivation: vi.fn(),
  })
);

vi.mock("@shared/observability/logger", () => ({
  default: { warn: mockWarn, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@features/admin/server/supabase", () => ({
  supabaseFetch: (...args: unknown[]) => mockSupabaseFetch(...args),
}));
// Never Slack from a test: the bot's two calls this module makes, mocked.
vi.mock("@shared/observability/slack-bot", () => ({
  isSlackBotConfigured: () => mockConfigured(),
  postJourneyMessage: (...args: unknown[]) => mockPost(...args),
}));
// The #report-reactivations post has its own tests (reactivation-post.test.ts); here, only
// that every claimed day is handed to it.
vi.mock("@features/attribution/server/reactivation-post", () => ({
  postReactivation: (...args: unknown[]) => mockReactivation(...args),
}));

import {
  EMAIL_LINK,
  buildReturnReply,
  emailLinkOf,
  emailNameOf,
  isCrawler,
  isReturn,
  noteReaderReturn,
  readerOf,
  type ReturnReader,
} from "@features/attribution/server/return-ping";

/** Finished Sat 14 Nov 2026, 09:51 Berlin (08:51 UTC), begun 20 minutes before. */
const READER: ReturnReader = {
  finishedAt: "2026-11-14T08:51:00.000Z",
  startedAt: "2026-11-14T08:31:00.000Z",
  internal: false,
  emailMasked: "j***@gmail.com",
};
const MINUTE = 60_000;
const after = (iso: string, ms: number) => new Date(Date.parse(iso) + ms);

function res(body: unknown, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe("isReturn: what counts as coming back", () => {
  it("a report visit counts on a later Berlin day, not on the day of the survey", () => {
    const sameDay = after(READER.finishedAt!, 10 * 60 * MINUTE); // 19:51 Berlin, same day
    const nextDay = new Date("2026-11-15T07:00:00.000Z");
    expect(isReturn({ source: "report", at: sameDay }, READER)).toBe(false);
    expect(isReturn({ source: "report", at: nextDay }, READER)).toBe(true);
  });

  it("days are Berlin's: 23:30 UTC on the survey's UTC day is already the next day there", () => {
    // 14 Nov 23:30 UTC is 15 Nov 00:30 in Berlin: a later day, and over half an hour on.
    expect(isReturn({ source: "report", at: new Date("2026-11-14T23:30:00.000Z") }, READER)).toBe(
      true
    );
  });

  it("a sitting that runs on past midnight is still the first visit, until 3 hours on", () => {
    const lateFinish = { ...READER, finishedAt: "2026-11-14T22:20:00.000Z" }; // 23:20 Berlin
    // 00:05 Berlin, 45 minutes on: a reload, a checkout return, an archetype switch.
    expect(
      isReturn({ source: "report", at: new Date("2026-11-14T23:05:00.000Z") }, lateFinish)
    ).toBe(false);
    // 02:19 and 02:21 Berlin: either side of three hours.
    expect(
      isReturn({ source: "report", at: new Date("2026-11-15T01:19:00.000Z") }, lateFinish)
    ).toBe(false);
    expect(
      isReturn({ source: "report", at: new Date("2026-11-15T01:21:00.000Z") }, lateFinish)
    ).toBe(true);
  });

  it("a report opened just past midnight, minutes after the survey, is still the first visit", () => {
    const lateFinish = { ...READER, finishedAt: "2026-11-14T22:55:00.000Z" }; // 23:55 Berlin
    const justAfter = new Date("2026-11-14T23:10:00.000Z"); // 00:10 Berlin, 15 minutes on
    expect(isReturn({ source: "report", at: justAfter }, lateFinish)).toBe(false);
  });

  it("an email click counts the same day, but not during the first visit", () => {
    const duringVisit = after(READER.finishedAt!, 2 * MINUTE); // the report-ready email, at once
    const evening = after(READER.finishedAt!, 8 * 60 * MINUTE);
    expect(isReturn({ source: "email", at: duringVisit }, READER)).toBe(false);
    expect(isReturn({ source: "email", at: evening }, READER)).toBe(true);
  });

  it("a click seconds after its email was sent is a link scanner", () => {
    const at = new Date("2026-11-15T09:47:05.000Z");
    expect(isReturn({ source: "email", at, sentAt: "2026-11-15T09:47:00.000Z" }, READER)).toBe(
      false
    );
    expect(isReturn({ source: "email", at, sentAt: "2026-11-15T09:40:00.000Z" }, READER)).toBe(
      true
    );
    // No send time known: the click counts.
    expect(isReturn({ source: "email", at, sentAt: null }, READER)).toBe(true);
  });

  it("an answer to the unlock question counts once the first visit is over", () => {
    expect(
      isReturn({ source: "answer", at: after(READER.finishedAt!, 4 * 60 * MINUTE) }, READER)
    ).toBe(true);
    expect(isReturn({ source: "answer", at: after(READER.finishedAt!, MINUTE) }, READER)).toBe(
      false
    );
  });

  it("a draft counts when the survey was finished on a later Berlin day than it was begun", () => {
    const begunEarlier = { ...READER, startedAt: "2026-11-12T18:00:00.000Z" };
    expect(isReturn({ source: "draft", at: new Date(READER.finishedAt!) }, begunEarlier)).toBe(
      true
    );
    // Begun 20 minutes before, the same day: one sitting.
    expect(isReturn({ source: "draft", at: new Date(READER.finishedAt!) }, READER)).toBe(false);
    // Begun at 23:50 and finished at 00:10: past midnight, but one sitting.
    const overMidnight = {
      ...READER,
      startedAt: "2026-11-14T22:50:00.000Z",
      finishedAt: "2026-11-14T23:10:00.000Z",
    };
    expect(isReturn({ source: "draft", at: new Date(overMidnight.finishedAt) }, overMidnight)).toBe(
      false
    );
    // #2625 on 24 Oct: begun 23:18, finished 00:11, its longest pause 10 minutes. One sitting.
    const longSitting = {
      ...READER,
      startedAt: "2026-10-24T21:18:00.000Z",
      finishedAt: "2026-10-24T22:11:00.000Z",
    };
    expect(isReturn({ source: "draft", at: new Date(longSitting.finishedAt) }, longSitting)).toBe(
      false
    );
    // #2440 on 7 Oct: begun 22:09, back after a 128-minute pause, finished 01:27. A return.
    const resumed = {
      ...READER,
      startedAt: "2026-10-07T20:09:00.000Z",
      finishedAt: "2026-10-07T23:27:00.000Z",
    };
    expect(isReturn({ source: "draft", at: new Date(resumed.finishedAt) }, resumed)).toBe(true);
  });

  it("a crawler's click is no return: link-scanning sandboxes run headless browsers", () => {
    const at = after(READER.finishedAt!, 26 * 60 * MINUTE);
    const click = (userAgent: string | null) =>
      isReturn({ source: "email", at, sentAt: null, userAgent }, READER);
    expect(click("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 HeadlessChrome/131.0")).toBe(
      false
    );
    expect(click("python-requests/2.32")).toBe(false);
    expect(
      click("Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15")
    ).toBe(true);
    expect(click(null)).toBe(true);
  });

  it("the team's own surveys never count, whatever the way back", () => {
    const team = { ...READER, internal: true };
    const later = new Date("2026-11-16T10:00:00.000Z");
    for (const source of ["report", "email", "answer"] as const) {
      expect(isReturn({ source, at: later }, team), source).toBe(false);
    }
    expect(
      isReturn({ source: "draft", at: later }, { ...team, startedAt: "2026-11-10T10:00:00.000Z" })
    ).toBe(false);
  });

  it("counts nothing without a finish to measure from", () => {
    const at = new Date("2026-11-16T10:00:00.000Z");
    expect(isReturn({ source: "report", at }, { ...READER, finishedAt: null })).toBe(false);
    expect(isReturn({ source: "draft", at }, { ...READER, startedAt: null })).toBe(false);
  });
});

describe("isCrawler: what AP-Analytics and the visit counter leave out", () => {
  it("knows crawlers, link previewers, headless browsers and plain HTTP clients", () => {
    for (const ua of [
      "AdsBot-Google (+http://www.google.com/adsbot.html)",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "WhatsApp/2.23.20.0",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0",
      "curl/8.4.0",
      "python-requests/2.31.0",
      "okhttp/4.12.0",
      "node-fetch/1.0",
    ]) {
      expect(isCrawler(ua), ua).toBe(true);
    }
  });

  it("lets a person's browser through, and a request with none", () => {
    expect(
      isCrawler(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15"
      )
    ).toBe(false);
    expect(isCrawler(null)).toBe(false);
  });
});

describe("readerOf", () => {
  it("masks the address as the message does and marks the team's own", () => {
    expect(readerOf({ finishedAt: "x", email: "jane.doe@gmail.com" })).toEqual({
      finishedAt: "x",
      startedAt: null,
      internal: false,
      emailMasked: "j***@gmail.com",
    });
    expect(readerOf({ finishedAt: "x", email: "eman@loveiq.org" }).internal).toBe(true);
    expect(readerOf({ finishedAt: "x", email: null }).emailMasked).toBeNull();
  });
});

describe("emailLinkOf: the email a report link came through", () => {
  const page = "https://www.loveiq.org/report/rpt_abcdefghijklmnopqrst";

  it("names the campaign of one of our tagged links", () => {
    expect(
      emailLinkOf(`${page}?utm_source=email&utm_medium=nurture&utm_campaign=initial_gift`)
    ).toBe("initial_gift");
  });

  it("knows an untagged email link (from=email) as an email link", () => {
    expect(emailLinkOf(`${page}?from=email`)).toBe(EMAIL_LINK);
    // A campaign that is not utm-shaped is not trusted: an email link all the same.
    expect(emailLinkOf(`${page}?utm_source=email&utm_campaign=%3Cb%3E`)).toBe(EMAIL_LINK);
  });

  it("is null for any other link, or none", () => {
    expect(emailLinkOf(`${page}?utm_source=google&utm_campaign=x`)).toBeNull();
    expect(emailLinkOf(page)).toBeNull();
    expect(emailLinkOf(null)).toBeNull();
    expect(emailLinkOf("not a url")).toBeNull();
  });
});

describe("emailNameOf", () => {
  it("uses the message's own name for an email, else AP's, else 'email link'", () => {
    expect(emailNameOf("initial_gift")).toBe("gift email (E07)");
    expect(emailNameOf("72h_no_unlock")).toBe("72h email");
    // A receipt's stage is not a link campaign: AP › Emails names it.
    expect(emailNameOf("receipt_initial")).toBe("Purchase · Core Archetype (€1.99)");
    expect(emailNameOf(EMAIL_LINK)).toBe("email link");
    expect(emailNameOf("made_up")).toBe("email link");
  });
});

describe("buildReturnReply", () => {
  const at = new Date("2026-11-16T03:24:00.000Z"); // Mon 16 Nov, 04:24 Berlin

  it("says when and which email, with the masked address in a code span", () => {
    const { text, blocks } = buildReturnReply(
      { submissionId: 2790, source: "email", at, via: "initial_gift" },
      READER
    );
    const line = (blocks[0] as { text: { text: string } }).text.text;
    expect(line).toBe(
      ":leftwards_arrow_with_hook: *Came back* Mon 16 Nov, 04:24: clicked the *gift email (E07)*  ·  #2790 `j***@gmail.com`"
    );
    // The notification text carries no address at all.
    expect(text).toBe("Survey submission #2790 came back Mon 16 Nov, 04:24");
  });

  it("words each way back", () => {
    const line = (source: "report" | "answer" | "draft", via: string | null, reader = READER) =>
      (
        buildReturnReply({ submissionId: 1, source, at, via }, reader).blocks[0] as {
          text: { text: string };
        }
      ).text.text;
    expect(line("report", "72h_no_unlock")).toContain(
      "opened their report through the *72h email*"
    );
    expect(line("report", EMAIL_LINK)).toContain("opened their report through the *email link*");
    expect(line("report", null)).toContain(": opened their report  ·");
    expect(line("answer", "unlock_feedback")).toContain(
      "answered the question in the *unlock feedback email*"
    );
    expect(line("draft", null, { ...READER, startedAt: "2026-11-10T08:00:00.000Z" })).toContain(
      "finished the survey they began on Tue 10 Nov"
    );
  });

  it("leaves the address out when there is none", () => {
    const line = (
      buildReturnReply(
        { submissionId: 7, source: "report", at, via: null },
        { ...READER, emailMasked: null }
      ).blocks[0] as { text: { text: string } }
    ).text.text;
    expect(line.endsWith("·  #7")).toBe(true);
  });
});

describe("noteReaderReturn: claim the day, then reply in the thread", () => {
  const NEXT_DAY = new Date("2026-11-15T07:00:00.000Z");
  const MESSAGE = { channel: "C0JOURNEY", message_ts: "1731570000.000100" };

  /** The backend: the claim answers `claimed` rows, the message lookup `message`. */
  function backend(
    opts: {
      claimed?: unknown[];
      claimOk?: boolean;
      message?: (typeof MESSAGE & { backfilled_at?: string }) | null;
      submission?: unknown[];
    } = {}
  ) {
    mockSupabaseFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path === "/rest/v1/reader_return" && init?.method === "POST") {
        return res(opts.claimed ?? [{ survey_submission_id: 2790 }], opts.claimOk ?? true);
      }
      if (path.startsWith("/rest/v1/reader_return?") && init?.method === "PATCH") return res(null);
      if (path.startsWith("/rest/v1/slack_journey_message?")) {
        return res(opts.message === null ? [] : [opts.message ?? MESSAGE]);
      }
      if (path.startsWith("/rest/v1/survey_submission?")) return res(opts.submission ?? []);
      throw new Error(`unexpected ${path}`);
    });
  }
  const calls = (match: (path: string, method?: string) => boolean) =>
    mockSupabaseFetch.mock.calls.filter(([p, init]) =>
      match(String(p), (init as { method?: string } | undefined)?.method)
    );
  const claims = () => calls((p, m) => p === "/rest/v1/reader_return" && m === "POST");

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigured.mockReturnValue(true);
    mockPost.mockResolvedValue({ channel: MESSAGE.channel, ts: "1731650000.000200" });
    backend();
  });

  it("leaves out a reader who asked us to restrict processing: no claim, no reply, no post", async () => {
    backend({
      submission: [{ app_user: { processing_restricted_at: "2026-11-01T10:00:00.000Z" } }],
    });
    await noteReaderReturn({ submissionId: 2790, source: "report", at: NEXT_DAY, reader: READER });
    expect(claims()).toHaveLength(0);
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockReactivation).not.toHaveBeenCalled();
  });

  it("stays quiet when it cannot read whether the reader restricted processing", async () => {
    mockSupabaseFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/rest/v1/survey_submission?")) return res(null, false);
      throw new Error(`unexpected ${path}`);
    });
    await noteReaderReturn({ submissionId: 2790, source: "report", at: NEXT_DAY, reader: READER });
    expect(claims()).toHaveLength(0);
    expect(mockReactivation).not.toHaveBeenCalled();
  });

  it("claims the reader's Berlin day, replies in their thread and keeps the reply's ts", async () => {
    await noteReaderReturn({
      submissionId: 2790,
      source: "report",
      at: NEXT_DAY,
      via: "initial_gift",
      reader: READER,
    });

    expect(claims()).toHaveLength(1);
    const [, claim] = claims()[0]!;
    expect((claim as { headers: Record<string, string> }).headers.Prefer).toBe(
      "resolution=ignore-duplicates,return=representation"
    );
    expect(JSON.parse((claim as { body: string }).body)).toEqual({
      survey_submission_id: 2790,
      day: "2026-11-15",
      returned_at: NEXT_DAY.toISOString(),
      source: "report",
      via: "initial_gift",
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
    const posted = mockPost.mock.calls[0]![0] as {
      channel: string;
      threadTs: string;
      text: string;
      blocks: Array<{ text: { text: string } }>;
    };
    // In the thread of the stored message, in the channel it lives in.
    expect(posted.channel).toBe("C0JOURNEY");
    expect(posted.threadTs).toBe("1731570000.000100");
    expect(posted.blocks[0]!.text.text).toContain("through the *gift email (E07)*");
    expect(posted.blocks[0]!.text.text).toContain("`j***@gmail.com`");

    const patch = calls((p, m) => p.startsWith("/rest/v1/reader_return?") && m === "PATCH");
    expect(patch).toHaveLength(1);
    expect(patch[0]![0]).toBe(
      "/rest/v1/reader_return?survey_submission_id=eq.2790&day=eq.2026-11-15"
    );
    expect(JSON.parse((patch[0]![1] as { body: string }).body)).toEqual({
      slack_ts: "1731650000.000200",
    });
  });

  it("posts once per reader per day: a day already claimed posts nothing", async () => {
    backend({ claimed: [] });
    await noteReaderReturn({ submissionId: 2790, source: "email", at: NEXT_DAY, reader: READER });
    expect(claims()).toHaveLength(1);
    expect(mockPost).not.toHaveBeenCalled();
    expect(calls((p) => p.includes("slack_journey_message"))).toHaveLength(0);
  });

  it("writes nothing and posts nothing for what is no return", async () => {
    await noteReaderReturn({
      submissionId: 2790,
      source: "report",
      at: after(READER.finishedAt!, 3 * MINUTE),
      reader: READER,
    });
    await noteReaderReturn({
      submissionId: 2790,
      source: "report",
      at: NEXT_DAY,
      reader: { ...READER, internal: true },
    });
    expect(mockSupabaseFetch).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("no thread to reply to: the day is kept, nothing is posted, nothing logged as failing", async () => {
    backend({ message: null });
    await noteReaderReturn({ submissionId: 2790, source: "answer", at: NEXT_DAY, reader: READER });
    expect(claims()).toHaveLength(1);
    expect(mockPost).not.toHaveBeenCalled();
    // An older message posted by the webhook has no stored ts: normal, not a failure.
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("never replies under a row the August catch-up wrote: its ts may be a reply in that thread", async () => {
    backend({ message: { ...MESSAGE, backfilled_at: "2026-08-24T18:23:34.000Z" } });
    await noteReaderReturn({ submissionId: 2790, source: "report", at: NEXT_DAY, reader: READER });
    expect(claims()).toHaveLength(1);
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("without the bot the day is still kept (AP counts it), and no message is read", async () => {
    mockConfigured.mockReturnValue(false);
    await noteReaderReturn({ submissionId: 2790, source: "answer", at: NEXT_DAY, reader: READER });
    expect(claims()).toHaveLength(1);
    expect(calls((p) => p.includes("slack_journey_message"))).toHaveLength(0);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("a claim the database refuses posts nothing and is logged", async () => {
    backend({ claimOk: false });
    await noteReaderReturn({ submissionId: 2790, source: "email", at: NEXT_DAY, reader: READER });
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockWarn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 500, submissionId: 2790 }),
      "return ping: claim failed"
    );
  });

  it("a reply Slack refuses keeps the day and stores no ts", async () => {
    mockPost.mockResolvedValue(null);
    await noteReaderReturn({ submissionId: 2790, source: "email", at: NEXT_DAY, reader: READER });
    expect(claims()).toHaveLength(1);
    expect(calls((p, m) => p.startsWith("/rest/v1/reader_return?") && m === "PATCH")).toHaveLength(
      0
    );
  });

  it("never throws: a database or Slack failure is logged and swallowed", async () => {
    mockSupabaseFetch.mockRejectedValue(new Error("supabase down"));
    await expect(
      noteReaderReturn({ submissionId: 2790, source: "email", at: NEXT_DAY })
    ).resolves.toBeUndefined();
    backend();
    mockPost.mockRejectedValue(new Error("slack down"));
    await expect(
      noteReaderReturn({ submissionId: 2790, source: "email", at: NEXT_DAY, reader: READER })
    ).resolves.toBeUndefined();
    expect(mockWarn).toHaveBeenCalledTimes(2);
  });

  it("reads the reader when the caller has none: a team survey is left alone", async () => {
    backend({
      submission: [
        {
          created_date_time: READER.finishedAt,
          start_date_time: READER.startedAt,
          app_user: { email: "mark@loveiq.org" },
        },
      ],
    });
    await noteReaderReturn({ submissionId: 2790, source: "email", at: NEXT_DAY });
    expect(calls((p) => p.startsWith("/rest/v1/survey_submission?id=eq.2790"))).toHaveLength(1);
    expect(claims()).toHaveLength(0);
  });

  it("reads the reader and masks the address it found", async () => {
    backend({
      submission: [
        {
          created_date_time: READER.finishedAt,
          start_date_time: READER.startedAt,
          app_user: { email: "jane.doe@gmail.com" },
        },
      ],
    });
    await noteReaderReturn({
      submissionId: 2790,
      source: "email",
      at: NEXT_DAY,
      via: "unlock_feedback",
    });
    const line = (mockPost.mock.calls[0]![0] as { blocks: Array<{ text: { text: string } }> })
      .blocks[0]!.text.text;
    expect(line).toContain("`j***@gmail.com`");
    expect(line).not.toContain("jane.doe");
  });

  it("keeps no `via` that is not utm-shaped", async () => {
    await noteReaderReturn({
      submissionId: 2790,
      source: "report",
      at: NEXT_DAY,
      via: "<script>",
      reader: READER,
    });
    expect(JSON.parse((claims()[0]![1] as { body: string }).body).via).toBeNull();
  });
});

describe("noteReaderReturn: every claimed day goes to #report-reactivations too", () => {
  const NEXT_DAY = new Date("2026-11-15T07:00:00.000Z");

  function backend(claimed: unknown[] = [{ survey_submission_id: 2790 }], message: unknown[] = []) {
    mockSupabaseFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path === "/rest/v1/reader_return" && init?.method === "POST") return res(claimed);
      if (path.startsWith("/rest/v1/reader_return?") && init?.method === "PATCH") return res(null);
      if (path.startsWith("/rest/v1/slack_journey_message?")) return res(message);
      // The restriction check (GDPR Art. 18): a reader who did not restrict processing.
      if (path.startsWith("/rest/v1/survey_submission?")) return res([{ app_user: null }]);
      throw new Error(`unexpected ${path}`);
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigured.mockReturnValue(true);
    mockPost.mockResolvedValue({ channel: "C0JOURNEY", ts: "1731650000.000200" });
    mockReactivation.mockResolvedValue(undefined);
    backend();
  });

  it("hands the claim over with its day, whether or not a thread exists", async () => {
    await noteReaderReturn({
      submissionId: 2790,
      source: "email",
      at: NEXT_DAY,
      via: "gift_unopened",
      reader: READER,
    });
    expect(mockReactivation).toHaveBeenCalledTimes(1);
    expect(mockReactivation).toHaveBeenCalledWith({
      submissionId: 2790,
      source: "email",
      via: "gift_unopened",
      at: NEXT_DAY,
      day: "2026-11-15",
    });
    // No thread for this reader: the reply is skipped, the reactivation post is not.
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("hands over drafts too: the post leaves them out itself", async () => {
    await noteReaderReturn({
      submissionId: 2844,
      source: "draft",
      at: NEXT_DAY,
      reader: READER,
    });
    expect(mockReactivation).toHaveBeenCalledWith(expect.objectContaining({ source: "draft" }));
  });

  it("hands nothing over for a day already claimed, or for no return at all", async () => {
    backend([]);
    await noteReaderReturn({ submissionId: 2790, source: "report", at: NEXT_DAY, reader: READER });
    await noteReaderReturn({
      submissionId: 2790,
      source: "report",
      at: NEXT_DAY,
      reader: { ...READER, internal: true },
    });
    expect(mockReactivation).not.toHaveBeenCalled();
  });

  it("replies in the thread as well", async () => {
    backend(undefined, [{ channel: "C0JOURNEY", message_ts: "1731570000.000100" }]);
    await noteReaderReturn({
      submissionId: 2790,
      source: "report",
      at: NEXT_DAY,
      via: "initial_gift",
      reader: READER,
    });
    expect(mockReactivation).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect((mockPost.mock.calls[0]![0] as { threadTs: string }).threadTs).toBe("1731570000.000100");
  });
});
