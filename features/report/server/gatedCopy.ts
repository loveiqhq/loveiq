/**
 * The paywall split every V4 chapter body shares — Typical Beliefs (Figma 348:213)
 * and Accelerator & Brakes (314:211): clear blocks, then ONE ramp block the blur
 * fades in over, then a rest that is only ever seen under the full blur.
 *
 * Decided on the server, so the browser never decides where the wall falls, and
 * scrambled on the server, because a CSS blur is paint only
 * (LockedPreviewImage.tsx:6-12): anything a locked reader only ever sees fully
 * blurred leaves here as scrambleLockedText's same-shape stand-in (Fatih's call,
 * 2026-09-23).
 *
 * No paid copy lives here — the chapter modules own it and call in — so any module
 * can import this without dragging another chapter's copy into its graph. The
 * `Report3Block` import is type-only and is erased.
 */

import type { Report3Block } from "@/data/report3-learn-more";
import { scrambleLockedText } from "./scrambleLockedText";

/**
 * One gated passage as the reader receives it.
 *
 * Unlocked: everything in `free`, `ramp` null, `rest` empty.
 * Locked: `free` is readable; `ramp` is the block the blur fades in over, real
 * copy where the light end of the ramp is legible; `rest` sits under the full blur
 * and is scrambled — same shape, no content.
 */
export interface Report3GatedCopy {
  free: readonly Report3Block[];
  ramp: Report3Block | null;
  rest: readonly Report3Block[];
}

/** A chapter's "Try this & see what shifts" card (374:217 / 377:221). */
export interface Report3PracticeView extends Report3GatedCopy {
  eyebrow: string;
  title: string;
  locked: boolean;
  /**
   * The closed card's teaser, when the frame sets it apart from the open copy —
   * 377:221 breaks its first paragraph differently from 374:304. Absent, the card
   * derives the teaser itself (Typical Beliefs, 375:270). Built only from free
   * copy, so a locked reader's teaser is the same as everyone's.
   */
  teaser?: readonly Report3Block[];
}

export const scrambleBlock = (block: Report3Block): Report3Block => {
  if (block.kind === "heading") return { ...block, text: scrambleLockedText(block.text) };
  if (block.kind === "list") {
    return {
      ...block,
      items: block.items.map((runs) =>
        runs.map((run) => ({ ...run, text: scrambleLockedText(run.text) }))
      ),
    };
  }
  return {
    ...block,
    runs: block.runs.map((run) => ({ ...run, text: scrambleLockedText(run.text) })),
  };
};

/** Splits a passage at `freeBlocks`: clear, ramp, then scrambled rest. */
export const gate = (
  blocks: readonly Report3Block[],
  freeBlocks: number,
  locked: boolean
): Report3GatedCopy =>
  locked
    ? {
        free: blocks.slice(0, freeBlocks),
        ramp: blocks.at(freeBlocks) ?? null,
        rest: blocks.slice(freeBlocks + 1).map(scrambleBlock),
      }
    : { free: blocks, ramp: null, rest: [] };

/**
 * A ramp paragraph whose tail runs on under the FULL blur.
 *
 * The blur fades in over the ramp's first lines only — two in 314:307, four in
 * 375:221 — and everything after them in the same paragraph is only ever seen
 * fully blurred, so by the rule above it should not leave as real copy. This keeps
 * the paragraph real through `realThrough` (the end of a sentence chosen so the
 * fade band is real text on every phone) and scrambles the rest of it in place,
 * run by run, so it stays one paragraph that wraps like the original.
 *
 * Returns the block untouched when it is not a paragraph or the sentence is not in
 * it — the ramp then stays wholly real, as Typical Beliefs' does, rather than
 * breaking the page; acceleratorsGating.test.ts pins that the authored anchors are
 * found.
 */
export const splitRamp = (block: Report3Block, realThrough: string): Report3Block => {
  if (block.kind !== "para") return block;
  const at = block.runs
    .map((run) => run.text)
    .join("")
    .indexOf(realThrough);
  if (at < 0) return block;
  const cut = at + realThrough.length;
  let start = 0;
  return {
    ...block,
    runs: block.runs.flatMap((run) => {
      const end = start + run.text.length;
      const from = start;
      start = end;
      if (end <= cut) return [run];
      if (from >= cut) return [{ ...run, text: scrambleLockedText(run.text) }];
      return [
        { ...run, text: run.text.slice(0, cut - from) },
        { ...run, text: scrambleLockedText(run.text.slice(cut - from)) },
      ];
    }),
  };
};
