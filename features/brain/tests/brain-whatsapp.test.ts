import { describe, expect, it } from "vitest";

import {
  chatName,
  dayRows,
  detectDayFirst,
  looksLikeWhatsAppExport,
  parseWhatsApp,
  whatsappRows,
} from "@features/brain/server/ingest/whatsapp";

const STAMP = "2026-08-31T00:00:00.000Z";

// A real iOS export: leading LRM mark, bracketed timestamp, seconds.
const IOS_EXPORT = [
  "‎[06/08/2026, 09:12:04] Messages and calls are end-to-end encrypted.",
  "‎[06/08/2026, 09:12:31] Marcus: Should the report be 39.99?",
  "[06/08/2026, 09:13:02] Eman: I think so, the 29 arm underperformed",
  "[06/08/2026, 09:13:40] Marcus: Agreed. Let's ship it Monday",
  "[07/08/2026, 11:02:00] Eman: Shipped.",
  "‎[07/08/2026, 11:02:10] Eman: <attached: photo.jpg>",
].join("\n");

// Android has no brackets and uses " - " before the sender.
const ANDROID_EXPORT = [
  "06/08/2026, 09:12 - Marcus: Should the report be 39.99?",
  "06/08/2026, 09:13 - Eman: I think so",
  "06/08/2026, 09:14 - Marcus: Agreed",
].join("\n");

describe("looksLikeWhatsAppExport", () => {
  it("recognises both phone formats", () => {
    expect(looksLikeWhatsAppExport(IOS_EXPORT)).toBe(true);
    expect(looksLikeWhatsAppExport(ANDROID_EXPORT)).toBe(true);
  });

  it("does not claim an ordinary document", () => {
    // A meeting note or a CSV must keep the normal Drive path.
    expect(looksLikeWhatsAppExport("Notes\n\nWe agreed to ship the paywall on 06/08/2026.")).toBe(
      false
    );
  });
});

describe("detectDayFirst — the ambiguity that silently misfiles months", () => {
  /**
   * WhatsApp writes the exporting phone's locale with no marker, so `06/08` is the
   * 6th of August in most of the world and the 8th of June in the US. Guessing
   * wrong files half a year of messages under the wrong months, silently.
   */
  it("reads day-first when a first component exceeds 12", () => {
    expect(detectDayFirst(["[13/08/2026, 09:00:00] A: hi"])).toBe(true);
  });

  it("reads month-first when a SECOND component exceeds 12", () => {
    expect(detectDayFirst(["[08/13/2026, 09:00:00] A: hi"])).toBe(false);
  });

  it("falls back to day-first when every date is ambiguous", () => {
    expect(detectDayFirst(["[06/08/2026, 09:00:00] A: hi"])).toBe(true);
  });
});

describe("parseWhatsApp", () => {
  it("keeps who said what, and drops the encryption notice", () => {
    const msgs = parseWhatsApp(IOS_EXPORT);
    expect(msgs.map((m) => m.sender)).toEqual(["Marcus", "Eman", "Marcus", "Eman"]);
    expect(msgs.some((m) => /end-to-end/.test(m.text))).toBe(false);
  });

  it("drops an attachment placeholder, which carries no information", () => {
    expect(parseWhatsApp(IOS_EXPORT).some((m) => /attached/.test(m.text))).toBe(false);
  });

  it("joins a wrapped message back onto the line it belongs to", () => {
    const msgs = parseWhatsApp(
      "[06/08/2026, 09:12:31] Marcus: first line\nsecond line\n[06/08/2026, 09:13:00] Eman: next"
    );
    expect(msgs[0]!.text).toBe("first line\nsecond line");
    expect(msgs).toHaveLength(2);
  });

  it("parses the Android shape too", () => {
    expect(parseWhatsApp(ANDROID_EXPORT)).toHaveLength(3);
  });
});

describe("whatsappRows — one chunk per DAY", () => {
  it("splits by conversation and dates each chunk with the day it happened", () => {
    const rows = whatsappRows("f1", "WhatsApp Chat with LoveIQ Team.txt", null, IOS_EXPORT, STAMP);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.period_end)).toEqual(["2026-08-06", "2026-08-07"]);
    // The time is in the title because one group covers every topic: a whole day
    // in one chunk blurs the embedding and gives the title no topical word to match.
    expect(rows[0]!.title).toBe("WhatsApp: LoveIQ Team — 2026-08-06 09:12");
  });

  it("starts a new chunk after a long silence, not only at midnight", () => {
    /**
     * A day of one group chat is not one subject. Measured on the real group:
     * chunking per day put pricing, a bug report and a lunch plan in one body, and
     * of three questions whose answers were demonstrably in the chat only one
     * retrieved it. A 45-minute gap ends a conversation.
     */
    const morning = 1_754_460_000_000; // fixed epoch ms, no clock dependency
    const msg = (at: number, text: string) => ({
      day: "2026-08-06",
      time: new Date(at).toISOString().slice(11, 16),
      sender: "Marcus",
      text,
      at,
    });
    const rows = dayRows({
      source: "whatsapp",
      idBase: "wa:test",
      chat: "LoveIQ",
      url: null,
      stampedAt: STAMP,
      messages: [
        msg(morning, "morning topic about pricing"),
        msg(morning + 60_000, "still the same conversation"),
        msg(morning + 3 * 3_600_000, "hours later, a totally different subject"),
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.body).toContain("pricing");
    expect(rows[1]!.body).toContain("different subject");
  });

  it("splits a very long conversation, because the writer clamps bodies at 2400", () => {
    // Found in production: upsertChunks truncates silently, so an unsplit busy day
    // simply lost its later messages with no error and no log.
    const at = 1_754_460_000_000;
    const rows = dayRows({
      source: "whatsapp",
      idBase: "wa:test",
      chat: "LoveIQ",
      url: null,
      stampedAt: STAMP,
      messages: Array.from({ length: 60 }, (_, i) => ({
        day: "2026-08-06",
        time: "09:12",
        sender: "Marcus",
        text: `a reasonably long sentence about the report and the paywall number ${i}`,
        at: at + i * 1000,
      })),
    });
    expect(rows.length).toBeGreaterThan(1);
    for (const r of rows) expect(r.body.length).toBeLessThanOrEqual(2400);
  });

  /**
   * The ranker collapses a document to ONE row when `meta.part` is set — right for a
   * long PDF, wrong here. Each day is its own conversation and has to stay
   * separately findable, so `part` must be absent while the `#` in the id still lets
   * the Drive sweep track these alongside the file they came from.
   */
  it("does not set meta.part, or every day would collapse into one result", () => {
    const rows = whatsappRows("f1", "WhatsApp Chat with LoveIQ Team.txt", null, IOS_EXPORT, STAMP);
    for (const r of rows) expect((r.meta as { part?: number }).part).toBeUndefined();
    expect(rows[0]!.source_id.startsWith("doc:f1#")).toBe(true);
  });

  it("records who spoke that day, so 'who raised pricing' is answerable", () => {
    const rows = whatsappRows("f1", "WhatsApp Chat with LoveIQ Team.txt", null, IOS_EXPORT, STAMP);
    expect(rows[0]!.body).toContain("Between: Marcus, Eman");
    expect(rows[0]!.body).toContain("39.99");
  });

  it("returns nothing for a file with no parseable messages", () => {
    expect(whatsappRows("f1", "notes.txt", null, "just some prose", STAMP)).toEqual([]);
  });

  it("strips WhatsApp's filename boilerplate from the chat name", () => {
    expect(chatName("WhatsApp Chat with LoveIQ Team.txt")).toBe("LoveIQ Team");
  });
});
