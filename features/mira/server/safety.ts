import { cardById, type EvidenceCard } from "./cards";

/**
 * Two safety nets around the model, both deterministic.
 *
 * 1. CRISIS BEFORE THE MODEL. A message that plainly says the person may harm themselves gets a
 *    fixed, caring answer and the crisis panel, with no model call: a stop rail must never
 *    depend on a model reading it right (Sanjin's rails 13 to 15: stop coaching, give support
 *    lines). The list is deliberately narrow; subtler cases are the model's job (next point).
 * 2. CRISIS AFTER THE MODEL. Mira's instructions make her end a reply with the token [[CRISIS]]
 *    when a stop rail fires. The token never reaches the screen; it opens the crisis panel.
 *
 * Also here: the "Sources: [C17] [C20]" line Mira ends a reply with when she used evidence
 * cards. It becomes the source tags under her answer, linked to each paper's public page.
 */

const CRISIS_PATTERNS: RegExp[] = [
  /\bkill(ing)? my ?self\b/i,
  /\bsuicid(e|al)\b/i,
  /\bend(ing)? (my|it all|my own) life\b/i,
  /\b(want|wanted|going) to die\b/i,
  /\bdon'?t want to (live|be alive)\b/i,
  /\bself[- ]?harm/i,
  /\b(hurt|harm|cut|cutting) my ?self\b/i,
  /\boverdos(e|ing)\b/i,
];

export function isCrisisMessage(text: string): boolean {
  return CRISIS_PATTERNS.some((re) => re.test(text));
}

export const CRISIS_TOKEN = "[[CRISIS]]";

export type CitedSource = { id: string; label: string; link: string | null };

export type ParsedReply = { text: string; crisis: boolean; sources: CitedSource[] };

function sourceLabel(card: EvidenceCard): string {
  const first = card.authors.split(",")[0]?.trim() || card.title;
  const surname = first.split(/\s+/)[0] ?? first;
  const etAl = card.authors.includes(",") ? " et al." : "";
  return `${surname}${etAl} (${card.year})`;
}

/** Strip the crisis token and the sources line; turn the cited ids into source tags. */
export function parseReply(raw: string): ParsedReply {
  let text = raw;
  const crisis = text.includes(CRISIS_TOKEN);
  text = text.split(CRISIS_TOKEN).join("");

  const sources: CitedSource[] = [];
  // The last line made only of "Sources:" and card ids (no backtracking regex: line by line).
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = (lines.at(i) ?? "").trim();
    if (!/^sources?:/i.test(line)) continue;
    const rest = line
      .replace(/^sources?:/i, "")
      .replace(/\[[A-Z]\d{1,3}\]/g, "")
      .trim();
    if (rest !== "") break;
    const ids = [...line.matchAll(/\[([A-Z]\d{1,3})\]/g)].map((m) => m[1]!);
    for (const id of [...new Set(ids)]) {
      const card = cardById(id);
      // An id that is not one of our cards is dropped: a tag must always point at a real source.
      if (card) sources.push({ id, label: sourceLabel(card), link: card.link });
    }
    lines.splice(i, 1);
    text = lines.join("\n");
    break;
  }
  return { text: text.replace(/\n{3,}/g, "\n\n").trim(), crisis, sources };
}
