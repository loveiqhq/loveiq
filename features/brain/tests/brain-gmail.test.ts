import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  GMAIL_BUILDER_VERSION,
  excludeMailboxes,
  mailboxes,
  messageText,
  person,
  stripQuoted,
  threadToRows,
  attachmentRefs,
  MAX_ATTACHMENTS_PER_THREAD,
  MAX_ATTACHMENT_BYTES,
  isBulkMail,
  excludeSubjects,
  trustpilotReviewTitle,
} from "@features/brain/server/ingest/gmail";

const b64 = (s: string) =>
  Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

describe("messageText — getting text out of a MIME tree", () => {
  it("prefers text/plain", () => {
    expect(
      messageText({
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/plain", body: { data: b64("the plain one") } },
          { mimeType: "text/html", body: { data: b64("<p>the html one</p>") } },
        ],
      })
    ).toBe("the plain one");
  });

  it("falls back to HTML, because a lot of real mail has no plain part", () => {
    // Anything sent from a phone or a marketing tool is often HTML-only. Skipping
    // those would silently lose whole conversations rather than fail loudly.
    expect(
      messageText({
        mimeType: "text/html",
        body: { data: b64("<div>we agreed on <b>39.99</b></div>") },
      })
        .replace(/\s+/g, " ")
        .trim()
    ).toBe("we agreed on 39.99");
  });

  it("drops style and script blocks rather than indexing CSS", () => {
    const out = messageText({
      mimeType: "text/html",
      body: { data: b64("<style>.a{color:red}</style><p>real text</p><script>x()</script>") },
    });
    expect(out).toContain("real text");
    expect(out).not.toContain("color:red");
    expect(out).not.toContain("x()");
  });

  it("decodes base64url, which Gmail uses and which is NOT plain base64", () => {
    // '-' and '_' replace '+' and '/', and the padding is stripped. Decoding it as
    // ordinary base64 yields mojibake, not an error, so this fails silently.
    const tricky = "subject~~ ?? >> ok";
    expect(messageText({ mimeType: "text/plain", body: { data: b64(tricky) } })).toBe(tricky);
  });

  it("returns empty for an attachment-only part rather than throwing", () => {
    expect(messageText({ mimeType: "application/pdf", filename: "x.pdf", body: { size: 9 } })).toBe(
      ""
    );
    expect(messageText(undefined)).toBe("");
  });
});

describe("stripQuoted — the reply that carries the whole thread beneath it", () => {
  /**
   * Without this, a ten-message thread is stored ten times over: every reply quotes
   * everything above it, the body limit then truncates the ACTUAL new text in
   * favour of quoted history, and search matches the same sentence ten times.
   */
  it("cuts at the 'On ... wrote:' marker", () => {
    expect(
      stripQuoted(
        "Yes, agreed.\n\nOn Mon, 4 Aug 2026 at 11:02, Marcus <m@x.com> wrote:\n> the old text"
      )
    ).toBe("Yes, agreed.");
  });

  it("cuts at an Outlook-style original-message divider", () => {
    expect(stripQuoted("Sounds good.\n\n-----Original Message-----\nFrom: someone")).toBe(
      "Sounds good."
    );
  });

  it("drops leading '>' quote lines even without a marker", () => {
    expect(stripQuoted("New thought.\n> quoted line\n> another")).toBe("New thought.");
  });

  it("leaves a message that quotes nothing completely intact", () => {
    expect(stripQuoted("Just one line, no quoting.")).toBe("Just one line, no quoting.");
  });
});

describe("person", () => {
  it("keeps the name and drops the angle brackets", () => {
    expect(person('"Marcus Börner" <marcus@loveiq.org>')).toBe("Marcus Börner");
    expect(person("Eman <ec@loveiq.org>")).toBe("Eman");
  });
  it("falls back to the bare address when there is no display name", () => {
    expect(person("<ops@stripe.com>")).toBe("ops@stripe.com");
    expect(person("plain@example.com")).toBe("plain@example.com");
  });
});

const thread = {
  id: "t123",
  historyId: "555",
  messages: [
    {
      id: "m1",
      internalDate: "1787900000000",
      payload: {
        headers: [
          { name: "Subject", value: "Pricing for the report" },
          { name: "From", value: "Marcus <marcus@loveiq.org>" },
          { name: "To", value: "Eman <ec@loveiq.org>" },
        ],
        mimeType: "text/plain",
        body: { data: b64("Should we go to 39.99?") },
      },
    },
    {
      id: "m2",
      internalDate: "1787990000000",
      payload: {
        headers: [
          { name: "Subject", value: "Re: Pricing for the report" },
          { name: "From", value: "Eman <ec@loveiq.org>" },
          { name: "To", value: "Marcus <marcus@loveiq.org>" },
        ],
        mimeType: "text/plain",
        body: { data: b64("Yes.\n\nOn Mon, Marcus wrote:\n> Should we go to 39.99?") },
      },
    },
  ],
};

describe("a Trustpilot review is its own document, and says whose it is", () => {
  /**
   * Every notification shares one subject, and search collapses Gmail rows that share a
   * title — so three of four reviews were unreachable by any question. The team said on
   * 2026-09-18 that the reviews so far came from friends; those carry the mark.
   */
  const review = (day: string, internalDate: string, text: string) => ({
    id: `tp-${day}`,
    historyId: "1",
    messages: [
      {
        id: `m-${day}`,
        internalDate,
        payload: {
          headers: [
            { name: "Subject", value: "You've got a new 5-star review" },
            { name: "From", value: "Trustpilot <noreply@trustpilot.com>" },
          ],
          mimeType: "text/plain",
          body: {
            data: b64(
              `DORIEN VM LEFT A NEW REVIEW\n\nHI EMAN,\n\nDorien VM just left a new 5-star review of loveiq.org:\n\n${text}\n\nSee this review and reply\n[https://example.test/r]`
            ),
          },
        },
      },
    ],
  });

  it("titles each review distinctly, through threadToRows", () => {
    const a = threadToRows(
      review("2026-06-10", "1781049600000", "Spot-on results. I know myself better."),
      "me",
      "s"
    )[0]!;
    const b = threadToRows(
      review("2026-06-12", "1781222400000", "Questions I would never ask myself."),
      "me",
      "s"
    )[0]!;
    expect(a.title).toMatch(
      /^Trustpilot review of LoveIQ, 5 stars, 2026-06-10: "Spot-on results\."/
    );
    expect(b.title).not.toBe(a.title);
  });

  it("marks the early reviews as the team described them, and later ones not at all", () => {
    const early = trustpilotReviewTitle(
      "You've got a new 5-star review",
      "x left a new 5-star review of loveiq.org: Great. See this review",
      "2026-06-12"
    );
    const later = trustpilotReviewTitle(
      "You've got a new 5-star review",
      "x left a new 5-star review of loveiq.org: Great. See this review",
      "2026-10-02"
    );
    expect(early).toMatch(/friends, not customers/);
    expect(later).not.toMatch(/friends/);
  });

  it("leaves other Trustpilot mail and the reviewer's name out of it", () => {
    expect(
      trustpilotReviewTitle(
        "Your weekly Trustpilot summary",
        "left a new 5-star review of loveiq.org: x See this review",
        "2026-06-12"
      )
    ).toBeNull();
    const t = threadToRows(review("2026-06-10", "1781049600000", "Spot-on."), "me", "s")[0]!.title;
    expect(t).not.toMatch(/Dorien/i);
  });
});

describe("threadToRows — one chunk per THREAD", () => {
  it("keeps the exchange together, in order, with who said what", () => {
    // A reply of "Yes." is meaningless without the question above it, and a thread
    // is the unit somebody actually asks about.
    const [row] = threadToRows(thread, "me", "stamp");
    expect(row!.body).toContain("Marcus (2026-08-28): Should we go to 39.99?");
    expect(row!.body).toContain("Eman");
    expect(row!.body.indexOf("Should we go")).toBeLessThan(row!.body.indexOf("Yes."));
  });

  it("stores the reply WITHOUT the quoted copy of the question", () => {
    const [row] = threadToRows(thread, "me", "stamp");
    expect(row!.body.match(/Should we go to 39\.99\?/g)).toHaveLength(1);
  });

  it("dates period_end from the LAST message, so an old thread revived today ranks as today", () => {
    expect(threadToRows(thread, "me", "stamp")[0]!.period_end).toBe("2026-08-29");
  });

  it("records the historyId, which is what makes the next run skip it", () => {
    const meta = threadToRows(thread, "me", "stamp")[0]!.meta as { historyId: string; v: number };
    expect(meta.historyId).toBe("555");
    expect(meta.v).toBe(GMAIL_BUILDER_VERSION);
  });

  it("links back to the real thread in Gmail", () => {
    expect(threadToRows(thread, "me", "stamp")[0]!.url).toContain("t123");
  });

  it("skips a thread whose every message is empty or attachment-only", () => {
    expect(
      threadToRows(
        {
          id: "t9",
          messages: [{ id: "m", payload: { mimeType: "application/pdf", headers: [] } }],
        },
        "me",
        "s"
      )
    ).toEqual([]);
  });

  it("splits a very long thread and keeps the tail findable", () => {
    const long = {
      id: "tlong",
      historyId: "1",
      messages: Array.from({ length: 60 }, (_, i) => ({
        id: `m${i}`,
        internalDate: "1787900000000",
        payload: {
          headers: [
            { name: "Subject", value: "Long one" },
            { name: "From", value: "A <a@x.com>" },
          ],
          mimeType: "text/plain",
          body: { data: b64(`message number ${i} discussing the checkout funnel at length`) },
        },
      })),
    };
    const rows = threadToRows(long, "me", "s");
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.map((r) => r.body).join("\n")).toContain("message number 59");
  });
});

describe("excludeMailboxes", () => {
  /**
   * The directory drops a person when their account is SUSPENDED. A colleague can leave
   * with their account still live during handover, and their mail can simply not be
   * wanted — this is the switch for that case.
   *
   * Deliberately configuration, not a constant: the repository is public, and a list of
   * named individuals whose mail the company chose not to read does not belong in it.
   */
  const saved = process.env.GMAIL_EXCLUDE_MAILBOXES;
  afterEach(() => {
    if (saved === undefined) delete process.env.GMAIL_EXCLUDE_MAILBOXES;
    else process.env.GMAIL_EXCLUDE_MAILBOXES = saved;
  });

  it("walks everything when nothing is excluded", () => {
    delete process.env.GMAIL_EXCLUDE_MAILBOXES;
    expect(excludeMailboxes(["a@x.org", "b@x.org"])).toEqual(["a@x.org", "b@x.org"]);
    process.env.GMAIL_EXCLUDE_MAILBOXES = "   ";
    expect(excludeMailboxes(["a@x.org"])).toEqual(["a@x.org"]);
  });

  it("drops the named mailboxes and keeps the rest", () => {
    process.env.GMAIL_EXCLUDE_MAILBOXES = "gone@x.org, other@x.org";
    expect(excludeMailboxes(["a@x.org", "gone@x.org", "other@x.org", "b@x.org"])).toEqual([
      "a@x.org",
      "b@x.org",
    ]);
  });

  it("matches regardless of case or padding, because an address is not case-sensitive", () => {
    // A list typed by a human into an env var, matched against a list returned by the
    // Google directory. Expecting those to agree byte-for-byte is how an exclusion
    // silently does nothing at all.
    process.env.GMAIL_EXCLUDE_MAILBOXES = "  GONE@X.org ";
    expect(excludeMailboxes(["a@x.org", "gone@x.org"])).toEqual(["a@x.org"]);
  });

  it("ignores a name that matches nobody rather than emptying the walk", () => {
    process.env.GMAIL_EXCLUDE_MAILBOXES = "nosuchperson@x.org";
    expect(excludeMailboxes(["a@x.org", "b@x.org"])).toEqual(["a@x.org", "b@x.org"]);
  });
});

describe("mailboxes", () => {
  it("defaults to the credential's own mailbox", () => {
    delete process.env.GMAIL_MAILBOXES;
    expect(mailboxes()).toEqual(["me"]);
  });

  it("reads a configured list, so adding colleagues is config not a rewrite", () => {
    // Reaching another person's mail needs Workspace domain-wide delegation — a
    // user token only ever sees its own, whatever scope it carries.
    process.env.GMAIL_MAILBOXES = "ec@loveiq.org, marcus@loveiq.org ,";
    expect(mailboxes()).toEqual(["ec@loveiq.org", "marcus@loveiq.org"]);
    delete process.env.GMAIL_MAILBOXES;
  });
});

describe("notification stubs are not conversations", () => {
  /**
   * Measured on the real mailbox: "Your secure link to Claude.ai is here" reduces
   * to a body of "96" and whitespace — the link lives in HTML the plain part does
   * not carry. Nothing useful survives, and nothing sensitive is stored either
   * (verified: zero URLs in the indexed body). Dozens of those crowd the corpus
   * while being unable to answer anything.
   */
  it("drops a thread whose whole text is a stub", () => {
    const b = (s: string) => Buffer.from(s, "utf8").toString("base64url");
    expect(
      threadToRows(
        {
          id: "stub",
          messages: [
            {
              id: "m",
              internalDate: "1787900000000",
              payload: {
                headers: [
                  { name: "Subject", value: "Your secure link" },
                  { name: "From", value: "A <a@x>" },
                ],
                mimeType: "text/plain",
                body: { data: b("96") },
              },
            },
          ],
        },
        "me",
        "s"
      )
    ).toEqual([]);
  });

  it("keeps a SHORT two-message exchange — a reply means a human engaged", () => {
    // A first attempt measured the whole thread's length and threw away exactly
    // this shape: "Should we go to 39.99?" / "Yes." Short, decisive, and precisely
    // what the brain exists to remember.
    const b = (s: string) => Buffer.from(s, "utf8").toString("base64url");
    const rows = threadToRows(
      {
        id: "real",
        messages: [
          {
            id: "m1",
            internalDate: "1787900000000",
            payload: {
              headers: [
                { name: "Subject", value: "Budget" },
                { name: "From", value: "Marcus <m@x>" },
              ],
              mimeType: "text/plain",
              body: { data: b("Can we sign off the extra ad budget for September, roughly 2k?") },
            },
          },
          {
            id: "m2",
            internalDate: "1787990000000",
            payload: {
              headers: [
                { name: "Subject", value: "Re: Budget" },
                { name: "From", value: "Eman <e@x>" },
              ],
              mimeType: "text/plain",
              body: { data: b("Yes, approved.") },
            },
          },
        ],
      },
      "me",
      "s"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.body).toContain("Yes, approved.");
  });
});

describe("a stale-version row must never be confirmed", () => {
  /**
   * Touching a chunk says "this is still correct". A row built by an older builder
   * version is by definition not — it was either dropped from the source, or the
   * current rules would no longer produce it. Confirming it keeps it alive forever
   * and it never reaches the sweep.
   *
   * Measured: 30 notification-stub threads survived the v2 rebuild exactly this
   * way, because v2 skipped writing them and the touch list then vouched for them.
   */
  it("excludes rows whose builder version is stale from the touch list", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("features/brain/server/ingest/gmail.ts", "utf8")
    );
    // `have.current` must stay a conjunct of the keep decision: extra conditions may
    // narrow it (listed this run, not refused — 2026-09-23), never replace it.
    expect(src).toMatch(/return have\.current(?:\s*&&[^;]+)?;/);
    // The second assertion here used to grep for the COMMENT above that line, which
    // could only ever detect a rewording — and did, on 2026-09-06. The behaviour it
    // was standing in for is now proven directly, under mutation, by
    // "still sweeps a stale row from a mailbox it did walk" in
    // brain-gmail-ingest.test.ts. Grep the code, not the prose.
  });

  it("only skips a refetch when the row is CURRENT and its historyId matches", async () => {
    // A stale row with a matching historyId must still be refetched — the id says
    // the thread has not changed, not that our rendering of it is still right.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("features/brain/server/ingest/gmail.ts", "utf8")
    );
    expect(src).toMatch(/have\?\.current && have\.historyId && have\.historyId === t\.historyId/);
  });
});

describe("isBulkMail — newsletters must not outrank colleagues", () => {
  const msg = (from: string, extraHeaders: Array<{ name: string; value: string }> = []) => ({
    id: `m${from}`,
    internalDate: "1787900000000",
    payload: {
      headers: [
        { name: "Subject", value: "Something" },
        { name: "From", value: from },
        ...extraHeaders,
      ],
      mimeType: "text/plain",
      body: { data: b64("text") },
    },
  });
  const UNSUB = [{ name: "List-Unsubscribe", value: "<https://x.test/u/1>" }];

  it("flags a plain newsletter", () => {
    expect(isBulkMail([msg("Substack <n@substack.test>", UNSUB)])).toBe(true);
  });

  it("does not flag a normal thread between people", () => {
    expect(isBulkMail(thread.messages)).toBe(false);
  });

  /**
   * The reason this is `every` and not `some`. A newsletter someone forwarded and
   * the team then argued about IS a conversation, and the replies carry no
   * List-Unsubscribe. Treating it as bulk would bury the discussion along with it.
   */
  it("does not flag a newsletter the team replied to", () => {
    expect(
      isBulkMail([msg("Substack <n@substack.test>", UNSUB), msg("Eman <ec@loveiq.org>")])
    ).toBe(false);
  });

  it("is case-insensitive about the header name, as RFC 2369 senders are not consistent", () => {
    expect(
      isBulkMail([msg("N <n@x.test>", [{ name: "list-unsubscribe", value: "<mailto:u@x.test>" }])])
    ).toBe(true);
  });

  it("treats an empty thread as not bulk rather than vacuously true", () => {
    expect(isBulkMail([])).toBe(false);
  });

  it("records the flag on every part of a long thread, so a split newsletter is still bulk", () => {
    // Long enough to clear MIN_STUB_CHARS: a single short message is discarded as
    // a notification stub before it ever gets a bulk flag.
    const long = {
      ...msg("Substack <n@substack.test>", UNSUB),
      payload: {
        ...msg("Substack <n@substack.test>", UNSUB).payload,
        body: { data: b64("Why hurt people hurt people. ".repeat(40)) },
      },
    };
    const rows = threadToRows({ ...thread, messages: [long] }, "me", "stamp");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect((r.meta as { bulk: boolean }).bulk).toBe(true);
  });
});

describe("isBulkMail — RFC 3834, the half List-Unsubscribe missed", () => {
  const msg = (from: string, extraHeaders: Array<{ name: string; value: string }> = []) => ({
    id: `m${from}${extraHeaders.map((h) => h.value).join("")}`,
    internalDate: "1787900000000",
    payload: {
      headers: [
        { name: "Subject", value: "Something" },
        { name: "From", value: from },
        ...extraHeaders,
      ],
      mimeType: "text/plain",
      body: { data: b64("text") },
    },
  });

  /**
   * The measurement that motivated this: 2,694 indexed chunks were machine-generated
   * notifications carrying no demotion, against 47 the List-Unsubscribe test caught.
   * A notification robot has no reason to offer an unsubscribe link; it announces
   * itself with Auto-Submitted instead.
   */
  it("flags an issue-tracker notification that offers no unsubscribe link", () => {
    expect(
      isBulkMail([msg("Jira <jira@x.test>", [{ name: "Auto-Submitted", value: "auto-generated" }])])
    ).toBe(true);
  });

  it("flags an auto-reply", () => {
    expect(
      isBulkMail([msg("OOO <a@x.test>", [{ name: "Auto-Submitted", value: "auto-replied" }])])
    ).toBe(true);
  });

  /**
   * `no` is the ONE value RFC 3834 reserves for mail a person actually sent. Reading
   * the header's presence rather than its value would demote every well-behaved
   * client that states it.
   */
  it("does NOT flag mail that explicitly says a human sent it", () => {
    expect(
      isBulkMail([msg("Eman <ec@loveiq.org>", [{ name: "Auto-Submitted", value: "no" }])])
    ).toBe(false);
  });

  it("flags the pre-RFC spelling, Precedence: bulk", () => {
    expect(isBulkMail([msg("N <n@x.test>", [{ name: "Precedence", value: "bulk" }])])).toBe(true);
  });

  it("ignores a Precedence value that is not a bulk claim", () => {
    expect(isBulkMail([msg("N <n@x.test>", [{ name: "Precedence", value: "urgent" }])])).toBe(
      false
    );
  });

  it("is case-insensitive about header name and value", () => {
    expect(
      isBulkMail([msg("N <n@x.test>", [{ name: "auto-submitted", value: "Auto-Generated" }])])
    ).toBe(true);
  });

  /**
   * Same `every` rule the List-Unsubscribe test earned: a deploy-failure thread the
   * team then discussed is a conversation, and burying it would take the discussion
   * with it. This is why the ops-alert mail keeps its demotion narrow.
   */
  it("does not flag a robot thread once a person replies in it", () => {
    expect(
      isBulkMail([
        msg("Vercel <n@vercel.test>", [{ name: "Auto-Submitted", value: "auto-generated" }]),
        msg("Eman <ec@loveiq.org>"),
      ])
    ).toBe(false);
  });
});

describe("excludeSubjects — keeping a sibling project's tickets out", () => {
  const OLD = process.env.GMAIL_EXCLUDE_SUBJECTS;
  afterEach(() => {
    if (OLD === undefined) delete process.env.GMAIL_EXCLUDE_SUBJECTS;
    else process.env.GMAIL_EXCLUDE_SUBJECTS = OLD;
  });

  it("adds nothing when unset, so the query is unchanged", () => {
    delete process.env.GMAIL_EXCLUDE_SUBJECTS;
    expect(excludeSubjects()).toBe("");
  });

  it("adds nothing when set to blank", () => {
    process.env.GMAIL_EXCLUDE_SUBJECTS = "   ";
    expect(excludeSubjects()).toBe("");
  });

  it("emits a Gmail -subject: term per entry", () => {
    process.env.GMAIL_EXCLUDE_SUBJECTS = "SHOWUP";
    expect(excludeSubjects()).toBe(" -subject:SHOWUP");
  });

  it("handles several entries and tolerates padding", () => {
    process.env.GMAIL_EXCLUDE_SUBJECTS = " SHOWUP , OTHERPROJ ";
    expect(excludeSubjects()).toBe(" -subject:SHOWUP -subject:OTHERPROJ");
  });

  /**
   * Gmail does not reject a malformed term, it reinterprets the query — so a stray
   * colon or paren would silently change WHICH mail is excluded rather than failing.
   * Dropped rather than escaped: there is no legitimate reason for one here.
   */
  it("drops a term carrying Gmail query operators rather than changing the query's meaning", () => {
    process.env.GMAIL_EXCLUDE_SUBJECTS = "SHOWUP,from:x@y.test,in(box),a b";
    expect(excludeSubjects()).toBe(" -subject:SHOWUP");
  });
});

describe("attachmentRefs — attachments are content, and none were read", () => {
  /**
   * Until 2026-09-19 the walk indexed every message BODY and nothing hanging off it.
   * A proposal sent as a pdf was invisible while the thread around it read as
   * complete, which is the shape of gap this whole audit is about.
   */
  const part = (over: Record<string, unknown> = {}) => ({
    mimeType: "application/pdf",
    filename: "Proposal.pdf",
    body: { attachmentId: "att1", size: 1000 },
    ...over,
  });
  const withParts = (parts: unknown[]) => ({
    id: "t1",
    messages: [{ id: "m1", payload: { parts } }],
  });

  it("picks a readable attachment", () => {
    const refs = attachmentRefs(withParts([part()]) as never);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      messageId: "m1",
      attachmentId: "att1",
      filename: "Proposal.pdf",
    });
  });

  it("finds one nested inside a multipart tree", () => {
    const nested = withParts([{ mimeType: "multipart/mixed", parts: [part()] }]);
    expect(attachmentRefs(nested as never)).toHaveLength(1);
  });

  /**
   * THE SAME CONTRACT ARRIVES BOTH WAYS.
   *
   * Excluding signed instruments from the Drive walk alone left 58 chunks of the
   * freelance contract and the shareholders agreement readable through the mailbox —
   * attached to "Applied Psychometrics - Freelance Contract - Welcome to the Team",
   * to a forward of it, and to a thread called simply "Freelance Contract". Measured
   * 2026-09-22, after the Drive half had already shipped.
   *
   * The COVERING MESSAGE stays, and that distinction is the whole design: "Hey
   * Brother, Attached is the new contract" is a real thing for the brain to remember.
   * The instrument hanging off it is not.
   */
  it("never reads an attached contract, while keeping the message that carried it", () => {
    const thread = {
      id: "t1",
      messages: [
        {
          id: "m1",
          payload: {
            parts: [
              part({ filename: "Freelancer Agreement_Fatih.docx" }),
              part({ attachmentId: "att2", filename: "Shareholders Agreement.pdf" }),
              part({
                attachmentId: "att3",
                filename: "AppliedPsychometrics_VSOP_Terms_of_Options.pdf",
              }),
              // The positive control. Without it a run that read NO attachment at all
              // would pass this test just as well.
              part({ attachmentId: "att4", filename: "Q3 roadmap.pdf" }),
            ],
          },
        },
      ],
    };
    const refs = attachmentRefs(thread as never);
    expect(refs.map((r) => r.filename)).toEqual(["Q3 roadmap.pdf"]);
  });

  it("never reads a CV attached to an email, with a positive control beside it", () => {
    // Applicants' CVs arrive as attachments in every mailbox that forwards them —
    // Drive's rule alone left this door open (2026-09-23).
    const refs = attachmentRefs(
      withParts([
        part({ attachmentId: "a1", filename: "CV_Jane_Doe.pdf" }),
        part({ attachmentId: "a2", filename: "Lebenslauf.pdf" }),
        part({ attachmentId: "a3", filename: "Q3 roadmap.pdf" }),
      ]) as never
    );
    expect(refs.map((r) => r.filename)).toEqual(["Q3 roadmap.pdf"]);
  });

  it("still reads a meeting note that happens to discuss a contract", () => {
    const note = part({ filename: "Contract Sync - 2026/09/09 - Notes by Gemini.pdf" });
    expect(attachmentRefs(withParts([note]) as never)).toHaveLength(1);
  });

  it("ignores a format there is no reader for", () => {
    const img = part({ mimeType: "image/png", filename: "logo.png" });
    expect(attachmentRefs(withParts([img]) as never)).toHaveLength(0);
  });

  it("ignores a file too big to be prose", () => {
    const huge = part({ body: { attachmentId: "att1", size: MAX_ATTACHMENT_BYTES + 1 } });
    expect(attachmentRefs(withParts([huge]) as never)).toHaveLength(0);
  });

  it("ignores an inline part that is not an attachment", () => {
    // No filename and no attachmentId: that is the message body, already indexed.
    const inline = part({ filename: "", body: { data: "aGk", size: 2 } });
    expect(attachmentRefs(withParts([inline]) as never)).toHaveLength(0);
  });

  it("caps how many one thread may contribute", () => {
    const many = Array.from({ length: MAX_ATTACHMENTS_PER_THREAD + 4 }, (_, i) =>
      part({ filename: `f${i}.pdf`, body: { attachmentId: `a${i}`, size: 10 } })
    );
    expect(attachmentRefs(withParts(many) as never)).toHaveLength(MAX_ATTACHMENTS_PER_THREAD);
  });

  it("puts the attachment text in the chunk, under the conversation", () => {
    const [row] = threadToRows(
      thread as never,
      "me",
      "stamp",
      null,
      "## Attachment: Proposal.pdf\nPrice is 39.99"
    );
    expect(row.body).toContain("## Attachment: Proposal.pdf");
    expect(row.body).toContain("Price is 39.99");
    // The conversation still comes first — an attachment supplements, never replaces.
    expect(row.body.indexOf("Between:")).toBeLessThan(row.body.indexOf("## Attachment"));
  });

  it("changes nothing when a thread has no attachments", () => {
    const [plain] = threadToRows(thread as never, "me", "stamp");
    const [same] = threadToRows(thread as never, "me", "stamp", null, "");
    expect(same.body).toBe(plain.body);
  });
});
