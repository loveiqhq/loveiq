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
 * or doctor, [[TOPIC:id]] on a new chat's first reply, and [[MINOR]] when the person says they
 * are under 18 (rail 15; the chat route then stops for good, server/minor.ts). Any [[…]] marker
 * is removed, known or not, so none can reach the screen.
 */

// Matched against normalise(text): lower case, straight apostrophes, single spaces, no accents
// (so Russian "й" is "и" here and Arabic "أ" is "ا"). Each one is narrow on purpose: a crisis
// word in a joke or an idiom ("die of embarrassment") is the model's call, not this list's.
const CRISIS_PATTERNS: RegExp[] = [
  // English. "I could kill myself" may be a joke, but the words are too plain to risk.
  /\bkill?(ing)? my ?s(el|le)f\b/, // also "kil myself", "kill myslef"
  // "kms" (kill myself) as a word, never kilometres: "10 kms", "the last few kms", "kms away".
  /(?<!(\d|\b(few|many|several|some|more|extra|the|those|these|of)) ?)\bkms\b(?! ?(away|per|an? (hour|day))\b| ?\/)/,
  /\bunaliv(e|ed|es|ing) (my ?self|me)\b/,
  // suicide, suicidal and the typos suicde, sucide, suiside; also Spanish suicidarme, French
  // me suicider, Italian suicidarmi, Portuguese suicidar. "sewerslide" is the same word disguised.
  /\b(su(i?cid|icd|isid)|sewer ?slide)/,
  /\bend(ing)? (my|my own) life\b/,
  /\bend(ing)? it all\b(?! with\b)/, // not a break-up: "end it all with him"
  // "I'm going to end it tonight", but not "…end it tonight with him".
  /\b((going to|gonna|want to|wanna|will|i'?ll|about to|ready to|plan(ning)? to|decided to) end|(i'm|i am) ending) (it|everything)( all)? (tonight|today|now)\b(?! with\b)/,
  // Not "take my life back" or "take my life in a new direction".
  /\btak(e|ing) my (own )?life\b(?! (back|in|into|forward|over|to|more|less|seriously)\b)/,
  // Not "I wanted to die of embarrassment", "…die from shame", "…die when he saw me".
  /\b(want(ed)? to|wanna) die\b(?! (of|from|when|if|because|laughing)\b)/,
  // Not "I don't want to live with this shame"; "live like this" stays a crisis.
  /\b(don'?t|do not) want to (live|be alive)\b(?! (with|in|through|without|together)\b)/,
  // Only where the sentence ends there: not "I don't want to wake up next to him like this".
  /\b(don'?t|do not) want to wake up( again| anymore| tomorrow)?(?= ?[^ a-z0-9]|$)/,
  /\b(go to sleep|fall asleep|sleep) and (never|not) wake up\b/,
  // With "anymore" only: not "I don't want to be here" or "…to be around him anymore".
  /\b(don'?t|do not) want to be (here|around) (any ?more|any longer)\b/,
  /\bbetter off (dead|without me)\b/,
  /\bwish i (was|were) dead\b/,
  /\b(no reason to (live|keep living|be alive)|nothing (left )?to live for)\b/,
  /\bno point (in )?(living|being alive)\b(?! (with|in|through|together)\b)/, // not "…with him"
  /\b(want(ed)? to|wanna|wish i could) disappear forever\b/, // never "disappear" alone
  /\bself[- ]?harm/,
  /\b(hurt|hurting|harm|harming|cut|cutting) my ?self\b/,
  // "I've been cutting (again)", never "cutting carbs", "cutting back" or "cutting my hair".
  /\bi('ve|ve| have)? (been |started )?cutting( again\b| (my )?(arms?|legs?|wrists?|thighs?|skin)\b|(?= ?[^ a-z0-9]|$))/,
  // An overdose taken, wanted or of pills, never the word alone ("an overdose of romance",
  // "I overdosed on chocolate").
  /\b(take|took|taking|taken) an overdose\b/,
  /\boverdos(e|ed|ing) on\b.{0,20}\b(pills|meds|medication|tablets|painkillers)\b/,
  /\b(want(ed)? to|wanna|going to|gonna|tried to|trying to|try to|plan(ning)? to|about to|thinking (about|of)|think about) overdos(e|ing)\b(?! on\b)/,
  /\bi('ve| have| had)? (just |once |already |nearly |almost )?overdosed\b(?! on\b)/,
  // "I took all my pills", but not "…all my pills on time".
  /\b(took|swallowed|(going to|gonna|want to|wanna|about to|will|i'?ll) (take|swallow)) all (of )?(my|the) (sleeping )?(pills|meds|medication|tablets|painkillers)\b(?! (on time|as prescribed|every day|correctly|regularly)\b)/,
  // German. "Ich will nicht mehr" only where the sentence ends: not "…nicht mehr warten".
  /\b(will|mochte|mag) nicht mehr leben\b/,
  /\bich will (einfach |echt |wirklich )?nicht mehr(?= ?[^ a-z0-9]|$)/,
  /\b(will|mochte) (sterben|tot sein)\b/,
  /\bware (lieber|besser) tot\b/,
  /\bmich (umbringen|toten)\b/,
  /\bbringe? mich um\b/,
  /\b(mir das leben (zu )?nehmen|nehme mir das leben)\b/,
  /\b(ritze mich|ritze mir|mich (wieder |selbst )?(zu )?(ritzen|geritzt))\b/,
  /\bselbstmord/,
  /\bsuizid/,
  // Spanish. Not "me quiero morir de vergüenza", "no quiero vivir con esta vergüenza" or
  // "mi mamá va a matarme".
  /\bquiero morir(me)?\b(?! de\b)/,
  /\bno quiero (seguir )?(vivir|viviendo)\b(?! (con|en|sin|juntos)\b)/,
  /\b((quiero|quisiera|voy a|pienso en|ganas de) matarme|me (quiero|voy a) matar)\b/,
  // French. Not "mourir de honte" or "en finir avec ce régime".
  /\b(envie de|veux|voudrais) mourir\b(?! (de |d'))/,
  /\b(ne veux plus|plus envie de) vivre\b/,
  /\b(vais|veux|voudrais|envie de|pense a) me tuer\b/,
  /\b(je veux |je voudrais |je vais |envie d ?'? ?)en finir\b(?! avec (?!(la |ma )?vie\b|tout\b))/,
  /\bme (suis )?scarifi/,
  // Italian. Not "voglio morire dalla vergogna" or "farla finita con lui".
  /\bvoglio morire\b(?! (di|dal|dalla)\b)/,
  /\b((voglio|vorrei|penso di|sto per) uccidermi|mi (voglio |vorrei )?uccid(ere|o|ero))\b/,
  /\bfarla finita\b(?! con (?!(la )?vita\b|tutto\b))/,
  // Portuguese. Not "morrer de vergonha" or "minha mãe vai me matar".
  /\bquero morrer\b(?! de\b)/,
  /\b(vou|quero|queria|vontade de|penso em|pensando em|tentei|tentar) me matar\b/,
  // Dutch
  /\bik wil (dood(gaan)?|sterven)\b/,
  /\b(zelfmoord|zelfdoding)/,
  // Polish (written here without ę, ć, ś, ó). Not "chcę umrzeć ze wstydu".
  /\bchce umrzec\b(?! ze\b)/,
  /\b(zabic sie|sie zabic|zabije sie)\b/,
  /\bsamoboj/,
  // Turkish (written here without ö, ü, ğ)
  /\b(olmek istiyor(um|m)|kendimi oldur)/,
  /\bintihar/,
  // Russian. \b knows only Latin letters, so \p{L} marks where a word starts.
  /(?<!\p{L})(хочу умереть(?! от )|покончить с собои|суицид|уб(ить|ью) себя)/u,
  // Arabic: "I want to die", and suicide (انتحار, أنتحر, with or without "ال")
  /اريد ان اموت|انتحا?ر/,
  // Bosnian, Croatian, Serbian (often typed without č, ć, š, ž)
  /\b(ubiti se|se ubiti|da se ubijem|ubit cu se|ubicu se)\b/,
  /\b(zelim|hocu) (da )?umr(ij)?e(ti|m)\b/,
  /\bsamoub(istv|ojstv)/,
  /\bne zelim (vise )?(zivjeti|ziveti|da zivim)\b/,
  /\b(secem|sjecem|rezem) se\b/,
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
  /** The person said or clearly showed they are under 18 (rail 15). */
  minor: boolean;
  /**
   * Show the support lines without a crisis ([[SUPPORT]]): the check-in after a mood check's
   * question 9 (prompt.ts). Never beside [[CRISIS]] or [[MINOR]]; not counted as crisis_shown
   * (round-2 audit HAB-11).
   */
  support: boolean;
  /** A small goal Mira offers ([[GOAL:…]]), shown as "Add as a goal"; absent when none. */
  goal?: string;
};

/**
 * Challenges & goals (22 Nov 2026): [[GOAL:the step]] on a reply that offers one, in at most
 * GOAL_MAX_CHARS. Read on its own, as its text is longer than the other markers may be, and
 * removed whatever its length; a longer one is dropped rather than cut.
 */
const GOAL_MARKER = /\[\[\s*goal\s*:([^[\]\n]*)\]\]/gi;
export const GOAL_MAX_CHARS = 80;

const INTAKE_IDS = new Set(miraConfig.intakeQuestions.map((q) => q.id));
const TOPIC_IDS = new Set(miraConfig.topics.map((t) => t.id));
/** Any [[…]] marker; its inside ("CRISIS", "ASK:onset") is read by markerOf. */
const MARKER = /\[\[([^[\]\n]{1,40})\]\]/g;

/** "ASK : Onset " → ["ASK", "onset"]; spaces and case forgiven. */
function markerOf(inside: string): [kind: string, value: string | null] {
  const [kind = "", value] = inside.split(":", 2).map((p) => p.trim());
  return [kind.toUpperCase(), value ? value.toLowerCase() : null];
}

/** "Fredrickson BL, Roberts T-A" → "Fredrickson et al."; "van den Brink F" → "van den Brink". */
export function sourceLabel(card: EvidenceCard): string {
  const first = card.authors.split(",")[0]?.trim() || card.title;
  const words = first.split(/\s+/);
  // The last word is the initials ("BL", "T-A"); a one-word name or an organisation
  // ("Cornell Health") has none.
  const initials = words.length > 1 && /^[A-Z][A-Z-]{0,5}$/.test(words[words.length - 1]!);
  const surname = initials ? words.slice(0, -1).join(" ") : first;
  const etAl = card.authors.includes(",") ? " et al." : "";
  return `${surname}${etAl} (${card.year})`;
}

/** Strip the markers and the sources line; turn the cited ids into source tags. */
export function parseReply(raw: string): ParsedReply {
  const [goal] = [...raw.matchAll(GOAL_MARKER)].map((m) => m[1]!.replace(/\s+/g, " ").trim());
  raw = raw.replace(GOAL_MARKER, "");
  let ask: string | null = null;
  let topic: string | null = null;
  let refer = false;
  let crisis = false;
  let minor = false;
  let support = false;
  for (const [, inside] of raw.matchAll(MARKER)) {
    const [kind, id] = markerOf(inside!);
    if (kind === "CRISIS" && !id) crisis = true;
    else if (kind === "SUPPORT" && !id) support = true;
    else if (kind === "MINOR" && !id) minor = true;
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
  // A crisis reply is never also a coaching step: no answer buttons, no referral count. Nor is a
  // stop for someone under 18, whose chat's topic isn't kept either.
  if (crisis || minor) {
    ask = null;
    refer = false;
    support = false;
  }
  if (minor) topic = null;
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
    minor,
    support,
    ...(goal && goal.length <= GOAL_MAX_CHARS && !crisis && !minor ? { goal } : {}),
  };
}
