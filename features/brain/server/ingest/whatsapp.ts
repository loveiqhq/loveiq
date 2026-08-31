/**
 * WhatsApp chat exports, dropped into Drive.
 *
 * WHY AN EXPORT AND NOT AN API. There is no way to read an existing WhatsApp group
 * programmatically. Meta's Groups API (2026) only covers groups the BUSINESS
 * created, capped at 8 members; the unofficial libraries that can read a real group
 * work by impersonating a linked device, which breaks WhatsApp's terms and gets the
 * number banned. Neither is acceptable for a group we want to keep.
 *
 * So the path is the one WhatsApp itself supports: "Export chat → Without media"
 * produces a .txt, which goes in Drive and is picked up by the Drive ingester like
 * any other text file. Overwrite the SAME Drive file to refresh it and the chunks
 * update in place, because the chunk id is the Drive file id.
 *
 * WITHOUT THIS PARSER an export lands as anonymous 2,400-character slices with the
 * file's modified date on every one — so "what did we decide in July" cannot work,
 * because no chunk knows which day it covers. This cuts the export into one chunk
 * per DAY with the real date and the people who spoke, the same shape the Slack
 * ingester produces.
 */

import { splitBody } from "./notion";
import type { BrainRow } from "./upsert";

/** iOS: `[06/08/2026, 14:23:11] Marcus: text` — the leading mark is WhatsApp's own. */
const IOS =
  /^‎?\[(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*([AP]M)?\]\s*([^:]{1,60}?):\s?([\s\S]*)$/i;
/** Android: `06/08/2026, 14:23 - Marcus: text` */
const ANDROID =
  /^‎?(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*([AP]M)?\s+-\s+([^:]{1,60}?):\s?(.*)$/i;
/** A timestamped line with no `Sender:` at all — "Messages are end-to-end encrypted". */
const SYSTEM = /^‎?\[?\d{1,2}[/.]\d{1,2}[/.]\d{2,4},\s+\d{1,2}:\d{2}/;

export interface WaMessage {
  day: string;
  time: string;
  sender: string;
  text: string;
  /** Epoch ms. Used to split a chat into conversations; optional for the export path. */
  at?: number;
}

/**
 * Is the first component the DAY or the MONTH?
 *
 * WhatsApp writes the exporting phone's locale with no marker, so `06/08` is the
 * 6th of August in most of the world and the 8th of June in the US. Guessing wrong
 * silently files half a year of messages under the wrong months.
 *
 * The file itself settles it: any first component above 12 can only be a day, and
 * any second component above 12 can only be a month. Whichever appears first wins;
 * if neither ever does — a short export where every date is ambiguous — day-first
 * is the safer default, being what most of the world produces.
 */
export function detectDayFirst(lines: string[]): boolean {
  for (const line of lines) {
    const m = IOS.exec(line) ?? ANDROID.exec(line);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12) return true;
    if (b > 12) return false;
  }
  return true;
}

function isoDay(a: number, b: number, yearRaw: number, dayFirst: boolean): string | null {
  const day = dayFirst ? a : b;
  const month = dayFirst ? b : a;
  const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function looksLikeWhatsAppExport(text: string): boolean {
  const lines = text.split(/\r?\n/).slice(0, 60);
  let hits = 0;
  for (const l of lines) if (IOS.test(l) || ANDROID.test(l)) hits += 1;
  // Three timestamped "Sender: text" lines in the first sixty is a shape nothing
  // else in Drive produces, and one stray line in a normal document will not reach it.
  return hits >= 3;
}

export function parseWhatsApp(text: string): WaMessage[] {
  const lines = text.split(/\r?\n/);
  const dayFirst = detectDayFirst(lines);
  const out: WaMessage[] = [];

  for (const line of lines) {
    const m = IOS.exec(line) ?? ANDROID.exec(line);
    if (m) {
      const day = isoDay(Number(m[1]), Number(m[2]), Number(m[3]), dayFirst);
      if (!day) continue;
      const body = (m[7] ?? "").trim();
      // "<Media omitted>" and friends carry no information worth indexing.
      if (!body || /^‎?<[^>]+>$/.test(body)) continue;
      out.push({ day, time: (m[4] ?? "").slice(0, 5), sender: (m[6] ?? "").trim(), text: body });
      continue;
    }
    // A line with a timestamp but no sender is a system notice; drop it. Anything
    // else is the continuation of the previous message, which WhatsApp wraps freely.
    if (SYSTEM.test(line)) continue;
    const prev = out[out.length - 1];
    if (prev && line.trim()) prev.text += `\n${line.trim()}`;
  }
  return out;
}

/** The chat's name, from the export's filename. */
export function chatName(fileName: string): string {
  return fileName
    .replace(/\.txt$/i, "")
    .replace(/^WhatsApp Chat (?:with )?/i, "")
    .trim();
}

/**
 * One chunk per DAY, like Slack.
 *
 * `meta.part` is deliberately NOT set. The ranker collapses a document to a single
 * row when `part` is present, which is right for a long PDF and wrong here: each day
 * is its own conversation and has to stay separately findable. The `#` in the id is
 * still what lets the Drive sweep track these alongside the file they came from.
 */
export interface DayRowInput {
  /** `drive` for an exported .txt sitting in Drive, `whatsapp` for the live desktop read. */
  source: string;
  /** Id prefix the day is appended to, e.g. `doc:<fileId>` or `wa:<groupJid>`. */
  idBase: string;
  chat: string;
  url: string | null;
  messages: WaMessage[];
  stampedAt: string;
}

/**
 * One chunk per DAY, like Slack.
 *
 * `meta.part` is deliberately NOT set. The ranker collapses a document to a single
 * row when `part` is present, which is right for a long PDF and wrong here: each day
 * is its own conversation and has to stay separately findable. The `#` in the id is
 * still what lets a sweep track these alongside whatever they came from.
 *
 * Shared by both readers so an exported file and the live desktop read produce the
 * same shape — otherwise the same conversation would look like two different sources.
 */
export function dayRows(input: DayRowInput): BrainRow[] {
  const { source, idBase, chat, url, messages, stampedAt } = input;
  if (messages.length === 0) return [];

  /**
   * GROUP BY CONVERSATION, NOT BY CALENDAR DAY.
   *
   * A day of one group chat is not one subject. Chunking per day produced a body
   * covering pricing, a bug report and a lunch plan at once — which blurs the
   * embedding until it is close to nothing in particular, and leaves a title
   * ("WhatsApp: LoveIQ — 2026-08-30") carrying no topical word for the lexical arm
   * to match either. Measured: of three questions whose answers were demonstrably
   * in the chat, only one retrieved it.
   *
   * Slack gets away with a day-chunk because a channel is already topic-scoped. One
   * WhatsApp group is every topic the company has, so the split has to come from the
   * conversation itself: a gap of `GAP_MINUTES` ends one and starts the next.
   */
  const GAP_MINUTES = 45;
  const bursts: WaMessage[][] = [];
  for (const m of messages) {
    const last = bursts[bursts.length - 1];
    const prev = last?.[last.length - 1];
    const newDay = !prev || prev.day !== m.day;
    const gap = prev?.at != null && m.at != null ? m.at - prev.at > GAP_MINUTES * 60_000 : false;
    if (!last || newDay || gap) bursts.push([m]);
    else last.push(m);
  }

  return bursts.flatMap((msgs) => {
    const day = msgs[0]!.day;
    const from = msgs[0]!.time;
    const speakers = [...new Set(msgs.map((m) => m.sender).filter(Boolean))];
    const title = `WhatsApp: ${chat} — ${day} ${from}`;
    const head = [title, `Between: ${speakers.join(", ")}`, ""];
    const full = [...head, ...msgs.map((m) => `${m.sender} (${m.time}): ${m.text}`)].join("\n");

    /**
     * Still split on length as well: `upsertChunks` clamps every body to 2,400
     * characters, and a long unbroken conversation was being truncated on write
     * with no error and no log — the messages simply vanished.
     */
    const parts = splitBody(full);
    return parts.map((body, i) => ({
      source,
      source_id: `${idBase}#wa-${day}-${from.replace(":", "")}${i === 0 ? "" : `-${i + 1}`}`,
      title: parts.length > 1 ? `${title} (${i + 1}/${parts.length})` : title,
      url,
      body: i === 0 ? body : [...head, body].join("\n"),
      meta: {
        kind: "whatsapp-chat",
        chat,
        day,
        speakers: speakers.slice(0, 12),
        messages: msgs.length,
      },
      updated_at: stampedAt,
      period_end: day,
    })) satisfies BrainRow[];
  });
}

/** The Drive path: an exported .txt, parsed then chunked by day. */
export function whatsappRows(
  fileId: string,
  fileName: string,
  webViewLink: string | null,
  text: string,
  stampedAt: string
): BrainRow[] {
  return dayRows({
    source: "drive",
    idBase: `doc:${fileId}`,
    chat: chatName(fileName),
    url: webViewLink,
    messages: parseWhatsApp(text),
    stampedAt,
  });
}
