import { describe, expect, it, vi } from "vitest";

vi.mock("@shared/observability/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  dayToRows,
  renderMessage,
  SLACK_BUILDER_VERSION,
  tsDate,
} from "@features/brain/server/ingest/slack";

/**
 * Shapes taken from what the real LoveIQ workspace returns. The join message is
 * not invented: `conversations.history` on #all-loveiq opens with two of them, and
 * they carry a real `user` — so filtering only on `bot_id` leaves a channel looking
 * like nothing ever happened in it but arrivals.
 */
const NAMES = new Map([
  ["U0BSNKAC5AR", "Marcus Börner"],
  ["U0BSZ4VRX26", "Eman"],
  ["U0BQ1MARK99", "Mark"],
]);

describe("renderMessage — what gets into the corpus", () => {
  it("keeps a human message and attributes it by name", () => {
    expect(
      renderMessage({ user: "U0BSNKAC5AR", text: "there seems to be a bug", ts: "1" }, NAMES)
    ).toBe("Marcus Börner: there seems to be a bug");
  });

  it("drops bot messages, which is what makes joining every channel safe", () => {
    // #commits-prod-staging and #prod-alerts are almost entirely machine output, and
    // the commits are already indexed from git. Filtering on AUTHORSHIP rather than a
    // channel allow-list means a new bot channel needs no configuration.
    expect(renderMessage({ bot_id: "B123", text: "deploy ok", ts: "1" }, NAMES)).toBeNull();
    expect(renderMessage({ text: "no author at all", ts: "1" }, NAMES)).toBeNull();
  });

  it("drops join/leave bookkeeping even though it has a real user", () => {
    expect(
      renderMessage(
        {
          user: "U0BSNKAC5AR",
          subtype: "channel_join",
          text: "<@U0BSNKAC5AR> has joined the channel",
          ts: "1",
        },
        NAMES
      )
    ).toBeNull();
  });

  it("rewrites @mentions inside the text to names", () => {
    // A message ABOUT someone is only findable by that person's name if the name is
    // actually in the indexed text — the raw id is unsearchable.
    expect(
      renderMessage({ user: "U0BSZ4VRX26", text: "<@U0BQ1MARK99> can you look?", ts: "1" }, NAMES)
    ).toBe("Eman: @Mark can you look?");
  });

  it("falls back to the raw id when users:read is unavailable, rather than dropping the message", () => {
    expect(renderMessage({ user: "UNKNOWN1", text: "hi", ts: "1" }, new Map())).toBe("UNKNOWN1: hi");
  });

  it("decodes the three entities Slack escapes, so the corpus holds what was typed", () => {
    // Slack escapes &, < and > in message text. Storing the raw string put
    // "Let discuss also have a couple of thoughts &amp; ideas" in the corpus.
    expect(
      renderMessage({ user: "U0BSZ4VRX26", text: "thoughts &amp; ideas &lt;3 &gt;", ts: "1" }, NAMES)
    ).toBe("Eman: thoughts & ideas <3 >");
  });

  it("drops an empty message and marks a thread reply", () => {
    expect(renderMessage({ user: "U0BSZ4VRX26", text: "   ", ts: "1" }, NAMES)).toBeNull();
    expect(renderMessage({ user: "U0BSZ4VRX26", text: "agreed", ts: "1" }, NAMES, true)).toBe(
      "  ↳ Eman: agreed"
    );
  });
});

describe("tsDate", () => {
  it("reads the UTC day out of a Slack timestamp", () => {
    expect(tsDate("1787941701.811139")).toBe("2026-08-28");
  });
});

describe("dayToRows — one chunk per channel per day", () => {
  const lines = ["Marcus Börner: maybe broken?", "Eman: fixed : )"];

  it("groups a day's exchange into a single chunk, not one per message", () => {
    // A single Slack message is usually meaningless alone ("yeah agreed") — the unit
    // that answers a question is the exchange around it.
    const rows = dayToRows("bugs-issues", "2026-08-27", lines, "stamp");
    expect(rows).toHaveLength(1);
    expect(rows[0].source_id).toBe("ch:bugs-issues:2026-08-27");
    expect(rows[0].body).toContain("Marcus Börner: maybe broken?");
    expect(rows[0].body).toContain("Eman: fixed : )");
  });

  it("dates period_end to the day itself, so recency ranking works", () => {
    expect(dayToRows("bugs-issues", "2026-08-27", lines, "s")[0].period_end).toBe("2026-08-27");
  });

  it("returns nothing for a day whose messages were all filtered out", () => {
    // A bot-only day must not produce an empty titled chunk that competes in search.
    expect(dayToRows("prod-alerts", "2026-08-27", [], "s")).toEqual([]);
  });

  it("splits a very long day across parts and keeps every part findable", () => {
    // The Notion ingest already lost 60 page tails to a silent 2400-char truncation;
    // a busy channel day is exactly the same failure waiting to happen.
    const many = Array.from({ length: 200 }, (_, i) => `Eman: message number ${i} about pricing`);
    const rows = dayToRows("all-loveiq", "2026-08-27", many, "s");
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0].source_id).toBe("ch:all-loveiq:2026-08-27");
    expect(rows[1].source_id).toBe("ch:all-loveiq:2026-08-27#2");
    expect(rows[1].title).toContain("part 2");
    // The tail must survive — that is the whole point of splitting.
    expect(rows.map((r) => r.body).join("\n")).toContain("message number 199");
  });

  it("stamps a builder version so a row-shape change can be detected as stale", () => {
    expect(dayToRows("hr", "2026-08-27", lines, "s")[0].meta).toMatchObject({
      kind: "slack-day",
      channel: "hr",
    });
    expect((dayToRows("hr", "2026-08-27", lines, "s")[0].meta as { v: number }).v).toBeGreaterThan(
      0
    );
  });
});

describe("a day with a dropped thread must be rebuilt, not cached", () => {
  /**
   * The bug this exists for was real and shipped: `conversations.replies` is Slack
   * Tier 3 (~50/min), the first live run tripped it a dozen times, and the ingester
   * discarded each rate-limited page while still reporting `complete: true`. Because
   * a past day is skipped once indexed, every thread lost to one 429 would have
   * stayed missing forever — a silently truncated chunk, which is the same class of
   * failure that cost 60 Notion pages their tails.
   */
  it("marks the day incomplete so the next run repairs it", () => {
    const gap = dayToRows("payments", "2026-08-27", ["Eman: see thread"], "s", false);
    expect((gap[0].meta as { threadsComplete: boolean }).threadsComplete).toBe(false);
  });

  it("marks a fully-fetched day complete, so it is skipped and costs nothing", () => {
    const whole = dayToRows("payments", "2026-08-27", ["Eman: see thread"], "s");
    expect((whole[0].meta as { threadsComplete: boolean }).threadsComplete).toBe(true);
  });

  it("carries the flag onto every part of a split day", () => {
    // A day long enough to split must not have its tail parts silently marked whole.
    const many = Array.from({ length: 200 }, (_, i) => `Eman: line ${i} about pricing and refunds`);
    const rows = dayToRows("all-loveiq", "2026-08-27", many, "s", false);
    expect(rows.length).toBeGreaterThan(1);
    for (const r of rows) {
      expect((r.meta as { threadsComplete: boolean }).threadsComplete).toBe(false);
    }
  });

  it("is past v1, so the rows written before the 429 fix are rebuilt not trusted", () => {
    expect(SLACK_BUILDER_VERSION).toBeGreaterThan(1);
  });
});

describe("slackTs — the format Slack actually accepts", () => {
  /**
   * A bare integer is rejected with `invalid_ts_oldest`, and the failure is quiet:
   * `conversations.history` returns ok:false for the WHOLE channel, so the
   * incremental fetch silently retrieves nothing. Only the completeness flag
   * catches it, which is why that flag exists.
   */
  it("emits seconds.microseconds, not a bare integer", async () => {
    const { slackTs } = await import("@features/brain/server/ingest/slack");
    expect(slackTs("2026-08-29")).toMatch(/^\d+\.\d{6}$/);
  });

  it("is midnight UTC of the given day", async () => {
    const { slackTs, tsDate } = await import("@features/brain/server/ingest/slack");
    expect(tsDate(slackTs("2026-08-29"))).toBe("2026-08-29");
  });
});

describe("slackTs must never emit NaN", () => {
  it("returns empty for a malformed day rather than 'NaN.000000'", async () => {
    // `ch:all-loveiq:2026-08-24#2` is a real source_id shape (a split day). Feeding
    // its raw third segment to Date.parse yields NaN, and Slack answers
    // `invalid_ts_oldest` for the entire channel.
    const { slackTs } = await import("@features/brain/server/ingest/slack");
    expect(slackTs("2026-08-24#2")).toBe("");
    expect(slackTs("not-a-date")).toBe("");
  });
});

describe("the nightly pass must be incremental, not a full re-walk", () => {
  /**
   * Measured before the fix: one full pass took 266 SECONDS against the cron's
   * 38-second budget, because every channel's whole history was fetched and only
   * discarded at write time. In production that meant the nightly reached one
   * channel of nine, wrote nothing, and still reported success. After: 6.5s,
   * complete.
   *
   * These assert the two rules that make it correct, on the real source, because
   * the failure mode is silence rather than an error.
   */
  it("bounds the fetch by day, and ignores part-chunks when choosing that bound", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("features/brain/server/ingest/slack.ts", "utf8")
    );
    // `oldest` must be sent, or the walk is unbounded.
    expect(src).toMatch(/\.\.\.\(oldest \? \{ oldest \} : \{\}\)/);
    // and the bound must be computed from BASE ids only.
    expect(src).toMatch(/!id\.includes\("#"\) && !done/);
  });

  it("treats a stale part of a current day as an orphan, so the sweep takes it", async () => {
    // A day rewritten shorter leaves `…#3`, `…#4` behind on an old builder version.
    // Touching them kept them alive AND dragged the fetch bound back months, which
    // blocked the very sweep that would have removed them — a loop that fed itself.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("features/brain/server/ingest/slack.ts", "utf8")
    );
    expect(src).toMatch(/known\.get\(id\) === false && known\.get\(id\.slice\(0, hash\)\) === true/);
    expect(src).toMatch(/!isOrphanPart\(id\)/);
  });

  it("refuses to start when the shared clock is already spent", async () => {
    // Without this it made zero history calls, confirmed all existing rows, and
    // returned rows>0 with no `skipped` — so the cron's zero-rows alert never fired.
    process.env.SLACK_BRAIN_BOT_TOKEN = "xoxb-test";
    const { ingestSlack } = await import("@features/brain/server/ingest/slack");
    await expect(ingestSlack("2026-08-29T00:00:00Z", () => true)).resolves.toMatchObject({
      rows: 0,
      skipped: "slack-time-budget",
    });
  });

  it("never sleeps past the deadline when Slack rate-limits it", async () => {
    // Retry-After can be 30s. Honouring it blindly turned a 4s pass into 40s and
    // blew the budget on a single thread.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("features/brain/server/ingest/slack.ts", "utf8")
    );
    expect(src).toMatch(/rate limited with no clock left, deferring/);
  });
});
