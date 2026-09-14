/**
 * The review protocol, as code.
 *
 * These prompts are what PostHog Replay Vision actually applies to our session
 * recordings. They live here rather than only in PostHog so the criteria change
 * through a reviewed PR — Marcus's requirement from the 2026-09-11 sync was that
 * "the review protocol criteria must be explicitly defined and benchmarked
 * against test videos so the team does not rely on false confidence".
 *
 * PostHog holds the live copy. `scannerVersion` below is the tripwire: PostHog
 * bumps a scanner's version on every config edit, and every `$recording_observed`
 * event carries `scanner_version`, so the cron can compare the live value against
 * the pinned one and alert when someone edits a prompt in the UI without bringing
 * it back here. That is eight lines of comparison instead of a sync script.
 *
 * COST. One credit is $0.01. Every observation costs credits by model
 * (lite 2 / flash 5 / 3.7-flash 15) and the org gets 2,500 free credits a month
 * — currently a 5x promotion on a normal allowance of 500. `creditLimit` caps
 * what ONE scanner can spend per period so it cannot starve the others; it is
 * not a cap on the org bill. Estimates below were measured with
 * `vision-scanners-estimate-create` against 7 real days on 2026-09-14.
 */

export interface UxScanner {
  /** PostHog scanner UUID. Created disabled on 2026-09-14. */
  id: string | null;
  /** Must match `scanner_name` on the `$recording_observed` event. */
  name: string;
  /** PostHog event that selects the sessions this scanner watches. */
  triggerEvent: string;
  /** `focused` drops the lowest-quality sessions; `comprehensive` takes them all. */
  samplingMode: "focused" | "balanced" | "comprehensive";
  /** Measured monthly credits at sampling_rate 1 on the lite model. */
  estimatedMonthlyCredits: number;
  /** Per-scanner spend cap per billing period. */
  creditLimit: number;
  /** PostHog's config version. Bumped by PostHog on every edit — see the tripwire above. */
  scannerVersion: number;
  prompt: string;
}

/**
 * Shared preamble: what "correct" looks like, so the model has a reference to
 * measure against rather than a vibe. Every number here is checked against the
 * code, not remembered:
 *   - tokens: `app/globals.css` :root (`--color-bg`, `--accent-orange`, `--accent-purple`)
 *   - chapter pill: `report.css` `.report-chapter-pill` — position: fixed,
 *     top: calc(env(safe-area-inset-top) + 80px), z-index: 39
 *   - 16px inputs: iOS magnifies the whole page when a focused control is under
 *     16px and never zooms back. 175 of 177 zoomed sessions measured a viewport
 *     ratio of exactly 16/15 = 1.067.
 */
const CORRECT_LOOKS_LIKE = `
What correct looks like on loveiq.org:
- Dark surface #0b0613 with orange #f26d4f and purple #9c7dff accents. Unstyled
  black-on-white text, a flash of raw HTML, or a missing web font is a defect.
- Below 1280px wide a floating "Chapter: ..." pill is fixed near the top of the
  viewport. It must never cover body text or a heading.
- Paywall, pricing modal and the Stripe hand-off sit above everything and are
  fully tappable. A control that does not respond to a tap is a defect.
- Nothing is clipped by the left or right edge, and nothing needs horizontal
  scrolling.
- Tapping an input must never magnify the page. On iOS that happens when the
  input font is under 16px, and the page never zooms back.
`.trim();

/**
 * Shared negative class. A criteria list without one is how a scanner learns to
 * answer YES to everything, which is the "false confidence" failure mode.
 */
const DO_NOT_FLAG = `
Do NOT answer YES for: ordinary reading; slow or long scrolling in one direction
(the report is legitimately very long); a pause; a user deliberately closing a
modal; re-opening a chapter to re-read it; a double-tap on a control that did
work; or anything you are inferring rather than seeing on screen.
`.trim();

const CITE = `
Your first sentence must name the defect. Then say where on screen it happened.
Cite the moment in the recording. If you cannot point at it, answer NO.

Describe only what you can SEE. Do not say which control the user pressed unless
the press and the change it caused are both visible. If the screen changed and
you cannot see what caused it, say that the screen changed and that the cause is
not visible — do not name a button you did not watch being pressed.
`.trim();

export const UX_SCANNERS: readonly UxScanner[] = [
  {
    id: "01a0a00e-1714-742d-baaf-567b5ca225f0",
    name: "LoveIQ survey UX",
    triggerEvent: "survey_started",
    samplingMode: "focused",
    estimatedMonthlyCredits: 2160,
    creditLimit: 2300,
    scannerVersion: 2,
    prompt: [
      "You are reviewing a recording of the LoveIQ survey — a one-question-per-screen",
      "assessment on loveiq.org. Most questions advance on their own about a third of a",
      "second after an answer is picked; multi-select questions need the Next button.",
      "",
      CORRECT_LOOKS_LIKE,
      "",
      "Answer YES for any of:",
      "1. An error message on screen, in particular the literal string",
      '   "Unable to process request.", or a visible failure where content was expected.',
      "2. A LOOP: after pressing a control that should move them forward, the user lands",
      "   back at the survey start, the first question, or a screen already completed.",
      "3. A dead control: the user taps a button, option or Next two or more times and",
      "   nothing on screen changes. A greyed-out Next that never enables also counts.",
      "4. The page becomes magnified after the user taps an input and never returns.",
      "5. Any layout defect from the list above — clipped text, covered heading,",
      "   unstyled content.",
      "",
      DO_NOT_FLAG,
      "Also do not flag a user simply abandoning the survey. Leaving is not a defect",
      "unless something on screen stopped them.",
      "",
      CITE,
    ].join("\n"),
  },
  {
    id: "01a0a00e-8bf7-7465-8374-f7279a02cabb",
    name: "LoveIQ report UX",
    triggerEvent: "report_viewed",
    samplingMode: "focused",
    estimatedMonthlyCredits: 822,
    creditLimit: 900,
    scannerVersion: 2,
    prompt: [
      "You are reviewing a recording of the LoveIQ report — a long, scroll-based",
      "psychology report on loveiq.org, with some chapters locked behind a paywall.",
      "Locked chapters deliberately show blurred placeholder artwork; that is correct,",
      "not a defect.",
      "",
      CORRECT_LOOKS_LIKE,
      "",
      "Answer YES for any of:",
      "1. An error message on screen, in particular the literal string",
      '   "Unable to process request.", or a section that never renders.',
      "2. A LOOP: a control returns the user to the survey, or the paywall and checkout",
      "   return them to the report without unlocking anything.",
      "3. A dead control: the user taps a button, card, chapter row, lock icon or price",
      "   two or more times and nothing changes.",
      "4. A modal or popup that reappears after the user closes it, twice or more.",
      "5. Text that is readable through a blur that is meant to hide it.",
      "6. EXCESSIVE SCROLLING: the user scrolls up and down over the same region three",
      "   or more times within about ten seconds without opening or reading anything.",
      "7. Any layout defect from the list above.",
      "",
      DO_NOT_FLAG,
      "",
      CITE,
    ].join("\n"),
  },
  {
    id: "01a0a00e-fe16-7bd8-aae3-269148a11233",
    name: "LoveIQ rage-click cause",
    triggerEvent: "rage_click",
    samplingMode: "comprehensive",
    estimatedMonthlyCredits: 326,
    creditLimit: 400,
    scannerVersion: 2,
    prompt: [
      "This recording contains at least one rage click on loveiq.org — three or more",
      "clicks on the same control inside one second. Say what the user was trying to do",
      "and whether the product was at fault.",
      "",
      CORRECT_LOOKS_LIKE,
      "",
      "Answer YES only when the rage click has a visible cause on screen:",
      "- The element clicked looks interactive and produced no visible change.",
      "- The click landed on a control covered by something else — the chapter pill, the",
      "  paywall, the pricing modal, the cookie banner or the Stripe hand-off.",
      "- The control was clipped by the viewport edge, so only part of it could be hit.",
      '- An error was on screen, in particular "Unable to process request.".',
      "- The clicks were followed by the user being returned to an earlier screen.",
      "",
      DO_NOT_FLAG,
      "In particular, answer NO when the user was impatient but the product responded:",
      "a slow but working load, a double-tap on a working button, clicking plain text or",
      "decorative artwork, or text selection.",
      "",
      CITE,
    ].join("\n"),
  },
  {
    id: "01a0a00f-8e95-76a8-9192-b1a7463db22f",
    name: "LoveIQ dead-click cause",
    triggerEvent: "dead_click",
    samplingMode: "focused",
    estimatedMonthlyCredits: 1474,
    creditLimit: 1600,
    scannerVersion: 2,
    prompt: [
      "This recording contains at least one dead click on loveiq.org — a tap on something",
      "our instrumentation judged non-interactive. Most are readers tapping ordinary text,",
      "which is NOT a defect. Decide whether this one had a visible cause.",
      "",
      CORRECT_LOOKS_LIKE,
      "",
      "Answer YES only when the thing tapped genuinely invited the tap and did nothing:",
      "- It is styled as a control — a button, card, row, icon, price or link — or the",
      "  cursor changes over it, and nothing happened.",
      "- On-screen copy told the user to do it (for example an instruction to swipe, flip",
      "  or tap something) and that action does nothing.",
      "- It is a disabled control that gives no explanation of what would enable it.",
      "- The tap was swallowed by something invisible sitting on top of the target.",
      "",
      DO_NOT_FLAG,
      "HARD RULE: if the thing tapped is a paragraph, a heading, an image, a badge or",
      "decoration, the answer is NO. Not 'no, but' — NO. A reader resting a thumb on",
      "text is the most common case here by a wide margin, and describing it and then",
      "answering yes anyway is the single failure this rule exists to stop.",
      "",
      CITE,
    ].join("\n"),
  },
];

/** Verdict/confidence bar a finding must clear before it reaches Slack. */
export const UX_REVIEW_MIN_CONFIDENCE = 0.7;

/** Total measured spend if every scanner runs uncapped for a month. */
export const UX_REVIEW_ESTIMATED_MONTHLY_CREDITS = UX_SCANNERS.reduce(
  (sum, s) => sum + s.estimatedMonthlyCredits,
  0
);
