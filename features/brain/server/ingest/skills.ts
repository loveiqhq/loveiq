import { supabaseFetch } from "@features/admin/server/supabase";
import logger from "@shared/observability/logger";
import { archetypeContent } from "@/data/report-archetypes";
import { sweepStale, upsertChunks, type BrainRow, type IngestResult } from "./upsert";
import { splitBody } from "./notion";

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
export function collapseToDocuments(rows: PromptDoc[], max = 40): PromptDoc[] {
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
    // A Drive "Copy of X" is a scratch duplicate of a prompt already listed. Measured
    // 2026-09-23: four of the twenty slots went to copies while nine real prompts —
    // the beliefs chapter's among them — were cut off alphabetically.
    if (/^copy of\b/i.test(title)) continue;
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

/**
 * The voice, counted off what shipped rather than described from memory.
 *
 * Per chapter, deliberately. The corpus-wide figure hides the rule that actually matters:
 * `insecurities` and `relationship_form` address the reader in all 14 shipped versions
 * while `core_archetype` and a dozen others never do, so a global "write in third person"
 * would be wrong for two chapters and a global average would be wrong for all of them.
 */
export function measuredVoice(): {
  chapters: number;
  archetypes: number;
  medianSentenceWords: number;
  secondPersonBlocks: number;
  totalBlocks: number;
  thirdPersonChapters: string[];
  secondPersonChapters: string[];
  mixedChapters: string[];
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

  // Group the chapters by what their shipped versions actually do.
  const third: string[] = [];
  const second: string[] = [];
  const mixed: string[] = [];
  for (const chapter of chapters) {
    const versions = Object.entries(archetypeContent[chapter] ?? {});
    if (versions.length === 0) continue;
    const withYou = versions.filter(([, html]) =>
      /\byou\b|\byour\b/i.test(String(html).replace(/<[^>]+>/g, " "))
    ).length;
    if (withYou === 0) third.push(chapter);
    else if (withYou === versions.length) second.push(chapter);
    else mixed.push(chapter);
  }

  return {
    chapters: chapters.length,
    archetypes: archetypes.size,
    medianSentenceWords: lengths[Math.floor(lengths.length / 2)] ?? 0,
    secondPersonBlocks: secondPerson,
    totalBlocks: blocks,
    thirdPersonChapters: third,
    secondPersonChapters: second,
    mixedChapters: mixed,
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
    "Start by reading the team's own prompt document for the chapter you are writing — they",
    "are listed at the end of this skill. They are live and edited, so read them rather than",
    "working from anything remembered.",
    "",
    "A CHAPTER IS NOT A BLANK PAGE.",
    `It is one of ${v.chapters} chapters written ${v.archetypes} times, once per archetype. Read what`,
    'shipped for ANOTHER archetype of the same chapter first: search sources:["report"],',
    'every one of which is titled "as shipped". Only `practices` has a fixed heading skeleton',
    "repeated across all archetypes; 19 of the 24 chapters carry no headings at all, and in",
    "four more the headings are archetype-specific content rather than structure. So match the",
    "chapter you are extending, and do not assume a skeleton that is not there.",
    "",
    "REGISTER IS A PROPERTY OF THE CHAPTER, NOT A HOUSE PREFERENCE.",
    "This is the rule most easily got wrong, and the corpus-wide average hides it. Counted",
    "per chapter across all 14 shipped versions:",
    `  - third person in EVERY version: ${v.thirdPersonChapters.join(", ")}`,
    `  - second person in EVERY version: ${v.secondPersonChapters.join(", ")}`,
    v.mixedChapters.length
      ? `  - inconsistent in the shipped copy, so there is no baseline: ${v.mixedChapters.join(", ")}`
      : "",
    "A draft that is correct in one chapter is wrong in another. The team agreed on 2026-09-08",
    'to describe the archetype rather than the reader ("The Sensual Connector experiences...",',
    'not "You experience..."), which is where the third-person chapters come from.',
    "",
    "SENTENCE LENGTH also varies by chapter, from about 12 words to about 22. The corpus-wide",
    "median is not a target; the chapter you are extending is.",
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
    "",
    "THE TEAM'S PROMPT DOCUMENTS, one per chapter:",
    promptLines,
  ].join("\n");

  /**
   * SPLIT, DO NOT LET THE WRITE PATH TRUNCATE.
   *
   * `upsertChunks` cuts every body at 2,400 characters. This skill runs to about 5,000,
   * and it used to open with the list of prompt documents — so for its whole life the
   * stored row was the list and nothing else, cut off mid-link, with every rule below it
   * gone. The tests stayed green because their fixture had one prompt.
   *
   * Rules first, pointers last, split on paragraph boundaries by the shared splitter.
   * Still ONE DOCUMENT to the reader: every part carries `meta.part`, which is what
   * `brain_search` collapses on, so a search returns the best-matching part once and
   * `fetch_document` returns them all in order.
   */
  const title =
    "How we write a report chapter at LoveIQ — house voice, chapter structure, " +
    "review protocol, and how to draft one";
  const parts = splitBody(body);
  return parts.map((text, i) => ({
    source: SOURCE,
    source_id: i === 0 ? "write-a-report-chapter" : `write-a-report-chapter#${i + 1}`,
    title: parts.length > 1 ? `${title} (part ${i + 1} of ${parts.length})` : title,
    url: null,
    body: text,
    meta: {
      skill: "write-a-report-chapter",
      chapters: v.chapters,
      archetypes: v.archetypes,
      part: i + 1,
      parts: parts.length,
    },
    updated_at: stampedAt,
    period_end: null,
  }));
}

export async function ingestSkills(stampedAt: string): Promise<IngestResult> {
  const rows = buildSkillRows(stampedAt, await promptDocs());
  if (rows.length === 0) return { source: SOURCE, rows: 0, swept: 0, skipped: "skill-empty" };
  const written = await upsertChunks(rows);
  const swept = await sweepStale(SOURCE, stampedAt, written);
  return { source: SOURCE, rows: written, swept };
}
