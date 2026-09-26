"use client";

import { useLayoutEffect, type RefObject } from "react";

/**
 * Keeps a paywall ramp's fade off its veiled tail — Report V4.
 *
 * A ramp paragraph fades in over an anchor sentence; the rest of it, the `veiled`
 * runs (splitRamp), belongs under the full blur — the real copy since review 26.09,
 * scrambled in decoy mode (lockedBlurCopy.ts). The anchor is chosen so that on a
 * phone it outlasts the fade band. In the 552–590px tablet/desktop column the same
 * sentence runs to fewer lines, so the tail rose into the band's light blur and read
 * as gibberish (review 25.09); the real copy would read outright. This measures
 * where the tail's first line starts and sets `--rv4-band-fit` on the ramp; CSS takes
 * the lesser of it and the drawn band, so phones keep the band exactly as drawn.
 *
 * Measured again when the ramp changes size (the column, or a collapsed chapter
 * opening), whenever a web font finishes loading (which moves the wrap; Chromium and
 * Firefox say so), and whenever the ramp comes on screen (Safari does not).
 */
export function useRampFit(ref: RefObject<HTMLElement | null>, enabled = true): void {
  useLayoutEffect(() => {
    const ramp = ref.current;
    if (!enabled || !ramp) return;
    let live = true;
    const fit = () => {
      if (!live) return;
      // The first box with any width: Safari reports an empty one at the end of the
      // line above when the tail's first word wraps.
      const boxes = ramp.querySelector(".rv4-prose__veiled")?.getClientRects();
      const first = Array.from(boxes ?? []).find((box) => box.width > 0);
      if (!first) {
        ramp.style.removeProperty("--rv4-band-fit");
        return;
      }
      const offset = first.top - ramp.getBoundingClientRect().top;
      ramp.style.setProperty("--rv4-band-fit", `${Math.max(0, Math.round(offset * 100) / 100)}px`);
    };
    fit();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    observer?.observe(ramp);
    // And each time it comes on screen, which is the only time the fade is seen:
    // Safari fires no font events for a face that lands after mount.
    const onScreen =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) fit();
          });
    onScreen?.observe(ramp);
    // A face that lands later re-wraps the paragraph without resizing the ramp when the
    // line count holds, so the observer alone would miss it.
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
