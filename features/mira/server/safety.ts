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

// Matched against normalise(text): lower case, straight apostrophes, single spaces, no accents.
const CRISIS_PATTERNS: RegExp[] = [
  // English. "I could kill myself" may be a joke, but the words are too plain to risk.
  /\bkill(ing)? my ?self\b/,
  /\bsuicid/, // suicide, suicidal; also Spanish suicidarme, suicidio and French me suicider
  /\bend(ing)? (my|my own) life\b/,
  /\bend(ing)? it all\b(?! with\b)/, // not a break-up: "end it all with him"
  // Not "take my life back" or "take my life in a new direction".
  /\btak(e|ing) my (own )?life\b(?! (back|in|into|forward|over|to)\b)/,
  /\b(want(ed)? to|wanna) die\b(?! of\b)/, // not "I wanted to die of embarrassment"
  /\b(don'?t|do not) want to (live|be alive)\b/,
  // Only where the sentence ends there: not "I don't want to wake up next to him like this".
  /\b(don'?t|do not) want to wake up( again| anymore| tomorrow)?(?= ?[^ a-z0-9]|$)/,
  /\bbetter off dead\b/,
  /\bwish i (was|were) dead\b/,
  /\b(no reason to live|nothing (left )?to live for)\b/,
  /\b(want(ed)? to|wanna|wish i could) disappear forever\b/, // never "disappear" alone
  /\bself[- ]?harm/,
  /\b(hurt|hurting|harm|harming|cut|cutting) my ?self\b/,
  // An overdose taken or of pills, never the word alone ("an overdose of romance").
  /\b(take|took|taking|taken) an overdose\b/,
  /\boverdos(e|ed|ing) on\b.{0,20}\b(pills|meds|medication|tablets|painkillers)\b/,
  // German
  /\b(will|mochte|mag) nicht mehr leben\b/,
  /\b(will|mochte) sterben\b/,
  /\bmich (umbringen|toten)\b/,
  /\bbringe? mich um\b/,
  /\bselbstmord/,
  /\bsuizid/,
  // Spanish
  /\bquiero morir/,
  /\bno quiero vivir\b/,
  /\b((quiero|voy a) matarme|me quiero matar)\b/,
  // French
  /\b(envie de|veux) mourir\b/,
  /\b(ne veux plus|plus envie de) vivre\b/,
  /\b(vais|veux|envie de) me tuer\b/,
  // Bosnian, Croatian, Serbian (often typed without č, ć, š, ž)
  /\b(ubiti se|se ubiti|da se ubijem|ubit cu se|ubicu se)\b/,
  /\b(zelim|hocu) (da )?umr(ij)?e(ti|m)\b/,
  /\bsamoub(istv|ojstv)/,
  /\bne zelim (vise )?(zivjeti|ziveti|da zivim)\b/,
];

/** So "I don’t  want to Live" and "ne zelim zivjeti" match like their tidy spellings. */
function normalise(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function isCrisisMessage(text: string): boolean {
  const plain = normalise(text);
  return CRISIS_PATTERNS.some((re) => re.test(plain));
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
