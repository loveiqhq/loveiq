import { glossaryTerms, type GlossaryTerm } from "@/data/glossary-data";
import { surveyQuestions, type SurveyQuestion } from "@/data/survey-data";
import { dimensions, overlays, type OverlayDef } from "@/data/scoring-config";
import { splitBody } from "./notion";
import { sweepStale, upsertChunks, type BrainRow, type IngestResult } from "./upsert";

/**
 * What the words mean, what we ask, and how a score is built.
 *
 * WHY THIS EXISTS. The brain was taught the house VOICE — `source: "report"`, the copy that
 * ships — but not the VOCABULARY underneath it. Measured 2026-09-15 it held 2 glossary
 * chunks against 323 defined terms, 1 survey chunk against 58 questions, and 7 scoring
 * chunks. So it could write a sentence in our register and still be guessing at what
 * "responsive desire" means, which question measures it, or how it reaches a score.
 *
 * ONE SOURCE, THREE KINDS. `meta.kind` separates glossary / survey / scoring rather than
 * three registry entries, because the questions people actually ask cross them — "what do
 * we mean by arousal brakes, and which question measures it" wants a term and a chapter in
 * one result. Titles carry the words people search on, and titles are weighted double.
 *
 * THE GLOSSARY IS ALREADY PUBLIC at /glossary, so nothing here is newly exposed.
 */
const SOURCE = "domain";

function clean(v: unknown): string {
  return String(v ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A list rendered as a list, not as `String(array)`.
 *
 * Half these fields are `string[]`, and the default coercion joins them with a bare comma
 * and no space — "a fear of being left,replaced" — which reads as a typo and breaks the
 * phrase for anything matching on words. Bulleted, because several of them are whole
 * sentences rather than single terms.
 */
function bullets(v: readonly string[] | undefined): string {
  const items = (v ?? []).map(clean).filter(Boolean);
  if (items.length === 0) return "";
  return items.length === 1 ? items[0]! : items.map((i) => `- ${i}`).join("\n");
}

function rowsFor(
  sourceId: string,
  title: string,
  text: string,
  meta: Record<string, unknown>,
  stampedAt: string
): BrainRow[] {
  const parts = splitBody(text);
  return parts.map((body, i) => ({
    source: SOURCE,
    source_id: i === 0 ? sourceId : `${sourceId}#${i + 1}`,
    // Labelled like the report ingester's split bodies. Two chunks under one identical
    // title read as a duplicate rather than as two halves of the same thing.
    title: parts.length > 1 ? `${title} (part ${i + 1} of ${parts.length})` : title,
    url: null,
    body,
    meta,
    updated_at: stampedAt,
    // Definitions are current until edited, like documentation. A date would rank them as
    // though they described that day.
    period_end: null,
  }));
}

export function buildDomainRows(stampedAt: string): BrainRow[] {
  const rows: BrainRow[] = [];

  // 1. One chunk per TERM. The unit someone asks about is the term, and pooling them would
  //    answer "what is responsive desire" with whichever neighbour ranked highest.
  for (const t of glossaryTerms as GlossaryTerm[]) {
    const term = clean(t.term);
    if (!term) continue;
    const examples = bullets(t.examples);
    const misread = bullets(t.misinterpretations);
    const reality = bullets(t.reality);
    const related = (t.relatedTerms ?? []).map(clean).filter(Boolean).join(", ");
    const parts = [
      `${term} — ${clean(t.type)}${t.domain ? `, ${clean(t.domain)}` : ""}`,
      clean(t.definition),
      t.extendedNotes ? `In more detail: ${clean(t.extendedNotes)}` : "",
      examples ? `For example:\n${examples}` : "",
      // The most useful half of a glossary and the part a model most needs: what people
      // get this wrong about, stated next to what is actually true.
      misread ? `Commonly mistaken for:\n${misread}` : "",
      reality ? `In reality:\n${reality}` : "",
      related ? `Related: ${related}` : "",
    ].filter(Boolean);
    rows.push(
      ...rowsFor(
        `glossary:${clean(t.slug) || clean(t.id)}`,
        `What we mean by "${term}" — LoveIQ glossary`,
        parts.join("\n\n"),
        {
          kind: "glossary",
          term,
          type: clean(t.type) || null,
          category: clean(t.category) || null,
          sensitivity: clean(t.sensitivityLevel) || null,
        },
        stampedAt
      )
    );
  }

  // 2. One chunk per survey CHAPTER, not per question. "What do we ask about attachment"
  //    wants the whole chapter in view; a per-question chunk answers it with one question.
  const byChapter = new Map<string, SurveyQuestion[]>();
  for (const q of surveyQuestions as SurveyQuestion[]) {
    const ch = clean(q.chapter) || "Uncategorised";
    const list = byChapter.get(ch) ?? [];
    list.push(q);
    byChapter.set(ch, list);
  }
  for (const [chapter, qs] of byChapter) {
    const lines = qs.map((q) => {
      const opts = (q.options ?? []).map(clean).filter(Boolean);
      return [
        `${clean(q.qId)} — ${clean(q.question)}`,
        `  answer: ${clean(q.answerType) || "unspecified"}${q.required ? ", required" : ""}`,
        opts.length ? `  options: ${opts.slice(0, 12).join(" / ")}` : "",
        q.guide ? `  why we ask: ${clean(q.guide)}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    });
    rows.push(
      ...rowsFor(
        `survey:${chapter
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")}`,
        `What the survey asks in "${chapter}" — ${qs.length} questions`,
        `The ${chapter} chapter of the LoveIQ assessment.\n\n${lines.join("\n\n")}`,
        { kind: "survey", chapter, questions: qs.length },
        stampedAt
      )
    );
  }

  // 3. Scoring, as two tables rather than a row each: the question is always "how is this
  //    built", never "what is dimension 14".
  const dimLines = dimensions.map(
    (d) =>
      `${clean(d.id)} — ${clean(d.name)} | from question ${clean(d.qid)} | transform ${clean(d.transform)} | default weight ${clean(d.defaultWeight)}`
  );
  if (dimLines.length) {
    rows.push(
      ...rowsFor(
        "scoring:dimensions",
        "How a LoveIQ score is built — the scoring dimensions and which question feeds each",
        `Each dimension is computed from one survey question, transformed, then weighted.\n\n${dimLines.join("\n")}`,
        { kind: "scoring", part: "dimensions", count: dimLines.length },
        stampedAt
      )
    );
  }
  const ovLines = (overlays as OverlayDef[]).map((o) =>
    Object.entries(o as unknown as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${clean(v)}`)
      .join(" | ")
  );
  if (ovLines.length) {
    rows.push(
      ...rowsFor(
        "scoring:overlays",
        "How a LoveIQ score is adjusted — the scoring overlays",
        `Overlays adjust the raw dimension scores before an archetype is chosen.\n\n${ovLines.join("\n")}`,
        { kind: "scoring", part: "overlays", count: ovLines.length },
        stampedAt
      )
    );
  }

  return rows;
}

export async function ingestDomain(stampedAt: string): Promise<IngestResult> {
  const rows = buildDomainRows(stampedAt);
  // An empty build must not sweep the vocabulary away, the same rule the roster follows.
  if (rows.length === 0) return { source: SOURCE, rows: 0, swept: 0, skipped: "domain-empty" };
  const written = await upsertChunks(rows);
  const swept = await sweepStale(SOURCE, stampedAt, written);
  return { source: SOURCE, rows: written, swept };
}
