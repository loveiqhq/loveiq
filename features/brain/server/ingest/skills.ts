import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";
import { archetypeContent } from "@/data/report-archetypes";
import { sweepStale, upsertChunks, type BrainRow, type IngestResult } from "./upsert";

/**
 * How LoveIQ does its own work, written where the team can actually reach it.
 *
 * THE STRUCTURAL CATCH. This repo has ten skills under `.agents/skills/`, and every one is
 * a Claude Code skill. The team works in claude.ai with the brain MCP, where that directory
 * does not exist. A method written there would never be read by the people it is for, so
 * the method has to live in the corpus — retrievable by the same search as everything else.
 *
 * MEASURED, NOT ASSERTED. The voice rules below are counted off the shipped copy rather
 * than invented: 24 chapters x 14 archetypes, every heading appearing exactly 14 times,
 * a median sentence of 14 words, and only 121 of 336 blocks addressing the reader as "you".
 * A skill that tells someone to "write warmly" is worth nothing; one that says the chapter
 * skeleton is fixed and the register is third-person is checkable.
 *
 * POINTERS, NOT COPIES. The team's own `Chapter_Prompt` documents are live and edited. This
 * looks their ids up at build time and names them, because a copy taken today is a stale
 * copy tomorrow — the exact failure `check-mcp-claims` exists to catch.
 */
const SOURCE = "skill";

interface PromptDoc {
  source_id: string;
  title: string;
}

/**
 * The team's live prompt documents, found by title rather than by a hardcoded id.
 *
 * DEDUPLICATE BEFORE CAPPING, not after. A long Drive document is stored as many chunks,
 * each titled "... (part 10 of 29)", so a query ordered by title and capped at 40 rows can
 * be 34 fragments of the same handful of files: measured 2026-09-15, that cap returned 6
 * documents when 18 exist. Read a generous page, collapse to base ids in code, then cap —
 * and strip the part suffix, or the skill points people at "part 10 of 29" as though that
 * were the document's name.
 */
export function collapseToDocuments(rows: PromptDoc[], max = 20): PromptDoc[] {
  const seen = new Set<string>();
  const out: PromptDoc[] = [];
  for (const r of rows) {
    const base = String(r.source_id ?? "").split("#")[0]!;
    if (!base || seen.has(base)) continue;
    seen.add(base);
    const title = String(r.title ?? "")
      .replace(/^Drive:\s*/i, "")
      .replace(/\s*\(part \d+ of \d+\)\s*$/i, "")
      .trim();
    out.push({ source_id: `drive/${base}`, title: title || base });
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Rows to read before collapsing. Generous because the unit is a CHUNK, not a document:
 * one 29-part prompt file is 29 rows, so a page sized for documents silently returns a
 * fraction of them.
 */
const PROMPT_ROW_LIMIT = 600;

/**
 * A full page back is indistinguishable from a truncated one, so say so.
 *
 * The shipped version asked for 40 rows and got 40, every one of them a fragment of the
 * same six files, and reported six documents as though that were all of them. Silent
 * truncation reads exactly like a complete answer — the failure this whole file is
 * careful about elsewhere.
 */
export function isTruncated(rowCount: number, limit = PROMPT_ROW_LIMIT): boolean {
  return rowCount >= limit;
}

async function promptDocs(): Promise<PromptDoc[]> {
  const res = await supabaseFetch(
    `/rest/v1/brain_chunk?select=source_id,title&source=eq.drive` +
      `&title=ilike.*prompt*&order=title&limit=${PROMPT_ROW_LIMIT}`
  );
  if (!res.ok) return [];
  const rows = (await res.json().catch(() => [])) as PromptDoc[];
  if (isTruncated(rows.length)) {
    logger.warn(
      { rows: rows.length, limit: PROMPT_ROW_LIMIT },
      "brain: the prompt-document page came back full, so the skill may be listing only some of them"
    );
  }
  return collapseToDocuments(rows);
}

/** The chapter skeleton, counted off what shipped rather than described from memory. */
export function measuredVoice(): {
  chapters: number;
  archetypes: number;
  medianSentenceWords: number;
  secondPersonBlocks: number;
  totalBlocks: number;
} {
  const chapters = Object.keys(archetypeContent);
  const lengths: number[] = [];
  let secondPerson = 0;
  let blocks = 0;
  const archetypes = new Set<string>();
  for (const chapter of chapters) {
    for (const [archetype, html] of Object.entries(archetypeContent[chapter] ?? {})) {
      archetypes.add(archetype);
      blocks += 1;
      const text = String(html).replace(/<[^>]+>/g, " ");
      if (/\byou\b|\byour\b/i.test(text)) secondPerson += 1;
      for (const s of text.split(/(?<=[.!?])\s+/)) {
        const words = s.trim().split(/\s+/).filter(Boolean).length;
        if (words > 3) lengths.push(words);
      }
    }
  }
  lengths.sort((a, b) => a - b);
  return {
    chapters: chapters.length,
    archetypes: archetypes.size,
    medianSentenceWords: lengths[Math.floor(lengths.length / 2)] ?? 0,
    secondPersonBlocks: secondPerson,
    totalBlocks: blocks,
  };
}

export function buildSkillRows(stampedAt: string, prompts: PromptDoc[]): BrainRow[] {
  const v = measuredVoice();
  const promptLines = prompts.length
    ? prompts.map((p) => `  - ${p.title} — fetch_document("${p.source_id}")`).join("\n")
    : '  - (none found by title just now; search Drive for "Chapter_Prompt")';

  const body = [
    "HOW WE WRITE A REPORT CHAPTER AT LOVEIQ",
    "",
    "Start by reading the team's own prompt document for the chapter you are writing. These",
    "are live and edited, so read them rather than working from anything remembered:",
    promptLines,
    "",
    "THE SKELETON IS FIXED, THE CONTENT IS NOT.",
    `A chapter is one of ${v.chapters} chapters written ${v.archetypes} times, once per archetype.`,
    "Measured on the shipped copy: every heading appears exactly once per archetype, in the",
    "same order. So a new chapter is not a blank page — it is the existing skeleton for that",
    "chapter, filled for a different reader. Read what shipped for another archetype before",
    'writing: search with sources:["report"], every one of which is titled "as shipped".',
    "",
    "REGISTER.",
    `Median sentence is ${v.medianSentenceWords} words — plain, not academic. Only`,
    `${v.secondPersonBlocks} of ${v.totalBlocks} shipped blocks address the reader as "you";`,
    'the dominant mode is third-person description of the archetype ("The Sensual Connector',
    'experiences sexuality primarily as..."), which lets a reader recognise themselves without',
    "being told what they feel. Follow the chapter you are extending, not a general preference.",
    "",
    "WHAT NOT TO MIX.",
    "Core motivations do not belong in the beliefs chapter. Real-world examples of sexual",
    "beliefs — light and shadow, for men and for women — land better than pure psychological",
    "theory. Both are standing notes from the strategy lead, not stylistic opinions.",
    "",
    "THE WORKFLOW, as agreed 2026-09-15.",
    "Text is drafted with a prompt, refined in Google Docs, then pushed to Figma, which is the",
    "visual source of truth. Build mobile-first and reuse the Figma component library.",
    "",
    "WHO ACCEPTS A CHANGE.",
    "Content control sits with Sanjin. A suggestion reviewed by Marcus or Mark without a",
    "counter-comment is treated as approved, and Sanjin resolves it. Anyone implementing a",
    "chapter is also expected to read it as a proxy user and say when it does not make sense.",
    "",
    "DRAFTING INTO A DOCUMENT.",
    "A draft goes into a Google Doc for a human to edit, never anywhere a reader sees. Say in",
    "the document that it is a draft, and name the prompt and the archetype it was written",
    "from, so the next person can tell what it was measured against.",
  ].join("\n");

  return [
    {
      source: SOURCE,
      source_id: "write-a-report-chapter",
      title:
        "How we write a report chapter at LoveIQ — house voice, chapter structure, " +
        "review protocol, and how to draft one",
      url: null,
      body,
      meta: { skill: "write-a-report-chapter", chapters: v.chapters, archetypes: v.archetypes },
      updated_at: stampedAt,
      period_end: null,
    },
  ];
}

export async function ingestSkills(stampedAt: string): Promise<IngestResult> {
  const rows = buildSkillRows(stampedAt, await promptDocs());
  if (rows.length === 0) return { source: SOURCE, rows: 0, swept: 0, skipped: "skill-empty" };
  const written = await upsertChunks(rows);
  const swept = await sweepStale(SOURCE, stampedAt, written);
  return { source: SOURCE, rows: written, swept };
}
