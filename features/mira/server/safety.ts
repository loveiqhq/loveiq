import miraConfig from "../content/mira-config.json";
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
 * cards. It becomes the source tags under her answer, linked to each paper's public page. And
 * the markers her instructions ask for (prompt.ts, "MARKERS FOR THE APP"): [[ASK:id]] when she
 * asks an intake question (its answers become buttons), [[REFER]] when she suggests a therapist
 * or doctor, and [[TOPIC:id]] on a new chat's first reply. Any [[…]] marker is removed, known or
 * not, so none can reach the screen.
 */

// Matched against normalise(text): lower case, straight apostrophes, single spaces, no accents.
const CRISIS_PATTERNS: RegExp[] = [
  // English. "I could kill myself" may be a joke, but the words are too plain to risk.
  /\bkill(ing)? my ?self\b/,
  /\bsuicid/, // suicide, suicidal; also Spanish suicidarme, suicidio and French me suicider
  /\bend(ing)? (my|my own) life\b/,
  /\bend(ing)? it all\b(?! with\b)/, // not a break-up: "end it all with him"
  // Not "take my life back" or "take my life in a new direction".
  /\btak(e|ing) my (own )?life\b(?! (back|in|into|forward|over|to|more|less|seriously)\b)/,
  // Not "I wanted to die of embarrassment", "…die from shame", "…die when he saw me".
  /\b(want(ed)? to|wanna) die\b(?! (of|from|when|if|because|laughing)\b)/,
  // Not "I don't want to live with this shame"; "live like this" stays a crisis.
  /\b(don'?t|do not) want to (live|be alive)\b(?! (with|in|through|without|together)\b)/,
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
  /\bquiero morir(me)?\b(?! de\b)/, // not "me quiero morir de vergüenza"
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

export type ParsedReply = {
  text: string;
  crisis: boolean;
  sources: CitedSource[];
  /** The intake question the reply asks (an id from mira-config.json), if marked. */
  ask: string | null;
  /** The reply suggests a therapist, doctor or other professional. */
  refer: boolean;
  /** A new chat's topic (an id from mira-config.json's topics), if marked. */
  topic: string | null;
};

const INTAKE_IDS = new Set(miraConfig.intakeQuestions.map((q) => q.id));
const TOPIC_IDS = new Set(miraConfig.topics.map((t) => t.id));
/** Any [[…]] marker; its inside ("CRISIS", "ASK:onset") is read by markerOf. */
const MARKER = /\[\[([^[\]\n]{1,40})\]\]/g;

/** "ASK : Onset " → ["ASK", "onset"]; spaces and case forgiven. */
function markerOf(inside: string): [kind: string, value: string | null] {
  const [kind = "", value] = inside.split(":", 2).map((p) => p.trim());
  return [kind.toUpperCase(), value ? value.toLowerCase() : null];
}

function sourceLabel(card: EvidenceCard): string {
  const first = card.authors.split(",")[0]?.trim() || card.title;
  const surname = first.split(/\s+/)[0] ?? first;
  const etAl = card.authors.includes(",") ? " et al." : "";
  return `${surname}${etAl} (${card.year})`;
}

/** Strip the markers and the sources line; turn the cited ids into source tags. */
export function parseReply(raw: string): ParsedReply {
  let ask: string | null = null;
  let topic: string | null = null;
  let refer = false;
  let crisis = false;
  for (const [, inside] of raw.matchAll(MARKER)) {
    const [kind, id] = markerOf(inside!);
    if (kind === "CRISIS" && !id) crisis = true;
    else if (kind === "REFER" && !id) refer = true;
    else if (kind === "ASK" && id && INTAKE_IDS.has(id)) ask = id;
    else if (kind === "TOPIC" && id && TOPIC_IDS.has(id)) topic ??= id;
  }
  let text = raw.replace(MARKER, "");

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
  // A crisis reply is never also a coaching step: no answer buttons, no referral count.
  if (crisis) {
    ask = null;
    refer = false;
  }
  return {
    text: text
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    crisis,
    sources,
    ask,
    refer,
    topic,
  };
}
