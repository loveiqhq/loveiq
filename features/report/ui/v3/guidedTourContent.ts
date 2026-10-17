import type { TourStepId } from "@features/report/logic/guidedTour";

/**
 * The guided tour's words. Figma 1713:1071 › "Guided tour in context" (1755:1275), as Sanjin
 * left them on 16.10: shorter, after Mark's "reduce the texts to the absolutely minimum" and
 * Marcus's notes ("no need to explain what the next steps are, the steps explain themselves").
 *
 * Two departures, both by rule rather than by taste:
 *  - Titles and buttons in the report's Title Case (headingCase0210): the 02.10 rule keeps
 *    Figma in its old sentence case and puts the case right here.
 *  - The first stop's body on a desktop. From 1280px the menu is the sidebar on the left,
 *    not a pill above, so it says so (Fatih, 17.10). Phones and tablets read Figma's words.
 *
 * No paid copy: this module ships to the browser.
 */
export interface TourCopy {
  title: string;
  body: string;
}

export const TOUR_COPY: Readonly<Record<TourStepId, TourCopy>> = {
  chapter_menu: {
    title: "Easily Navigate Your Report",
    body: "You can read the report in order, or jump to any chapter from the menu above.",
  },
  show_all: {
    title: "Read the Full Text",
    body: "Some sections show only a preview. Tap “Show All” to read the rest.",
  },
  chapter_toggle: {
    title: "Show or Hide Chapters",
    body: "Tap the arrow to collapse a chapter or expand it again whenever you want.",
  },
  try_this: {
    title: "Put Your Insights Into Practice",
    body: "Find practical exercises throughout your report to help you make positive changes.",
  },
  unlock: {
    title: "Discover the Full Report",
    body: "There’s more to your story. Tap the lock on any chapter to unlock them all at once.",
  },
};

/** The first stop where the menu is the desktop's sidebar (1280px and up). */
export const TOUR_MENU_BODY_SIDEBAR =
  "You can read the report in order, or jump to any chapter from the menu on the left.";

export const TOUR_LABELS = {
  next: "Next",
  back: "Back",
  finish: "Finish",
  skip: "Skip Tour",
  /** The chapter menu's last item (spec card 1755:1276). */
  replay: "Replay the Tour",
} as const;

/** "Step 2 of 5": the stylesheet sets it in capitals, as Figma draws it. */
export function tourStepLabel(n: number, total: number): string {
  return `Step ${n} of ${total}`;
}
