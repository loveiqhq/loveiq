/**
 * Block Kit builders and the limit guard.
 *
 * Slack silently 400s a whole message when any one of three caps is breached,
 * and this repo has learned each of them the hard way in the commit notifier:
 *
 *   - a section's text  > 3,000 chars   → 2026-08-21, a 3,033-char section
 *   - the whole message > ~40,000 chars → 2026-08-23, a 48,401-char payload
 *   - blocks            > 50
 *
 * The commit notifier now handles all three, but in Python inside
 * `.github/workflows/slack-commits.yml`. Nothing on the TypeScript side did, so
 * every `notifySlack({ blocks })` caller was one verbose field away from the same
 * failure. This is that guard, in TS.
 */

import type { SlackBlock } from "./slack";

/** Slack's hard caps. */
const SECTION_HARD_LIMIT = 3000;
const BLOCK_HARD_LIMIT = 50;
/** Each entry of a `fields` array has its OWN cap, separate from a section's text. */
const FIELD_HARD_LIMIT = 2000;
const MESSAGE_HARD_LIMIT = 40_000;

/** Our own ceilings, kept below Slack's so rounding and escaping can't tip us over. */
const SECTION_BUDGET = 2900;
const MESSAGE_BUDGET = 38_000;

/**
 * Render an identifier (a masked email, a token, an id) as a Slack code span.
 *
 * Do NOT run these through `escapeSlack`: it backslash-escapes `*` and `_`, and
 * Slack mrkdwn has no reliable backslash escape, so a masked address comes out as
 * the literal `e\\*\\*\\*@example.com`. Inside a code span the formatting
 * characters are already inert, so only the HTML trio needs escaping — and a
 * backtick in the input has to go, or it would close the span early and let the
 * rest of the value be interpreted as markup.
 */
export function codeSpan(value: string): string {
  const safe = value
    .replace(/`/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `\`${safe}\``;
}

export function section(text: string): SlackBlock {
  return { type: "section", text: { type: "mrkdwn", text } };
}

export function header(text: string): SlackBlock {
  // header blocks take plain_text only and cap at 150 chars — Slack rejects longer.
  return { type: "header", text: { type: "plain_text", text: text.slice(0, 150), emoji: true } };
}

export function context(text: string): SlackBlock {
  return { type: "context", elements: [{ type: "mrkdwn", text }] };
}

export function divider(): SlackBlock {
  return { type: "divider" };
}

/**
 * A row of labelled values rendered as Block Kit `fields` — Slack lays these out
 * in two columns, which is what makes an attribution block scannable rather than
 * a wall of lines. Slack allows at most 10 fields per section.
 */
export function fields(pairs: Array<{ label: string; value: string }>): SlackBlock {
  return {
    type: "section",
    fields: pairs.slice(0, 10).map(({ label, value }) => ({
      type: "mrkdwn",
      text: `*${label}*\n${value}`,
    })),
  };
}

/** A link button — today, "watch this person's session recording". */
export function linkButton(text: string, url: string): SlackBlock {
  return {
    type: "actions",
    elements: [{ type: "button", text: { type: "plain_text", text, emoji: true }, url }],
  };
}

/**
 * Clamp a single block to Slack's per-element caps.
 *
 * The two caps are different and must not be conflated: a section's `text` is
 * capped at 3,000 characters, while each entry in a `fields` array is capped at
 * 2,000 INDEPENDENTLY. Summing the fields and testing them against 3,000 (an
 * earlier version of this function) both flagged perfectly legal blocks and
 * failed to shorten anything, so it reported a trim it had not performed.
 */
function clampBlock(block: SlackBlock): { block: SlackBlock; changed: boolean } {
  let changed = false;
  let out = block;

  const t = block.text as { type?: string; text?: string } | undefined;
  if (typeof t?.text === "string" && t.text.length > SECTION_BUDGET) {
    out = { ...out, text: { ...t, text: `${t.text.slice(0, SECTION_BUDGET - 1)}\u2026` } };
    changed = true;
  }

  const f = block.fields as Array<{ type?: string; text?: string }> | undefined;
  if (Array.isArray(f)) {
    let fieldChanged = false;
    const clamped = f.map((field) => {
      if (typeof field.text === "string" && field.text.length > FIELD_HARD_LIMIT) {
        fieldChanged = true;
        return { ...field, text: `${field.text.slice(0, FIELD_HARD_LIMIT - 1)}\u2026` };
      }
      return field;
    });
    if (fieldChanged) {
      out = { ...out, fields: clamped };
      changed = true;
    }
  }

  return { block: out, changed };
}

/** Serialized size of the payload Slack will actually receive. */
function serializedSize(blocks: SlackBlock[], text: string): number {
  return JSON.stringify({ text, blocks }).length;
}

export interface FitResult {
  blocks: SlackBlock[];
  /** True when anything was dropped or shortened, so callers can log it. */
  trimmed: boolean;
  /** Final serialized size, for logging — the number that matters on a 400. */
  size: number;
}

/**
 * Make a block list safe to send. Shed in priority order: over-long sections are
 * truncated first, then whole blocks are dropped from the END, so the header and
 * the highest-value content survive. Never silently truncates without saying so —
 * a dropped-detail notice replaces what was removed.
 *
 * `text` is the fallback string and counts toward the message budget, so it is
 * required here rather than added later.
 */
export function fitBlocks(input: SlackBlock[], text: string): FitResult {
  let trimmed = false;

  // 1. Per-element caps: section text, and each field independently.
  let blocks = input.map((block) => {
    const { block: clamped, changed } = clampBlock(block);
    if (changed) trimmed = true;
    return clamped;
  });

  // 2. Block count, and 3. whole-message size. Keep from the front; the first
  // block is the header and is always kept even if it alone is over budget
  // (Slack would reject an empty blocks array, and a header is tiny).
  if (blocks.length > BLOCK_HARD_LIMIT || serializedSize(blocks, text) > MESSAGE_BUDGET) {
    const notice = section("_…some detail omitted to fit Slack's message limit._");
    const kept: SlackBlock[] = blocks.length > 0 ? [blocks[0]!] : [];
    for (const block of blocks.slice(1)) {
      // reserve room for the notice we may need to append
      if (kept.length >= BLOCK_HARD_LIMIT - 1) break;
      if (serializedSize([...kept, block, notice], text) > MESSAGE_BUDGET) break;
      kept.push(block);
    }
    if (kept.length < blocks.length) {
      trimmed = true;
      kept.push(notice);
    }
    blocks = kept;
  }

  return { blocks, trimmed, size: serializedSize(blocks, text) };
}
