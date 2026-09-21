import { archetypeContent } from "@/data/report-archetypes";
import { reportSections } from "@/data/report-general";
import { reportPracticeTendencies } from "@/data/report-practice-tendencies";
import { summaryArchetypeContent } from "@/data/report-summary";
import { reportPracticeIntroBlocks } from "@/data/report-practice-intro";
import { faqs } from "@/data/faqs";
import { splitBody } from "./notion";
import { sweepStale, upsertChunks, type BrainRow, type IngestResult } from "./upsert";

/**
 * The report copy that actually ships — the house voice at its most authoritative.
 *
 * WHY THIS EXISTS. The brain is asked to help write chapters in LoveIQ's voice, and it had
 * never read that voice. Measured 2026-09-15: 1.5 MB of reviewed, shipped prose across five
 * files in `data/`, and ZERO chunks indexed. The documentation ingester takes markdown only,
 * so prose living inside TypeScript was invisible to it — the corpus held Drive DRAFTS of
 * chapters and none of the finished text they were drafts toward.
 *
 * DRAFTS ARE NOT THE STANDARD. Drive already holds "Typical Beliefs — Chapter Output" and
 * its siblings, which is what someone is working on. This is what survived review and went
 * to a paying reader, which is what "write it the way we write" actually means. Both belong
 * in the corpus and they must be told apart, so every title here says "as shipped" and
 * every chunk carries `kind: "shipped"` to filter on.
 *
 * ONE CHUNK PER CHAPTER PER ARCHETYPE. "How do we write the Core Insecurities chapter for a
 * Spark Seeker" needs that one block in view. Pooling a chapter across fourteen archetypes
 * would answer with whichever archetype ranked highest, and pooling an archetype across
 * chapters would bury the chapter being asked about.
 */
const SOURCE = "report";

/** Readable text out of the stored HTML, with the heading structure kept as line breaks. */
export function htmlToText(html: string): string {
  return html
    .replace(/<\s*(h[1-6]|p|li|br|div|tr)\b[^>]*>/gi, "\n")
    .replace(/<\s*\/\s*(h[1-6]|p|li|div|tr|ul|ol|table)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&(?:#39|apos|rsquo);/g, "'")
    .replace(/&(?:quot|ldquo|rdquo);/g, '"')
    .replace(/&mdash;/g, "—")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

/** "core_archetype" -> "Core Archetype", for a title someone would actually type. */
function humanise(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** A stable id from a question, so editing the ANSWER does not orphan the row. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
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
    title: parts.length > 1 ? `${title} (part ${i + 1} of ${parts.length})` : title,
    url: null,
    body,
    meta: { ...meta, kind: "shipped" },
    updated_at: stampedAt,
    // No period: shipped copy is current until it is replaced, the same as documentation.
    // Giving it a date would rank it as though it described that day.
    period_end: null,
  }));
}

export function buildReportVoiceRows(stampedAt: string): BrainRow[] {
  const rows: BrainRow[] = [];

  // 1. Chapter copy, per archetype. The outer key is the CHAPTER, the inner the archetype.
  for (const [chapter, byArchetype] of Object.entries(archetypeContent)) {
    for (const [archetype, html] of Object.entries(byArchetype ?? {})) {
      const text = htmlToText(String(html ?? ""));
      if (text.length < 40) continue;
      rows.push(
        ...rowsFor(
          `chapter:${chapter}:${archetype}`,
          `Report chapter as shipped — ${humanise(chapter)}, for the ${archetype}`,
          text,
          { chapter, archetype },
          stampedAt
        )
      );
    }
  }

  // 2. The general copy every reader sees, whatever their archetype.
  for (const s of reportSections) {
    const text = htmlToText(String((s as { generalContent?: string }).generalContent ?? ""));
    if (text.length < 40) continue;
    const title = String((s as { title?: string }).title ?? (s as { id?: string }).id ?? "section");
    rows.push(
      ...rowsFor(
        `general:${(s as { id?: string }).id ?? title}`,
        `Report copy as shipped — ${title} (the same for every reader)`,
        text,
        { chapter: (s as { id?: string }).id ?? null, archetype: null, scope: "general" },
        stampedAt
      )
    );
  }

  // 3. The archetype summary — the single block that describes a reader to themselves.
  for (const [archetype, html] of Object.entries(summaryArchetypeContent)) {
    const text = htmlToText(String(html ?? ""));
    if (text.length < 40) continue;
    rows.push(
      ...rowsFor(
        `summary:${archetype}`,
        `Archetype summary as shipped — the ${archetype}`,
        text,
        { chapter: "summary", archetype },
        stampedAt
      )
    );
  }

  /**
   * 3a. THE HOMEPAGE FAQ — the answers we give customers before they buy.
   *
   * `data/faqs.ts` is rendered by `WFAQ.tsx` on both landing variants AND emitted as
   * FAQPage JSON-LD, so it is simultaneously the most-read copy we publish and the
   * version Google indexes. The brain held none of it: "what do we tell customers
   * about X" and "what does our FAQ say about refunds" had no source.
   *
   * Found 2026-09-21 by diffing every file in `data/` against the imports of the two
   * repo-built ingesters — the same sweep that found `report-practice-intro`.
   *
   * One row per question, because a question is the unit somebody asks about, and
   * pooling twelve of them would answer about refunds with whichever neighbour scored
   * highest — the same reasoning the glossary builder already applies per term.
   */
  for (const f of faqs) {
    const q = String(f.question ?? "").trim();
    const a = htmlToText(String(f.answer ?? ""));
    if (!q || a.length < 20) continue;
    rows.push(
      ...rowsFor(
        `faq:${slugify(q)}`,
        `Homepage FAQ as shipped — ${q}`,
        `${q}\n\n${a}`,
        { chapter: "faq", archetype: null, scope: "general" },
        stampedAt
      )
    );
  }

  /**
   * 3b. HOW TO READ THE TWO SCORES — the only shipped report file this builder was
   * not reading.
   *
   * `data/report-practice-intro.ts` is rendered to every reader by
   * `features/report/ui/reportContent.ts`, and it is not decoration: it carries the
   * "probability-based estimates, not deterministic" disclaimer, the definitions of
   * Fantasy Pull and Lived Pleasure, the high/low bands, and all four combinations —
   * high fantasy with low pleasure and the rest. "What does a high fantasy pull and a
   * low lived pleasure mean" is an ordinary question about our own product, and the
   * brain could not answer it from the copy we actually ship.
   *
   * Found 2026-09-21 by diffing `data/report-*.ts` against this file's imports: four
   * of five were read. One block per paragraph rather than one joined chunk, so a
   * question about a single combination retrieves that combination.
   */
  reportPracticeIntroBlocks.forEach((html, i) => {
    const text = htmlToText(String(html ?? ""));
    if (text.length < 40) return;
    rows.push(
      ...rowsFor(
        `practice-intro:${i + 1}`,
        "Report copy as shipped — how to read the Fantasy Pull and Lived Pleasure scores",
        text,
        { chapter: "practice-intro", archetype: null, scope: "general" },
        stampedAt
      )
    );
  });

  // 4. Practice tendencies: intro prose plus grouped blocks, flattened per archetype.
  for (const [archetype, content] of Object.entries(reportPracticeTendencies)) {
    const c = content as { introBlocks?: unknown[]; groups?: unknown[] };
    const chunks: string[] = [];
    const collect = (v: unknown): void => {
      if (typeof v === "string") chunks.push(v);
      else if (Array.isArray(v)) v.forEach(collect);
      else if (v && typeof v === "object") Object.values(v).forEach(collect);
    };
    collect(c.introBlocks);
    collect(c.groups);
    const text = htmlToText(chunks.join("\n"));
    if (text.length < 40) continue;
    rows.push(
      ...rowsFor(
        `practice:${archetype}`,
        `Practice tendencies as shipped — the ${archetype}`,
        text,
        { chapter: "practice_tendencies", archetype },
        stampedAt
      )
    );
  }

  return rows;
}

export async function ingestReportVoice(stampedAt: string): Promise<IngestResult> {
  const rows = buildReportVoiceRows(stampedAt);
  // An empty build must not sweep the voice away and leave the corpus with nothing —
  // the same rule the roster ingester follows for the same reason.
  if (rows.length === 0) return { source: SOURCE, rows: 0, swept: 0, skipped: "report-empty" };
  const written = await upsertChunks(rows);
  const swept = await sweepStale(SOURCE, stampedAt, written);
  return { source: SOURCE, rows: written, swept };
}
