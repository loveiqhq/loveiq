"use client";

import { useLayoutEffect, type RefObject } from "react";

/**
 * The closed teaser's fade — Report V4, Mark's rehaul (28.09).
 *
 * Every closed "Try this" and "Learn more" frame greys the LAST THREE LINES its
 * teaser box shows, one colour a line: #7e7e7e, #b5b5b5, #e5e5e5 — black at 50%,
 * 29% and 10%. Where those lines sit depends on where the paragraph gaps fall
 * (153:2240 breaks above its last line, 368:5450 and the practices three lines
 * higher, 235:234 not at all), so a fixed gradient lands a line off on some cards.
 * This measures the lines and sets `--rv4-fade-1..3` on the box: where the first
 * grey line starts, then the second and the third. The mask in reportV3.css steps
 * at them, and falls back to the box's last three 22.4px lines until they are set.
 *
 * Measured again when the box changes width, whenever a web font finishes loading
 * and whenever it comes on screen — the same three triggers as useRampFit, for the
 * same reasons.
 */

/** Fragments closer than this share a line (a bold run beside a regular one). */
const SAME_LINE_PX = 4;

const round = (px: number) => Math.round(px * 100) / 100;

/**
 * The three steps for lines centred at `centres` (px from the box's top) in a box
 * `boxHeight` tall: each is the boundary above one of the last three lines the box
 * shows, midway between that line and the one before it. Null under three lines.
 */
export const teaserFadeSteps = (
  centres: readonly number[],
  boxHeight: number
): [number, number, number] | null => {
  const shown = centres.filter((c) => c < boxHeight);
  if (shown.length < 3) return null;
  const [c1, c2, c3] = shown.slice(-3) as [number, number, number];
  const c0 = shown.length > 3 ? shown[shown.length - 4]! : c1 - (c2 - c1);
  return [round((c0 + c1) / 2), round((c1 + c2) / 2), round((c2 + c3) / 2)];
};

/** The centre of every line of text inside `box`, top to bottom, from its top. */
const lineCentres = (box: HTMLElement): number[] => {
  const top = box.getBoundingClientRect().top;
  const centres: number[] = [];
  const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    // The fragments with any width: WebKit reports an empty one at the end of the
    // line above a wrap.
    for (const box of Array.from(range.getClientRects?.() ?? [])) {
      if (box.width > 0) centres.push((box.top + box.bottom) / 2 - top);
    }
    range.detach?.();
  }
  centres.sort((a, b) => a - b);
  return centres.reduce<number[]>((lines, c) => {
    const last = lines[lines.length - 1];
    if (last === undefined || c - last > SAME_LINE_PX) lines.push(c);
    return lines;
  }, []);
};

export function useTeaserFade(ref: RefObject<HTMLElement | null>, enabled = true): void {
  useLayoutEffect(() => {
    const box = ref.current;
    if (!enabled || !box) return;
    let live = true;
    const fit = () => {
      if (!live) return;
      const steps = teaserFadeSteps(lineCentres(box), box.getBoundingClientRect().height);
      [1, 2, 3].forEach((i) => {
        const step = steps?.[i - 1];
        if (step === undefined) box.style.removeProperty(`--rv4-fade-${i}`);
        else box.style.setProperty(`--rv4-fade-${i}`, `${step}px`);
      });
    };
    fit();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    observer?.observe(box);
    const onScreen =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) fit();
          });
    onScreen?.observe(box);
    // A face that lands later re-wraps the copy without resizing the fixed box.
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    fonts?.ready.then(fit).catch(() => {});
    fonts?.addEventListener?.("loadingdone", fit);
    return () => {
      live = false;
      observer?.disconnect();
      onScreen?.disconnect();
      fonts?.removeEventListener?.("loadingdone", fit);
    };
  }, [ref, enabled]);
}
