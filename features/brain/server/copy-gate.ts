import { archetypeContent } from "@/data/report-archetypes";
import { htmlToText } from "./ingest/report-voice";
import { checkDraft, withoutQuotedSpans, type VoiceFinding } from "./voice";

/**
 * THE COPY GATE: the rules Mark and Marcus set for report chapters, run as code.
 *
 * Every one of these was asked for in words and then depended on somebody remembering it:
 * "scan and replace any elements that scream AI" (Mark, 16 Sep), no em dashes, copy an
 * eight-year-old can follow (Mark, 23 Sep), "careful with absolute statements" (Marcus,
 * 20 Aug), no line that would fit every archetype, nothing repeated from another chapter.
 * `voice.ts` already checks each chapter against its own shipped voice; this runs those
 * checks too, so one call answers "is this ready for Mark".
 *
 * THE SHIPPED COPY BREAKS MOST OF THESE RULES, so they are NOT counted off it the way
 * `voice.ts` counts register and sentence length. Measured 2026-09-24 across all 24
 * chapters x 14 archetypes: 132 em dashes, "deeply" 130 times, "in essence" 42, "never"
 * 50, a median school reading grade of 13.5, and 11% of sentences repeated word for word
 * in three or more archetypes of the same chapter. A rule that forgave whatever shipped
 * would forgive exactly what was asked to go, so the rules come from the requests and the
 * shipped copy is only context ("the shipped chapter reads at grade 13.6"). The same checks
 * therefore also audit the shipped copy: leave out the text and name a chapter and
 * archetype.
 *
 * FINDINGS, NOT A SCORE, each with the sentences behind it, for the reason `checkDraft`
 * gives: a score invites arguing with the number. And it cannot judge meaning. Whether a
 * claim is backed by research, or repeats another chapter's idea in new words, still needs
 * a person or the `review_chapter` prompt.
 */

export type CopyFindingKind =
  | VoiceFinding["kind"]
  | "em-dash"
  | "ai-phrase"
  | "absolute"
  | "reading-level"
  | "length"
  | "fits-every-archetype"
  | "repeats-chapter";

export interface CopyFinding {
  kind: CopyFindingKind;
  severity: "error" | "warn";
  message: string;
  evidence?: string[];
}

export interface CopyReport {
  words: number;
  sentences: number;
  readingMinutes: number;
  grade: number;
  shippedGrade: number | null;
  shippedMedianWords: number | null;
  findings: CopyFinding[];
}

type Content = Record<string, Record<string, string>>;
const SHIPPED = archetypeContent as Content;

/**
 * Phrases that read as machine-written. Each is a regex, so "not just" catches the
 * "not just X, but Y" construction wherever it sits. Deliberately a short list of the
 * well-known tells plus the ones the shipped copy leans on hardest, not every word a
 * model is fond of: a gate that flags half the sentences gets ignored.
 */
export const AI_PHRASES: Array<[label: string, re: RegExp]> = [
  ["deeply", /\bdeeply\b/i],
  ["in essence", /\bin essence\b/i],
  ["truly", /\btruly\b/i],
  ["not just … but", /\bnot just\b/i],
  ["at its core", /\bat (?:its|their|the) core\b/i],
  ["resonate", /\bresonat(?:e|es|ed|ing)\b/i],
  ["leverage", /\bleverag(?:e|es|ed|ing)\b/i],
  ["nuanced", /\bnuanced?\b/i],
  ["profound", /\bprofound(?:ly)?\b/i],
  ["vibrant", /\bvibrant\b/i],
  ["delve", /\bdelv(?:e|es|ed|ing)\b/i],
  ["tapestry", /\btapestr(?:y|ies)\b/i],
  ["testament to", /\btestament to\b/i],
  ["navigate", /\bnavigat(?:e|es|ed|ing)\b/i],
  ["journey", /\bjourneys?\b/i],
  ["realm", /\brealms?\b/i],
  ["multifaceted", /\bmultifaceted\b/i],
  ["furthermore / moreover", /\b(?:furthermore|moreover)\b/i],
  ["foster", /\bfoster(?:s|ed|ing)?\b/i],
  ["holistic", /\bholistic(?:ally)?\b/i],
  ["seamless", /\bseamless(?:ly)?\b/i],
  ["elevate", /\belevat(?:e|es|ed|ing)\b/i],
  ["empower", /\bempower(?:s|ed|ing|ment)?\b/i],
  ["intricate", /\bintricate(?:ly)?\b/i],
  ["pivotal", /\bpivotal\b/i],
  ["unlock", /\bunlock(?:s|ed|ing)?\b/i],
  ["embark", /\bembark(?:s|ed|ing)?\b/i],
  ["landscape", /\blandscapes?\b/i],
  ["symphony / dance of", /\b(?:symphony|dance of)\b/i],
  ["it's important to note", /\bit(?:'|’)?s important to note\b/i],
  ["ultimately", /\bultimately\b/i],
];

/** Absolute claims. Judged outside quotation marks: people quoted saying "never" is fine. */
const ABSOLUTE =
  /\b(always|never|everyone|everybody|no one|nobody|every time|everything|nothing|all people)\b/i;

const DASH = /[—–]/;

/**
 * Flagged above school grade 8, the usual plain-English ceiling. Mark's aim is lower still,
 * an eight-year-old (about grade 3), but the shipped copy sits near 13, so flagging above 3
 * would mark every sentence and teach people to skip the finding.
 */
const TARGET_GRADE = 8;

const MAX_EVIDENCE = 3;
const clip = (s: string) => (s.length > 180 ? `${s.slice(0, 177)}…` : s);

export function toText(draft: string): string {
  return /<[a-z][^>]*>/i.test(draft) ? htmlToText(draft) : draft.trim();
}

export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /[a-z]/i.test(s));
}

const wordsOf = (s: string) => s.split(/\s+/).filter((w) => /[a-z]/i.test(w));

/** Vowel-group syllables, the usual Flesch-Kincaid approximation. */
export function syllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  return Math.max(1, (w.match(/[aeiouy]{1,2}/g) ?? []).length);
}

/** Flesch-Kincaid grade level: roughly the school year a reader needs. */
export function readingGrade(text: string): number {
  const sents = sentencesOf(text);
  const words = wordsOf(text);
  if (sents.length === 0 || words.length === 0) return 0;
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  return 0.39 * (words.length / sents.length) + 11.8 * (syl / words.length) - 15.59;
}

const median = (ns: number[]): number => {
  if (ns.length === 0) return 0;
  const s = [...ns].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

/**
 * One sentence as a comparison key: lower case, letters only, and every archetype's name
 * replaced by a placeholder, so "The Spark Seeker loves X" and "The Quiet Withdrawer loves
 * X" count as the same line. That fill-in-the-name sentence is exactly the one that fits
 * every archetype.
 */
function keyOf(sentence: string, names: string[]): string {
  let s = sentence.toLowerCase();
  for (const n of names) s = s.split(n.toLowerCase()).join(" archetype ");
  return s
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function checkCopy(
  input: { text: string; chapter?: string; archetype?: string },
  content: Content = SHIPPED
): CopyReport {
  const text = toText(input.text);
  const sents = sentencesOf(text);
  const words = wordsOf(text).length;
  const grade = Math.round(readingGrade(text) * 10) / 10;
  const findings: CopyFinding[] = [];
  const chapter = input.chapter && content[input.chapter] ? input.chapter : undefined;
  const names = chapter
    ? Object.keys(content[chapter]!)
    : Object.keys(Object.values(content)[0] ?? {});

  const dashed = sents.filter((s) => DASH.test(s));
  if (dashed.length) {
    findings.push({
      kind: "em-dash",
      severity: "error",
      message: `${dashed.length} sentence(s) use a dash (— or –). The rule is no em dashes: use a full stop, a comma or brackets.`,
      evidence: dashed.slice(0, MAX_EVIDENCE).map(clip),
    });
  }

  // ONE finding for every phrase, so a phrase-heavy draft reads as one problem, not twelve.
  const phraseCounts: string[] = [];
  const phraseSentences = new Set<string>();
  for (const [label, re] of AI_PHRASES) {
    const hits = sents.filter((s) => re.test(s));
    if (hits.length) {
      phraseCounts.push(`"${label}" ×${hits.length}`);
      for (const h of hits) phraseSentences.add(h);
    }
  }
  if (phraseCounts.length) {
    findings.push({
      kind: "ai-phrase",
      severity: "warn",
      message: `Phrases that read as machine-written: ${phraseCounts.join(", ")}. Say it plainly instead.`,
      evidence: [...phraseSentences].slice(0, MAX_EVIDENCE).map(clip),
    });
  }

  const absolute = sents.filter((s) => ABSOLUTE.test(withoutQuotedSpans(s)));
  if (absolute.length) {
    findings.push({
      kind: "absolute",
      severity: "warn",
      message: `${absolute.length} sentence(s) make an absolute claim (always, never, everyone, nothing…). Soften it unless it is literally true of every person with this archetype.`,
      evidence: absolute.slice(0, MAX_EVIDENCE).map(clip),
    });
  }

  let shippedGrade: number | null = null;
  let shippedMedianWords: number | null = null;
  if (chapter) {
    const versions = Object.values(content[chapter]!).map(toText);
    shippedGrade = Math.round(median(versions.map(readingGrade)) * 10) / 10;
    shippedMedianWords = median(versions.map((v) => wordsOf(v).length));
  }

  if (grade > TARGET_GRADE && sents.length >= 3) {
    const hardest = sents
      .filter((s) => wordsOf(s).length >= 8)
      .map((s) => ({ s, g: readingGrade(s) }))
      .sort((a, b) => b.g - a.g)
      .slice(0, MAX_EVIDENCE)
      .map(({ s }) => clip(s));
    findings.push({
      kind: "reading-level",
      severity: "warn",
      message:
        `Reads at about school grade ${grade} (roughly age ${Math.round(grade + 5)}). The ask is copy ` +
        `an eight-year-old can follow` +
        (shippedGrade !== null ? `; the shipped "${chapter}" reads at grade ${shippedGrade}` : "") +
        `. Shorter sentences and shorter words help most; start with these:`,
      evidence: hardest,
    });
  }

  if (shippedMedianWords && words > shippedMedianWords * 1.5) {
    findings.push({
      kind: "length",
      severity: "warn",
      message:
        `${words} words, against a median of ${shippedMedianWords} in the shipped "${chapter}" ` +
        `(about ${Math.max(1, Math.round(words / 200))} min to read against ${Math.max(1, Math.round(shippedMedianWords / 200))}). Longer than the chapters around it.`,
    });
  }

  if (chapter) {
    // Sentences shared across archetypes of THIS chapter, the draft's own archetype excluded.
    const shared = new Map<string, Set<string>>();
    for (const [a, html] of Object.entries(content[chapter]!)) {
      if (a === input.archetype) continue;
      for (const s of sentencesOf(toText(html))) {
        if (wordsOf(s).length < 6) continue;
        const k = keyOf(s, names);
        (shared.get(k) ?? shared.set(k, new Set()).get(k)!).add(a);
      }
    }
    const generic = sents.filter(
      (s) => wordsOf(s).length >= 6 && (shared.get(keyOf(s, names))?.size ?? 0) >= 3
    );
    if (generic.length) {
      findings.push({
        kind: "fits-every-archetype",
        severity: "warn",
        message: `${generic.length} sentence(s) appear word for word in three or more other archetypes' "${chapter}", so they would fit every archetype. Say what is specific to this one.`,
        evidence: generic.slice(0, MAX_EVIDENCE).map(clip),
      });
    }
  }

  // Sentences lifted from ANOTHER chapter: the same archetype's when one is named.
  const elsewhere = new Map<string, string>();
  for (const [ch, byArchetype] of Object.entries(content)) {
    if (ch === chapter) continue;
    const versions = input.archetype
      ? [byArchetype[input.archetype] ?? ""]
      : Object.values(byArchetype);
    for (const html of versions) {
      for (const s of sentencesOf(toText(html))) {
        if (wordsOf(s).length >= 8) elsewhere.set(keyOf(s, names), ch);
      }
    }
  }
  const lifted = sents
    .filter((s) => wordsOf(s).length >= 8 && elsewhere.has(keyOf(s, names)))
    .map((s) => `${clip(s)} (also in "${elsewhere.get(keyOf(s, names))}")`);
  if (lifted.length) {
    findings.push({
      kind: "repeats-chapter",
      severity: "warn",
      message: `${lifted.length} sentence(s) already appear in another chapter. A reader who has read that one will notice.`,
      evidence: lifted.slice(0, MAX_EVIDENCE),
    });
  }

  if (chapter) {
    for (const f of checkDraft(chapter, input.text, content)) findings.push(f);
  }

  return {
    words,
    sentences: sents.length,
    readingMinutes: Math.max(1, Math.round(words / 200)),
    grade,
    shippedGrade,
    shippedMedianWords,
    findings,
  };
}

/** The report as the MCP tool prints it: the summary line, then errors, then warnings. */
export function renderCopyReport(r: CopyReport, label: string): string {
  const head =
    `Copy check, ${label}: ${r.words} words, ${r.sentences} sentences, about ${r.readingMinutes} min, ` +
    `reading grade ${r.grade}` +
    (r.shippedGrade !== null ? ` (shipped chapter: grade ${r.shippedGrade})` : "") +
    ".";
  if (r.findings.length === 0)
    return `${head}\n\nNothing flagged by the rules this checks. Meaning and evidence still need reading.`;
  const block = (sev: "error" | "warn", title: string) => {
    const fs = r.findings.filter((f) => f.severity === sev);
    if (!fs.length) return "";
    return (
      `\n\n${title}\n` +
      fs
        .map(
          (f) =>
            `- [${f.kind}] ${f.message}` +
            (f.evidence?.length ? `\n${f.evidence.map((e) => `    "${e}"`).join("\n")}` : "")
        )
        .join("\n")
    );
  };
  return (
    head +
    block("error", "MUST FIX") +
    block("warn", "WORTH FIXING") +
    "\n\nThis checks wording, not meaning: whether a claim is backed by research still needs reading."
  );
}

export function allArchetypes(content: Content = SHIPPED): string[] {
  return Object.keys(Object.values(content)[0] ?? {});
}

/** The shipped text of one chapter for one archetype, or null when there is none. */
export function shippedCopy(
  chapter: string,
  archetype: string,
  content: Content = SHIPPED
): string | null {
  return content[chapter]?.[archetype] ?? null;
}
