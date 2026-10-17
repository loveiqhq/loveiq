import type { TourStepId } from "@features/report/logic/guidedTour";

/**
 * What each stop of the guided tour points at, found in the page as rendered. The tour
 * changes nothing in the report: it reads these elements' boxes and draws over them.
 *
 * - The chapter menu: the floating pill below 1280px (ReportMobileNav), the sidebar's list
 *   from 1280px (ReportDesktopSidebar). Both are in the page and CSS hides one, so the one
 *   with a box wins. The drawer, while open, holds a second pill: hence `>`.
 * - Show All: the first fold's pill in Typical Beliefs, the one Figma draws (1766:3637). A
 *   fold that fits its peek draws no pill, and an opened one drops it, so a replay after the
 *   reader opened it points at the next pill down, and with none left the stop is dropped.
 * - The chapter toggle: Typical Beliefs' disc, not the whole head row (1766:4108).
 * - Try This: the words of Typical Beliefs' practice header, as Figma frames them
 *   (1766:5050), without its chevron.
 * - The unlock: the lock of the first locked chapter after Typical Beliefs. Figma draws Core
 *   Insecurities, which the slimmed report (16.10) took out; the first now is Power
 *   Orientation. Not matched by its words: Typical Beliefs' own panels carry "Unlock Report"
 *   badges too.
 */
const MENU_PILL = ".report-chapter-pill > .report-chapter-pill__btn";
const MENU_SIDEBAR = "nav.report-sidebar__nav";
const TYPICAL_BELIEFS = "#typical_beliefs";
const FOLD_PILL = ".rv4-fold__pill";

export interface TourAnchor {
  el: HTMLElement;
  /** The chapter menu as a desktop's sidebar: its bubble goes beside it, its copy says left. */
  sidebar: boolean;
}

/** In the layout: a box with a size, under no `hidden` ancestor. */
export function isShown(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement) || el.closest("[hidden]")) return false;
  const box = el.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

function firstShown(root: ParentNode, selector: string): HTMLElement | null {
  for (const el of root.querySelectorAll(selector)) {
    if (isShown(el)) return el;
  }
  return null;
}

export function findTourAnchor(id: TourStepId, doc: Document = document): TourAnchor | null {
  const tb = doc.querySelector(TYPICAL_BELIEFS);
  const found = (el: HTMLElement | null, sidebar = false) => (el ? { el, sidebar } : null);
  switch (id) {
    case "chapter_menu": {
      const pill = doc.querySelector(MENU_PILL);
      if (isShown(pill)) return { el: pill, sidebar: false };
      return found(firstShown(doc, MENU_SIDEBAR), true);
    }
    case "show_all":
      return found((tb && firstShown(tb, FOLD_PILL)) ?? firstShown(doc, FOLD_PILL));
    case "chapter_toggle":
      return found(tb && firstShown(tb, ".rv4-chapter__chev"));
    case "try_this":
      return found(tb && firstShown(tb, ".rv4-try__label"));
    case "unlock":
      return found(
        firstShown(doc, `${TYPICAL_BELIEFS} ~ .rv4-chapter.is-locked .rv4-chapter__lock`)
      );
  }
}
