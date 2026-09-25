/**
 * Server-side premium-content filters.
 *
 * Product decision (see plan "whimsical-greeting-popcorn"): on locked
 * premium sections we ship the archetype prose so the client can render
 * it blurred behind a `PremiumOverlay` (visual tease). Practice-tendency
 * metric values stay server-stripped — the numbers are the paid value
 * and must not reach the DOM. Practice names ship in full so the locked
 * rows can show what's there.
 *
 * Inputs:
 *   - `accessPlan`: null | "essentials" | "full_report" | "core" | "all_reports"
 *   - `unlockedArchetypes`: every archetype this user can read for the
 *     sections their plan covers (always includes the primary archetype)
 *
 * Outputs are keyed by:
 *   - archetypeContent: { blockId: { archetypeName: html } }
 *   - practiceTendencies: { archetypeName: { introBlocks, groups[] } }
 */

import { archetypeContent } from "@/data/report-archetypes";
import { reportPracticeTendencies } from "@/data/report-practice-tendencies";
import { reportSections } from "@/data/report-general";
import { isSectionUnlockedForPlan, type ReportAccessPlan } from "@features/report/server/access";
import { summaryArchetypeContent } from "@/data/report-summary";
import type {
  Report3Block,
  Report3LearnMoreArticle,
  Report3LearnMoreView,
  V4LearnMoreByChapter,
  V4LearnMoreState,
} from "@/data/report3-learn-more";
import type { Report3Chapter, Report3Run } from "@/data/report3-archetype-page";

export const PRACTICE_SECTION_ID = "typical_sexual_fantasy_amp_practice_tendencies";

/**
 * Withhold the "Learn:" disclosure body from a locked section.
 *
 * Every section copy carries universal educational slots. The eyebrow and the
 * one-line `edu.teaser` are the tease and stay — they're what makes the reader
 * want the section. The body paragraphs (`edu.body.*`) and the enumerated
 * structure list (`edu.struct.*`) are the paid asset.
 *
 * These used to ship whole regardless of `locked`, and the peek→expand control
 * that reveals them is client-side only — so a reader who had bought nothing
 * could open "Read the full explanation" and get all of it. Hiding the control
 * alone would not have been enough either: the prose would still sit in the
 * /api/report JSON for anyone reading the network tab. It has to come off the
 * wire, which is what this does.
 *
 * The one exception is the FIRST body paragraph, which ships as a short prefix
 * — see {@link LOCKED_EDU_BODY_TEASE_CHARS}.
 *
 * The `practical.*` sections (libido, initiation, insecurities) already gate
 * their own teaser and lines at the call site, so they need nothing here.
 */
/**
 * How much of the opening body paragraph a locked client receives.
 *
 * Figma's collapsed peek (8762:15709) is three lines whose last one breaks
 * mid-sentence: the teaser, then the start of the body. Nulling the body
 * outright left the third line BLANK on most chapters, because at desktop width
 * a line holds ~97 characters and the teasers run 197-290 — two to three lines,
 * no more. 140 characters is the smallest prefix that carries every chapter past
 * three lines, so the cut always lands inside a sentence the way the design
 * draws it. The remainder of p1 and every later paragraph stay on the server.
 */
const LOCKED_EDU_BODY_TEASE_CHARS = 140;

/**
 * Cut to `max` characters on a word boundary, with no ellipsis — Figma's peek
 * ends mid-word-free but mid-SENTENCE, and the fade sells the cut. Falls back to
 * a hard cut only if the prefix holds no late space (a 140-char single word).
 */
function clipToWordBoundary(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length <= max) return text || null;
  const head = text.slice(0, max);
  const lastSpace = head.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? head.slice(0, lastSpace) : head).trimEnd();
}

export function stripLockedEduBody<T extends { locked?: boolean }>(copy: T): T {
  if (!copy || typeof copy !== "object" || copy.locked !== true) return copy;

  const gated: Record<string, unknown> = { ...copy };
  for (const key of Object.keys(gated)) {
    if (key === "edu.body.p1") {
      gated[key] = clipToWordBoundary(gated[key], LOCKED_EDU_BODY_TEASE_CHARS);
    } else if (key.startsWith("edu.body.") || key.startsWith("edu.struct.")) {
      gated[key] = null;
    }
  }
  return gated as T;
}

/**
 * Apply {@link stripLockedEduBody} across a whole response payload.
 *
 * Section copies are top-level keys on the /api/report body, so gating here
 * covers every section at once — including any added later, which is the point:
 * a new section gets the gate for free instead of depending on whoever writes
 * it remembering to ask for one.
 */
export function stripLockedEduBodyFromPayload<T extends Record<string, unknown>>(payload: T): T {
  const out: Record<string, unknown> = { ...payload };
  for (const [key, value] of Object.entries(out)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const candidate = value as { locked?: boolean };
      if (candidate.locked === true) out[key] = stripLockedEduBody(candidate);
    }
  }
  return out as T;
}

export interface PracticeTendencyRowForUser {
  practice: string;
  fantasyPull: number | null;
  actualPleasure: number | null;
  description: string | null;
}

export interface PracticeTendencyGroupForUser {
  title: string;
  rows: PracticeTendencyRowForUser[];
  // Original group row count. Kept on the wire so the client can render
  // the right number of locked placeholder cells if a future change ships
  // fewer rows than the data file holds.
  totalRowCount: number;
}

export interface PracticeTendencyContentForUser {
  introBlocks: string[];
  groups: PracticeTendencyGroupForUser[];
}

/** Key the `summary` chapter's prose travels under inside `archetypeContent`. */
export const SUMMARY_BLOCK_ID = "summary";

export function buildArchetypeContentForUser(
  accessPlan: ReportAccessPlan,
  unlockedArchetypes: string[]
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  const unlockedSet = new Set(unlockedArchetypes);

  for (const section of reportSections) {
    if (!section.archetypeBlockId) continue;
    const block = archetypeContent[section.archetypeBlockId];
    if (!block) continue;

    // Always ship archetype prose. The client renders it blurred behind
    // a PremiumOverlay when `isSectionUnlockedForPlan` is false. Whether
    // the section is locked is recomputed on the client from `accessPlan`.
    for (const archetype of unlockedSet) {
      const html = block[archetype];
      if (!html) continue;
      if (!result[section.archetypeBlockId]) {
        result[section.archetypeBlockId] = {};
      }
      // Just initialised above; the lookup is defined.
      result[section.archetypeBlockId]![archetype] = html;
    }
  }

  /**
   * The `summary` chapter is premium but has no `archetypeBlockId`, so it fell
   * outside the loop above and the client imported `data/report-summary.ts`
   * directly instead. That put every archetype's premium summary — Core
   * Essence, Key Strengths, Core Challenges — into the public JS bundle, where
   * a reader who had bought nothing could read all fourteen. Exactly the leak
   * `__tests__/security/premium-content-bundle.test.ts` was written to stop,
   * through a module that test did not list.
   *
   * Ship it under the same rule as every other chapter: unlocked archetypes
   * only. Per-SECTION locking still happens on the client, so an owner still
   * sees it blurred behind the paywall rather than missing.
   */
  for (const archetype of unlockedSet) {
    const html = summaryArchetypeContent[archetype];
    if (!html) continue;
    if (!result[SUMMARY_BLOCK_ID]) result[SUMMARY_BLOCK_ID] = {};
    result[SUMMARY_BLOCK_ID]![archetype] = html;
  }

  return result;
}

export function buildPracticeTendenciesForUser(
  accessPlan: ReportAccessPlan,
  unlockedArchetypes: string[],
  archetypeTiers: Record<string, "essentials" | "full_report"> = {}
): Record<string, PracticeTendencyContentForUser> {
  const result: Record<string, PracticeTendencyContentForUser> = {};
  const practiceSection = reportSections.find((s) => s.id === PRACTICE_SECTION_ID);
  if (!practiceSection) return result;

  for (const archetype of unlockedArchetypes) {
    const content = reportPracticeTendencies[archetype];
    if (!content) continue;

    // Gate per-archetype: the practice section is full_report-tier, so it
    // unlocks for an archetype held at full_report (core's top-3, full_report's
    // own, all_reports' everything) but stays locked at essentials tier. The
    // earlier GLOBAL check broke `core` — its plan isn't in the tier fallback,
    // so it stripped scores from the very top-3 the buyer paid to unlock.
    const sectionUnlocked = isSectionUnlockedForPlan({
      accessPlan,
      archetypeTier: archetypeTiers[archetype] ?? null,
      isPremium: practiceSection.isPremium ?? false,
      sectionId: practiceSection.id,
    });

    if (sectionUnlocked) {
      result[archetype] = {
        introBlocks: content.introBlocks,
        groups: content.groups.map((g) => ({
          title: g.title,
          rows: g.rows.map((row) => ({ ...row })),
          totalRowCount: g.rows.length,
        })),
      };
    } else {
      // Locked — keep practice names and the free-preview row's numbers,
      // null out scores on every other row so cells render "--" with the
      // existing CSS blur. Names tease what's behind the paywall; metric
      // numbers are the paid value and must stay out of the DOM.
      result[archetype] = {
        introBlocks: content.introBlocks,
        groups: content.groups.map((g) => ({
          title: g.title,
          rows: g.rows.map((row, i) =>
            i === 0 ? { ...row } : { ...row, fantasyPull: null, actualPleasure: null }
          ),
          totalRowCount: g.rows.length,
        })),
      };
    }
  }
  return result;
}

/* ─── "Go deeper & learn more" article gating ────────────────────────────────
 * Figma 153:2280 / 235:317 / 244:320. Sits here rather than in its own module so
 * it can reuse `clipToWordBoundary` above, which is private to this file and is
 * exactly the cut the design needs: word boundary, no ellipsis, the fade sells it. */

/**
 * How the article's 358px column lays out, used to predict how much copy the
 * blurred window can actually show. Measured in a browser at 393px, not assumed:
 * Plus Jakarta Sans 14/22.4 fits about fifty characters to a line there.
 */
const ARTICLE_CHARS_PER_LINE = 50;
/** The list sits in a 337px column — `.rv4-prose__list` has 21px of padding. */
const ARTICLE_LIST_CHARS_PER_LINE = 48;
/** Lora Bold 16 is wider per character; rounded HIGH, see the note below. */
const ARTICLE_HEADING_CHARS_PER_LINE = 45;
const ARTICLE_LINE_PX = 22.4;
const ARTICLE_HEADING_LINE_PX = 19.2;
const ARTICLE_GAP_PX = 16;
const ARTICLE_GAP_BEFORE_HEADING_PX = 26;
const ARTICLE_GAP_AFTER_HEADING_PX = 14;
const ARTICLE_LIST_ITEM_GAP_PX = 8;

/**
 * Mirrors `.rv4-learn__gated`'s matching min/max-height in reportV3.css.
 *
 * 656 = the 580px uniformly blurred window (170:231) plus the 76px band above it
 * (411:5694) where the blur ramps up from nothing — the progressive blur Mark
 * asked for, which Figma draws as three more lines of the same gated copy. The
 * window grew by exactly that band, so a locked reader is sent about three more
 * lines than before and still nothing past what the window shows.
 */
export const LOCKED_ARTICLE_WINDOW_PX = 656;

/**
 * One line of slack above the window.
 *
 * Derived, not chosen: one line of over-fill is the hand-tuned tail that was
 * checked against Figma before this loop existed (for Typical Beliefs at the old
 * 580px window: ceil((580 - 518.4 + 22.4) / 22.4) = 4 lines = 200 characters).
 * Beyond one line the tolerance is structural and free anyway: the 63px fade and
 * the card covering 90-281px hide a small shortfall, so paying for more margin in
 * leaked characters buys nothing.
 */
export const LOCKED_ARTICLE_OVERFILL_PX = ARTICLE_LINE_PX;

/**
 * Hard ceiling on leakage, whatever the estimator asks for.
 *
 * What reaches a locked browser is readable by deleting one CSS line — the blur is
 * a paint effect and nothing more (LockedPreviewImage.tsx:6-12) — so the quantity
 * shipped is a LEAK BUDGET, not a layout number. The window holds four blocks of
 * Typical Beliefs, four of Accelerator & Brakes and eight of Fantasy vs. Reality,
 * whose paragraphs are much shorter. Twelve should never bind; if it ever does,
 * that is the signal to re-measure rather than to raise it.
 */
export const LOCKED_ARTICLE_MAX_GATED_BLOCKS = 12;

/** Every character a block renders, for estimating and for leak checks. */
function blockText(block: Report3Block): string {
  if (block.kind === "heading") return block.text;
  if (block.kind === "para") return block.runs.map((r) => r.text).join("");
  return block.items.map((runs) => runs.map((r) => r.text).join("")).join(" ");
}

/**
 * Predict a block's rendered height, WITHOUT its bottom margin.
 *
 * Run weight is deliberately ignored. Bold is about 10% tighter per character, so
 * weighting for it would estimate a bold paragraph TALLER, stop the loop earlier
 * and risk under-filling the window. Unweighted, a bold-heavy block renders taller
 * than predicted, the loop keeps going, and the window over-fills. The error
 * points the safe way. The two unmeasured constants above are rounded high for the
 * same reason — a higher chars-per-line means fewer lines, a lower estimate, and
 * one more block kept.
 */
export function estimateBlockContentPx(block: Report3Block): number {
  const lines = (text: string, perLine: number) => Math.max(1, Math.ceil(text.length / perLine));
  if (block.kind === "heading") {
    return lines(block.text, ARTICLE_HEADING_CHARS_PER_LINE) * ARTICLE_HEADING_LINE_PX;
  }
  if (block.kind === "para") {
    return lines(blockText(block), ARTICLE_CHARS_PER_LINE) * ARTICLE_LINE_PX;
  }
  return block.items.reduce(
    (px, runs, i) =>
      px +
      lines(runs.map((r) => r.text).join(""), ARTICLE_LIST_CHARS_PER_LINE) * ARTICLE_LINE_PX +
      (i < block.items.length - 1 ? ARTICLE_LIST_ITEM_GAP_PX : 0),
    0
  );
}

/**
 * The gap below `block`. Zero when nothing follows it — `.rv4-learn__gated >
 * :last-child` drops the rule, and counting it anyway inflates every estimate.
 */
function gapAfterPx(block: Report3Block, next: Report3Block | undefined): number {
  if (!next) return 0;
  if (next.kind === "heading") return ARTICLE_GAP_BEFORE_HEADING_PX;
  if (block.kind === "heading") return ARTICLE_GAP_AFTER_HEADING_PX;
  if (block.kind === "para" && block.tight) return 0;
  return ARTICLE_GAP_PX;
}

/** Predict what a run of blocks renders at, gaps between them included. */
export function estimateBlocksPx(blocks: readonly Report3Block[]): number {
  return blocks.reduce(
    (px, block, i) => px + estimateBlockContentPx(block) + gapAfterPx(block, blocks.at(i + 1)),
    0
  );
}

/**
 * Is this article's gate closed for this reader?
 *
 * Mirrors the 19 call sites in app/api/report/route.ts: resolve the section, ask
 * `isSectionUnlockedForPlan`, hand the UI a boolean. A chapter id with no section
 * row is free by construction — the rule ReportPage.tsx:794 records for
 * `snapshot`, `map` and `constellation`.
 */
export function isLearnMoreArticleLocked({
  article,
  accessPlan,
  archetypeTier,
}: {
  article: Pick<Report3LearnMoreArticle, "chapterId" | "gateSectionId">;
  accessPlan: ReportAccessPlan;
  archetypeTier?: "essentials" | "full_report" | null;
}): boolean {
  const sectionId = article.gateSectionId ?? article.chapterId;
  const section = reportSections.find((s) => s.id === sectionId);
  if (!section) return false;
  return !isSectionUnlockedForPlan({
    accessPlan,
    archetypeTier,
    isPremium: section.isPremium,
    sectionId,
  });
}

/** Clip one block to `max` characters across its runs, keeping run styling. */
function clipBlock(block: Report3Block, max: number): Report3Block | null {
  // A heading or a list is kept whole or not at all — half a list reads as a bug
  // rather than as a cut, and neither is ever the block the window lands on.
  if (block.kind !== "para") return block;

  const runs: Report3Run[] = [];
  let budget = max;
  for (const run of block.runs) {
    if (budget <= 0) break;
    if (run.text.length <= budget) {
      runs.push(run);
      budget -= run.text.length;
      continue;
    }
    // `clipToWordBoundary` trims both ends, which would weld this run onto the
    // previous word when the run opens on a space. Put that one space back.
    const lead = run.text.startsWith(" ") ? " " : "";
    const clipped = clipToWordBoundary(run.text, budget);
    if (clipped) runs.push({ ...run, text: lead + clipped });
    budget = 0;
  }
  return runs.length > 0 ? { kind: "para", runs } : null;
}

/** Split a paragraph's runs at a character offset, preserving each run's styling. */
function splitParaAt(
  block: Report3Block,
  offset: number
): [Report3Block | null, Report3Block | null] {
  if (block.kind !== "para") return [block, null];
  const head: Report3Run[] = [];
  const tail: Report3Run[] = [];
  let seen = 0;
  for (const run of block.runs) {
    const start = seen;
    seen += run.text.length;
    if (seen <= offset) {
      head.push(run);
    } else if (start >= offset) {
      tail.push(run);
    } else {
      const cut = offset - start;
      head.push({ ...run, text: run.text.slice(0, cut) });
      tail.push({ ...run, text: run.text.slice(cut) });
    }
  }
  // The cut lands after a full stop, so the paid half opens on a space.
  if (tail.length > 0 && tail[0]) tail[0] = { ...tail[0], text: tail[0].text.replace(/^\s+/, "") };
  return [
    head.length > 0 ? { kind: "para", runs: head } : null,
    tail.length > 0 ? { kind: "para", runs: tail } : null,
  ];
}

/**
 * Divide the authored article into what is free and what is paid.
 *
 * Usually `paywallAt` is a clean paragraph boundary. Fantasy vs. Reality cuts
 * INSIDE a paragraph — its free copy stops mid-way (482:6479) and the blurred
 * window resumes in the same paragraph — which is why the article is stored whole
 * and divided here rather than pre-split in the data.
 */
function partitionArticle(article: Report3LearnMoreArticle): {
  free: Report3Block[];
  gated: Report3Block[];
} {
  const free = [...article.blocks.slice(0, article.paywallAt)];
  const rest = [...article.blocks.slice(article.paywallAt)];
  const first = rest[0];
  if (article.paywallCharOffset === undefined || !first) return { free, gated: rest };

  const [head, tail] = splitParaAt(first, article.paywallCharOffset);
  if (head) free.push(head);
  return { free, gated: tail ? [tail, ...rest.slice(1)] : rest.slice(1) };
}

/** Keep only as many paid blocks as the blurred window can actually show. */
function trimToWindow(
  gated: readonly Report3Block[],
  windowPx: number = LOCKED_ARTICLE_WINDOW_PX
): Report3Block[] {
  const kept: Report3Block[] = [];
  /** Height of everything above the block that straddles the fold. */
  let above = 0;

  for (const [i, block] of gated.entries()) {
    if (kept.length >= LOCKED_ARTICLE_MAX_GATED_BLOCKS) break;
    kept.push(block);
    const content = estimateBlockContentPx(block);
    if (above + content >= windowPx) break;
    above += content + gapAfterPx(block, gated.at(i + 1));
  }

  const last = kept[kept.length - 1];
  // A heading or a list is kept whole, so there is nothing to clip.
  if (!last || last.kind !== "para") return kept;

  const need = windowPx - above + LOCKED_ARTICLE_OVERFILL_PX;
  let budget = Math.ceil(need / ARTICLE_LINE_PX) * ARTICLE_CHARS_PER_LINE;
  let clipped = clipBlock(last, budget);

  // Verify the result, do not trust the request: clipToWordBoundary falls back to
  // the last space above 60% of `max`, so a 200-character ask can come back as
  // 121 — a whole line short. Escalate a line at a time until the window fills.
  const whole = blockText(last).length;
  while (clipped && budget < whole && above + estimateBlockContentPx(clipped) < windowPx) {
    budget += ARTICLE_CHARS_PER_LINE;
    clipped = clipBlock(last, budget);
  }

  return clipped ? [...kept.slice(0, -1), clipped] : kept.slice(0, -1);
}

/**
 * Hand a reader only the article they are entitled to.
 *
 * Unlocked readers get every block, in the order the expanded frame draws them.
 * Locked readers get the free portion plus only the paid blocks the gated window
 * (LOCKED_ARTICLE_WINDOW_PX) can show, the last word-clipped — `gatedBlockCount`
 * still reports the full paid length, so nothing downstream has to infer how much
 * was withheld.
 */
export function splitArticleForReader(
  article: Report3LearnMoreArticle,
  locked: boolean
): Report3LearnMoreView {
  const { free, gated } = partitionArticle(article);
  const view: Report3LearnMoreView = {
    eyebrow: article.eyebrow,
    label: article.label,
    teaserHeightPx: article.teaserHeightPx,
    // The closed card's own copy and geometry, when the frame sets them (235:234).
    // Free copy, so it travels to a locked reader unchanged.
    ...(article.teaser ? { teaser: article.teaser } : {}),
    ...(article.teaserPillBottomPx !== undefined
      ? { teaserPillBottomPx: article.teaserPillBottomPx }
      : {}),
    ...(article.closedPaddingBottomPx !== undefined
      ? { closedPaddingBottomPx: article.closedPaddingBottomPx }
      : {}),
    // The frames and the gate, when the article has its own (482:6479).
    ...(article.nodeIds ? { nodeIds: article.nodeIds } : {}),
    ...(article.gate ? { gate: article.gate } : {}),
    ...(article.paywallCharOffset !== undefined ? { continued: true as const } : {}),
    free,
    gated,
    gatedBlockCount: gated.length,
  };
  return locked ? { ...view, gated: trimToWindow(gated, article.gate?.windowPx) } : view;
}

/**
 * Build the learn-more record a reader is entitled to, for a list of chapters.
 *
 * The direct analogue of `navAccessById` (ReportPage.tsx:796-815): one gate call
 * per entry, made ONCE at the host, so nothing in the V4 component tree ever
 * sees an access plan. Chapters with no article are simply absent.
 *
 * `articles` is a PARAMETER rather than an import, on purpose. ReportPage.tsx:106
 * is a "use client" file that imports SUMMARY_BLOCK_ID from this module, so a
 * runtime import of the article data here would put tens of thousands of words of
 * paid copy one hop from the client graph — the exact shape of the bug
 * __tests__/security/premium-content-bundle.test.ts exists to catch. Passing it in
 * means this file never references the data at all.
 */
export function buildLearnMoreForReader({
  chapters,
  articles,
  accessPlan,
  archetypeTier,
}: {
  chapters: readonly Report3Chapter[];
  articles: Readonly<Record<string, Report3LearnMoreArticle>>;
  accessPlan: ReportAccessPlan;
  archetypeTier?: "essentials" | "full_report" | null;
}): V4LearnMoreByChapter {
  const out: Record<string, V4LearnMoreState> = {};
  for (const chapter of chapters) {
    if (!chapter.id) continue;
    const article = articles[chapter.id];
    if (!article) continue;
    // The article's own override wins; otherwise a chapter that borrows another
    // section's gate (reportV3Nav.ts:168-170) borrows it here too.
    const gateSectionId = article.gateSectionId ?? chapter.gateId;
    const locked = isLearnMoreArticleLocked({
      article: { chapterId: article.chapterId, gateSectionId },
      accessPlan,
      archetypeTier,
    });
    out[chapter.id] = { article: splitArticleForReader(article, locked), locked };
  }
  return out;
}
