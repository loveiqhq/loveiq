import { describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  GMAIL_BUILDER_VERSION,
  mailboxes,
  messageText,
  person,
  stripQuoted,
  threadToRows,
  isBulkMail,
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
    expect(src).toMatch(/return have\.current;/);
    expect(src).toMatch(/belongs to the sweep, not to the touch list/);
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
