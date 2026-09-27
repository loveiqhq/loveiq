import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  sweepScope,
  chatName,
  dayRows,
  detectDayFirst,
  looksLikeWhatsAppExport,
  parseWhatsApp,
  whatsappRows,
  groupQuietDays,
  dayFingerprint,
  daysToWrite,
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

  it("leaves room for the head on EVERY part, so no part loses the end of its last message", () => {
    // The head was added to parts 2+ AFTER splitting, so they ran past 2,400 and the writer
    // cut them (a stored part sat at exactly 2,400). The fixture above never got that long.
    const at = 1_754_460_000_000;
    const rows = dayRows({
      source: "whatsapp",
      idBase: "wa:test",
      chat: "LoveIQ",
      url: null,
      stampedAt: STAMP,
      messages: Array.from({ length: 200 }, (_, i) => ({
        day: "2026-08-06",
        time: "09:12",
        sender: "Marcus",
        text: `message ${i} ends here${"x".repeat(i % 7 === 0 ? 300 : 40)}`,
        at: at + i * 1000,
      })),
    });
    expect(rows.length).toBeGreaterThan(2);
    for (const r of rows) {
      expect(r.body.length).toBeLessThanOrEqual(2400);
      expect(r.body.startsWith("WhatsApp: LoveIQ — 2026-08-06 09:12\nBetween: Marcus\n\n")).toBe(
        true
      );
    }
    // Every message survives, in order, with nothing cut from any part's end.
    const all = rows.map((r) => r.body.split("\n\n").slice(1).join("\n\n")).join("\n");
    for (let i = 0; i < 200; i += 1) expect(all).toContain(`message ${i} ends here`);
  });

  it("writes a one-part day exactly as before, so its fingerprint does not change", () => {
    const rows = dayRows({
      source: "whatsapp",
      idBase: "wa:test",
      chat: "LoveIQ",
      url: null,
      stampedAt: STAMP,
      messages: [
        { day: "2026-08-06", time: "09:12", sender: "Marcus", text: "hi", at: 1 },
        { day: "2026-08-06", time: "09:13", sender: "Mark", text: "hello", at: 60_001 },
      ],
    });
    expect(rows[0]!.body).toBe(
      "WhatsApp: LoveIQ — 2026-08-06 09:12\nBetween: Marcus, Mark\n\nMarcus (09:12): hi\nMark (09:13): hello"
    );
  });

  /**
   * The laptop script runs its logic at import, so it cannot be driven from a test. This is
   * a tripwire on the three lines that matter, so a refactor cannot drop them unseen: the
   * scoped sweep (an unscoped one deleted older days), the read timeout (a hung read
   * blocked every run for 7.5 hours) and freshness from every kind of message.
   */
  it("the laptop script keeps the scoped sweep, the read timeout and the any-message freshness", () => {
    const script = readFileSync(join(process.cwd(), "scripts/whatsapp-sync.ts"), "utf8");
    expect(script).toContain(
      'sweepMissing("whatsapp", current, { scopeKey: "day", walkedScopes: scope.days })'
    );
    expect(script).toContain("timeout: 120_000");
    expect(script).toMatch(/select max\(ZMESSAGEDATE\) as ts from ZWAMESSAGE where ZCHATSESSION/);
  });

  it("sweeps only days this run read, so a freshly linked copy cannot delete older days", () => {
    const parts = [
      { source_id: "wa:g#wa-2026-09-27-0900", meta: { day: "2026-09-27" } },
      { source_id: "wa:g#wa-2026-09-26-1000", meta: { day: "2026-09-26" } },
    ];
    // An old day this read did not reach is not a reason to sweep.
    expect(
      sweepScope(["wa:g#wa-2025-11-11-0609", ...parts.map((p) => p.source_id)], parts)
    ).toEqual({
      needed: false,
      days: new Set(["2026-09-27", "2026-09-26"]),
    });
    // A read day with a part it no longer produces is.
    expect(sweepScope(["wa:g#wa-2026-09-26-1000-2"], parts).needed).toBe(true);
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

describe("groupQuietDays", () => {
  const NOW = Date.parse("2026-09-26T12:00:00Z");
  it("counts days since the group's newest message", () => {
    expect(groupQuietDays([NOW - 9 * 86_400_000, NOW - 2 * 86_400_000], NOW)).toBe(2);
    expect(groupQuietDays([NOW - 3 * 86_400_000, Number.NaN], NOW)).toBe(3);
  });

  it("calls a group with no readable message silent forever, not fresh", () => {
    expect(groupQuietDays([Number.NaN], NOW)).toBe(Infinity);
    expect(groupQuietDays([], NOW)).toBe(Infinity);
  });
});

describe("writing only the days that changed", () => {
  const part = (over: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) =>
    ({
      source: "whatsapp",
      source_id: "wa:g#wa-2026-09-26",
      title: "WhatsApp: LoveIQ — 2026-09-26",
      url: null,
      body: "[09:00] Mark: shipped",
      meta: { day: "2026-09-26", messages: 1, speakers: ["Mark"], ...meta },
      updated_at: "2026-09-27T07:00:00Z",
      period_end: "2026-09-26",
      ...over,
    }) as never;

  it("fingerprints what a day holds, never when it was written", () => {
    const fp = dayFingerprint(part(), ["Mark Oldenburg"]);
    expect(dayFingerprint(part({ updated_at: "2026-09-27T07:05:00Z" }), ["Mark Oldenburg"])).toBe(
      fp
    );
    expect(dayFingerprint(part({ body: "[09:00] Mark: shipped it" }), ["Mark Oldenburg"])).not.toBe(
      fp
    );
    expect(dayFingerprint(part({}, { messages: 2 }), ["Mark Oldenburg"])).not.toBe(fp);
    // A registry change that names someone new rewrites the day.
    expect(dayFingerprint(part(), ["Mark Oldenburg", "Fatih Hadzic"])).not.toBe(fp);
    expect(dayFingerprint(part(), undefined)).not.toBe(fp);
  });

  it("writes new and changed days, and skips the ones already stored as they are", () => {
    const same = { source_id: "a", meta: { fingerprint: "x" } };
    const moved = { source_id: "b", meta: { fingerprint: "y2" } };
    const fresh = { source_id: "c", meta: { fingerprint: "z" } };
    const unmarked = { source_id: "d", meta: { fingerprint: "w" } };
    const stored = new Map<string, string | null>([
      ["a", "x"],
      ["b", "y1"],
      ["d", null], // written before fingerprints existed
    ]);
    expect(daysToWrite([same, moved, fresh, unmarked], stored).map((r) => r.source_id)).toEqual([
      "b",
      "c",
      "d",
    ]);
  });
});
