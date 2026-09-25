import { useEffect } from "react";

/**
 * Opening a Report V4 chapter from elsewhere on the page — Part II's chapter nudges
 * ("Read full chapter", Figma 663:1089). A window event rather than a context: the
 * chapters it opens are V4Chapter (Typical Beliefs, Accelerators & Brakes, CiP) and
 * V3's accordion under V4 (every other chapter, and all four for the thirteen
 * archetypes still on V2), and the standalone /report-v4-preview has no provider.
 */

export const V4_OPEN_CHAPTER_EVENT = "rv4:open-chapter";

/** Asks the chapter with this section id to open. */
export function openV4Chapter(sectionId: string): void {
  window.dispatchEvent(new CustomEvent<string>(V4_OPEN_CHAPTER_EVENT, { detail: sectionId }));
}

/**
 * Opens a chapter, then jumps to it on the next frame — once it has laid out open —
 * the way the chapter drawer jumps: instantly, because a smooth scroll fixes its
 * destination as it starts and content it passes can still grow. The page's
 * `scroll-margin-top` clears the floating chrome. Focus follows to the chapter's
 * toggle, so a keyboard reader lands where a pointer does.
 */
export function goToV4Chapter(sectionId: string): void {
  openV4Chapter(sectionId);
  requestAnimationFrame(() => {
    const chapter = document.getElementById(sectionId);
    if (!chapter) return;
    chapter.scrollIntoView({ block: "start", behavior: "instant" as ScrollBehavior });
    chapter.querySelector<HTMLElement>("[aria-expanded]")?.focus({ preventScroll: true });
  });
}

/**
 * Calls `onOpen` when this section is asked to open. `enabled` lets a component
 * that must call its hooks unconditionally (V3Chapter serves V3 too) listen only
 * under V4. `onOpen` should be stable — a state setter wrapped once.
 */
export function useOnV4OpenChapter(
  sectionId: string | undefined,
  onOpen: () => void,
  enabled = true
): void {
  useEffect(() => {
    if (!enabled || !sectionId) return;
    const handle = (event: Event) => {
      if ((event as CustomEvent<string>).detail === sectionId) onOpen();
    };
    window.addEventListener(V4_OPEN_CHAPTER_EVENT, handle);
    return () => window.removeEventListener(V4_OPEN_CHAPTER_EVENT, handle);
  }, [sectionId, onOpen, enabled]);
}
