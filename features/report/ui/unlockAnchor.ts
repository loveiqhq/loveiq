import { UNLOCK_ANCHOR_REGEX } from "@features/checkout/server/reportPurchase";
import { restoreScroll } from "@shared/ui/restore-scroll";
import { getSmoothScroll } from "@shared/ui/smooth-scroll-registry";
import { openV4Chapter } from "./v3/v4OpenChapter";

/**
 * "Anchor the user to the exact position were he unlocked." — the note on the paygate
 * frame's journey (Figma 1382:2010), beside the unlocked "Go deeper & learn more".
 *
 * Stripe sends a buyer back through /checkout/return to the report, which used to open
 * at its top: on Report V4, with every chapter closed again, a reader who paid from the
 * fifth chapter's article had to find their way back to it. So the spot travels with
 * the checkout instead — `"<sectionId>~<article>~<offset>~<y>"` in the success and
 * cancel URLs (UNLOCK_ANCHOR_REGEX) — and the report puts the reader back on it.
 *
 * WHAT IS RECORDED. Not `scrollY`: closed chapters, gated bands and teasers all change
 * height once the report is unlocked and reloaded, so a page offset lands somewhere
 * else. The spot is held relative to the nearest thing that keeps its place: the
 * chapter (`[data-report-section]`, which V1 to V4 all carry), or the "Learn more"
 * article inside it when the tap was in one — the article's free copy above the wall
 * reads the same before and after, so the wall's offset within it still points at the
 * first newly unlocked line. `y` is where on the screen that spot was, so it comes
 * back at the same height.
 *
 * WHAT IS THE SPOT. The element tapped to open the paywall when the tap was inside a
 * chapter (a gate, a lock, a locked chapter's head). Otherwise — the sticky footer, an
 * automatic pop-up, the archetype tiles — the line a reader is reading: a quarter of
 * the way down the screen.
 */

export interface UnlockAnchor {
  sectionId: string;
  /** Index of the "Learn more" article within the chapter, when the spot is in one. */
  article: number | null;
  /** Px from the top of the chapter (or article) to the spot. */
  offset: number;
  /** Px from the top of the screen to the spot when it was recorded. */
  y: number;
}

const SECTION_SELECTOR = "[data-report-section]";
const ARTICLE_SELECTOR = ".rv4-learn";
/** The reading line, as a share of the screen's height. */
const READING_LINE = 0.25;
/**
 * V3's accordion body opens on a 320ms transition (reportV3.css) and V3Chapter waits
 * 400ms for it (BODY_SETTLE_MS); the article measured before that is still growing.
 */
const CHAPTER_SETTLE_MS = 450;

function articleIndex(section: Element, article: Element | null): number | null {
  if (!article) return null;
  const index = Array.from(section.querySelectorAll(ARTICLE_SELECTOR)).indexOf(article);
  return index >= 0 && index < 100 ? index : null;
}

function sectionAtLine(line: number): Element | null {
  for (const section of Array.from(document.querySelectorAll(SECTION_SELECTOR))) {
    const rect = section.getBoundingClientRect();
    if (rect.top <= line && rect.bottom > line) return section;
  }
  return null;
}

function articleAtLine(section: Element, line: number): Element | null {
  for (const article of Array.from(section.querySelectorAll(ARTICLE_SELECTOR))) {
    const rect = article.getBoundingClientRect();
    if (rect.top <= line && rect.bottom > line) return article;
  }
  return null;
}

/** The spot to come back to, from the element that opened the paywall (or none). */
export function captureUnlockAnchor(origin: Element | null): UnlockAnchor | null {
  if (typeof window === "undefined") return null;
  const section = origin?.closest(SECTION_SELECTOR) ?? null;
  if (section?.id && origin) {
    const article = origin.closest(ARTICLE_SELECTOR);
    const container = article && section.contains(article) ? article : section;
    const spot = origin.getBoundingClientRect().top;
    return {
      sectionId: section.id,
      article: container === section ? null : articleIndex(section, container),
      offset: Math.round(spot - container.getBoundingClientRect().top),
      y: Math.round(Math.min(Math.max(spot, 0), window.innerHeight)),
    };
  }
  const line = Math.round(window.innerHeight * READING_LINE);
  const reading = sectionAtLine(line);
  if (!reading?.id) return null;
  const article = articleAtLine(reading, line);
  const container = article ?? reading;
  return {
    sectionId: reading.id,
    article: articleIndex(reading, article),
    offset: Math.round(line - container.getBoundingClientRect().top),
    y: line,
  };
}

export function serializeUnlockAnchor(anchor: UnlockAnchor | null): string | null {
  if (!anchor) return null;
  const raw = `${anchor.sectionId}~${anchor.article ?? ""}~${anchor.offset}~${anchor.y}`;
  return UNLOCK_ANCHOR_REGEX.test(raw) ? raw : null;
}

export function parseUnlockAnchor(raw: string | null | undefined): UnlockAnchor | null {
  if (!raw || !UNLOCK_ANCHOR_REGEX.test(raw)) return null;
  const [sectionId, article, offset, y] = raw.split("~") as [string, string, string, string];
  return {
    sectionId,
    article: article === "" ? null : Number(article),
    offset: Number(offset),
    y: Number(y),
  };
}

/**
 * Put the reader back on the spot: open its chapter (V4's start closed; outside V4
 * nothing listens and they are open already), open its article, let both finish
 * growing, then scroll so the spot sits where it sat. A spot that no longer exists
 * (the chapter is gone from this view) leaves the page where it is.
 */
export function restoreUnlockAnchor(anchor: UnlockAnchor, onDone?: () => void): void {
  openV4Chapter(anchor.sectionId);
  window.setTimeout(() => {
    const section = document.getElementById(anchor.sectionId);
    if (!section?.matches(SECTION_SELECTOR)) {
      onDone?.();
      return;
    }
    let container: HTMLElement = section;
    if (anchor.article !== null) {
      const article = section.querySelectorAll<HTMLElement>(ARTICLE_SELECTOR)[anchor.article];
      if (article) {
        if (!article.classList.contains("is-open")) {
          article.querySelector<HTMLButtonElement>(".rv4-learn__button")?.click();
        }
        container = article;
      }
    }
    // Two frames: one for React to render the opened article, one for its layout.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        getSmoothScroll()?.resize();
        const top = window.scrollY + container.getBoundingClientRect().top + anchor.offset;
        restoreScroll(Math.max(0, Math.round(top - anchor.y)));
        onDone?.();
      })
    );
  }, CHAPTER_SETTLE_MS);
}
