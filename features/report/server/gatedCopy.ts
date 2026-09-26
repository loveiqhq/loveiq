/**
 * The paywall split every V4 chapter body shares — Typical Beliefs (Figma 348:213)
 * and Accelerator & Brakes (314:211): clear blocks, then ONE ramp block the blur
 * fades in over, then a rest that is only ever seen under the full blur.
 *
 * Decided on the server, so the browser never decides where the wall falls. What
 * a locked reader only ever sees fully blurred leaves as the copy itself or as
 * scrambleLockedText's same-shape stand-in, by the switch in lockedBlurCopy.ts: real
 * since review 26.09 (Mark: "the unlocked content but blurred"; Fatih's call), decoys
 * from 23.09 — a CSS blur is paint only (LockedPreviewImage.tsx:6-12).
 *
 * No paid copy lives here — the chapter modules own it and call in — so any module
 * can import this without dragging another chapter's copy into its graph. The
 * `Report3Block` import is type-only and is erased.
 */

import type { Report3Block } from "@/data/report3-learn-more";
import { LOCKED_BLUR_COPY } from "./lockedBlurCopy";
import { scrambleLockedText } from "./scrambleLockedText";

/**
 * One gated passage as the reader receives it.
 *
 * Unlocked: everything in `free`, `ramp` null, `rest` empty.
 * Locked: `free` is readable; `ramp` is the block the blur fades in over, real
 * copy where the light end of the ramp is legible; `rest` sits under the full blur
 * — the copy itself, or its same-shape stand-in in decoy mode.
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

/** True while a locked reader's page carries the real copy under the blur. */
export const lockedBlurIsReal = (): boolean => LOCKED_BLUR_COPY === "real";

/** Copy a locked reader only ever sees blurred: as written, or its decoy. */
export const veilText = (text: string): string =>
  lockedBlurIsReal() ? text : scrambleLockedText(text);

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

/** A block a locked reader only ever sees blurred: as written, or scrambled. */
export const veilBlock = (block: Report3Block): Report3Block =>
  lockedBlurIsReal() ? block : scrambleBlock(block);

/** Splits a passage at `freeBlocks`: clear, ramp, then the blurred rest. */
export const gate = (
  blocks: readonly Report3Block[],
  freeBlocks: number,
  locked: boolean
): Report3GatedCopy =>
  locked
    ? {
        free: blocks.slice(0, freeBlocks),
        ramp: blocks.at(freeBlocks) ?? null,
        rest: blocks.slice(freeBlocks + 1).map(veilBlock),
      }
    : { free: blocks, ramp: null, rest: [] };

/**
 * A ramp paragraph whose tail runs on under the FULL blur.
 *
 * The blur fades in over the ramp's first lines only — two in 314:307, four in
 * 375:221 — and everything after them in the same paragraph is only ever seen
 * fully blurred. This splits the paragraph after `realThrough` (the end of a sentence
 * chosen so the fade band covers it on every phone) and veils the rest in place, run
 * by run (veilText: as written, or scrambled in decoy mode), so it stays one
 * paragraph that wraps like the original. The tail runs are marked `veiled`: a wider
 * column runs the first part to fewer lines, and the page uses the mark to end the
 * fade where the full blur takes over (useRampFit).
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
      if (from >= cut) return [{ ...run, text: veilText(run.text), veiled: true }];
      return [
        { ...run, text: run.text.slice(0, cut - from) },
        { ...run, text: veilText(run.text.slice(cut - from)), veiled: true },
      ];
    }),
  };
};
