import { archetypeContent } from "@/data/report-archetypes";
import { htmlToText } from "./ingest/report-voice";

/**
 * Does a draft chapter read like the ones that shipped?
 *
 * The team's recurring problem is not that drafts are wrong, it is that they drift: a
 * chapter written in second person where every shipped version is third, sentences twice
 * the length of the ones around them, a structure that does not match. Marcus reads those
 * as "insufficient polish" and nobody can point at what changed.
 *
 * EVERY RULE HERE IS COUNTED OFF THE SHIPPED COPY, per chapter. That matters more than it
 * sounds, because the obvious global rules are all false:
 *
 *   - "write in third person" — `insecurities` and `relationship_form` use second person in
 *     all 14 shipped versions. The register is a property of the CHAPTER.
 *   - "sentences average 14 words" — that is the corpus-wide median. Per chapter it runs
 *     from 13 (`insecurities`) to 22 (`confidence`, `beliefs`, `power`).
 *   - "every heading repeats once per archetype in the same order" — true only of
 *     `practices`. 19 of 24 chapters have no headings at all, and four more have headings
 *     that are archetype-specific content rather than a skeleton.
 *
 * MEASURED AND REJECTED: cross-chapter vocabulary leakage. Terms that look distinctive to a
 * chapter — "helpful", "result", "accessible", each appearing exactly 14 times — turn out to
 * be one template sentence repeated once per archetype, not domain language. It would have
 * produced confident noise.
 */

export type Register = "third" | "second" | "mixed";

export interface VoiceBaseline {
  chapter: string;
  archetypes: number;
  /** How many of the shipped archetype versions address the reader directly. */
  secondPersonVersions: number;
  register: Register;
  medianSentenceWords: number;
  p90SentenceWords: number;
  /** The heading skeleton, only when every archetype shares it. Null when there is none. */
  headingSequence: string[] | null;
}

export interface VoiceFinding {
  kind: "register" | "sentence-length" | "structure";
  severity: "error" | "warn";
  message: string;
  /** The text that triggered it, so a writer can judge rather than take it on trust. */
  evidence?: string[];
}

const SECOND_PERSON = /\b(you|your|yours|yourself)\b/i;

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).filter(Boolean).length > 3);
}

function median(ns: number[]): number {
  if (ns.length === 0) return 0;
  const s = [...ns].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function percentile(ns: number[], p: number): number {
  if (ns.length === 0) return 0;
  const s = [...ns].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]!;
}

function headings(html: string): string[] {
  return [...html.matchAll(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi)]
    .map((m) => htmlToText(m[1] ?? ""))
    .filter(Boolean);
}

/** What the shipped copy for one chapter actually does, across all its archetypes. */
export function chapterBaseline(chapter: string): VoiceBaseline | null {
  const byArchetype = (archetypeContent as Record<string, Record<string, string>>)[chapter];
  if (!byArchetype) return null;
  const archetypes = Object.keys(byArchetype);
  if (archetypes.length === 0) return null;

  let secondPersonVersions = 0;
  const lengths: number[] = [];
  const sequences = new Set<string>();
  let firstSequence: string[] | null = null;

  for (const a of archetypes) {
    const html = String(byArchetype[a] ?? "");
    const text = htmlToText(html);
    if (SECOND_PERSON.test(text)) secondPersonVersions += 1;
    for (const s of sentences(text)) lengths.push(s.split(/\s+/).filter(Boolean).length);
    const hs = headings(html);
    if (hs.length) {
      sequences.add(hs.join(" | "));
      firstSequence ??= hs;
    }
  }

  return {
    chapter,
    archetypes: archetypes.length,
    secondPersonVersions,
    register:
      secondPersonVersions === 0
        ? "third"
        : secondPersonVersions === archetypes.length
          ? "second"
          : "mixed",
    medianSentenceWords: median(lengths),
    p90SentenceWords: percentile(lengths, 0.9),
    // A skeleton only counts as one if EVERY archetype shares it. Four chapters have
    // headings that differ per archetype — those are content, and checking a draft against
    // one archetype's headings would reject correct work.
    headingSequence: sequences.size === 1 ? firstSequence : null,
  };
}

export interface RegisterOutlier {
  chapter: string;
  /** The archetypes on the minority side of their own chapter. */
  archetypes: string[];
  majority: Register;
  total: number;
}

/**
 * Chapters where a HANDFUL of archetypes break their own chapter's register.
 *
 * A chapter split 6/14 is an unresolved decision. A chapter split 1/14 is an editing slip,
 * and naming the one block that differs turns "the copy is inconsistent" into a task. Found
 * on the shipped copy 2026-09-16: seven blocks across five chapters.
 */
export function registerOutliers(maxOutliers = 2): RegisterOutlier[] {
  const out: RegisterOutlier[] = [];
  for (const chapter of allChapters()) {
    const byArchetype = (archetypeContent as Record<string, Record<string, string>>)[chapter];
    if (!byArchetype) continue;
    const archetypes = Object.keys(byArchetype);
    const withYou = archetypes.filter((a) =>
      SECOND_PERSON.test(htmlToText(String(byArchetype[a])))
    );
    if (withYou.length === 0 || withYou.length === archetypes.length) continue;
    const minorityIsSecond = withYou.length <= archetypes.length / 2;
    const minority = minorityIsSecond ? withYou : archetypes.filter((a) => !withYou.includes(a));
    if (minority.length > maxOutliers) continue;
    out.push({
      chapter,
      archetypes: minority,
      majority: minorityIsSecond ? "third" : "second",
      total: archetypes.length,
    });
  }
  return out;
}

export function allChapters(): string[] {
  return Object.keys(archetypeContent as Record<string, unknown>);
}

/**
 * Check a draft against its own chapter's shipped baseline.
 *
 * Accepts HTML or plain text. Returns findings, not a score: a score invites arguing with
 * the number instead of reading the sentence it came from, which is why each finding
 * carries the text that triggered it.
 */
export function checkDraft(chapter: string, draft: string): VoiceFinding[] {
  const base = chapterBaseline(chapter);
  if (!base) {
    return [
      {
        kind: "structure",
        severity: "error",
        message: `No shipped chapter called "${chapter}", so there is nothing to compare against. Known chapters: ${allChapters().slice(0, 8).join(", ")}…`,
      },
    ];
  }

  const text = /<[a-z][^>]*>/i.test(draft) ? htmlToText(draft) : draft.trim();
  const findings: VoiceFinding[] = [];
  const sents = sentences(text);

  // 1. REGISTER. The strongest signal in the copy, and almost perfectly bimodal: most
  //    chapters are third person in all 14 versions, two are second person in all 14.
  const offenders = sents.filter((s) => SECOND_PERSON.test(s));
  if (base.register === "third" && offenders.length > 0) {
    findings.push({
      kind: "register",
      severity: "error",
      message:
        `"${chapter}" is third person in all ${base.archetypes} shipped versions — not one of them ` +
        `addresses the reader as "you". This draft does, ${offenders.length} time(s). The team agreed ` +
        `on 2026-09-08 to describe the archetype rather than the reader.`,
      evidence: offenders.slice(0, 3),
    });
  }
  /**
   * Only judge the ABSENCE of second person on a draft long enough for absence to mean
   * something. A four-sentence excerpt can legitimately not reach for "you"; a chapter
   * cannot. Presence is judged at any length, because one "you" in a chapter that has
   * never used it is a deviation however short the sample.
   */
  const LONG_ENOUGH_TO_JUDGE_ABSENCE = 5;
  if (
    base.register === "second" &&
    offenders.length === 0 &&
    sents.length >= LONG_ENOUGH_TO_JUDGE_ABSENCE
  ) {
    findings.push({
      kind: "register",
      severity: "error",
      message:
        `"${chapter}" addresses the reader directly in all ${base.archetypes} shipped versions. ` +
        `This draft never does, which will read as colder than the chapters around it.`,
    });
  }
  if (base.register === "mixed") {
    findings.push({
      kind: "register",
      severity: "warn",
      message:
        `"${chapter}" is inconsistent in the SHIPPED copy — ${base.secondPersonVersions} of ` +
        `${base.archetypes} versions use "you". There is no baseline to check a draft against, ` +
        `and that is worth fixing in the shipped copy before it is worth checking a draft.`,
    });
  }

  // 2. SENTENCE LENGTH, against this chapter rather than the corpus. A band, not a target:
  //    prose that matched a median exactly would be robotic.
  const draftMedian = median(sents.map((s) => s.split(/\s+/).filter(Boolean).length));
  if (sents.length >= 5 && base.medianSentenceWords > 0) {
    const ratio = draftMedian / base.medianSentenceWords;
    if (ratio > 1.6 || ratio < 0.6) {
      findings.push({
        kind: "sentence-length",
        severity: "warn",
        message:
          `Median sentence is ${draftMedian} words against ${base.medianSentenceWords} in the ` +
          `shipped "${chapter}" (p90 there is ${base.p90SentenceWords}). ` +
          (ratio > 1.6
            ? "Longer than the chapters around it."
            : "Shorter and choppier than its neighbours."),
      });
    }
  }

  // 3. STRUCTURE, only where a skeleton genuinely exists.
  if (base.headingSequence) {
    const got = /<h[1-6]/i.test(draft) ? headings(draft) : [];
    const missing = base.headingSequence.filter((h) => !got.includes(h));
    if (missing.length) {
      findings.push({
        kind: "structure",
        severity: "error",
        message:
          `"${chapter}" has the same ${base.headingSequence.length} headings in every shipped ` +
          `version. This draft is missing ${missing.length}.`,
        evidence: missing.slice(0, 5),
      });
    }
  }

  return findings;
}
