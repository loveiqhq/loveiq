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
  /**
   * `champion` is live and speaks to the team. `challenger` is an experiment:
   * it observes the same sessions, its findings are probed and recorded in the
   * ledger so it can be scored, and it NEVER reaches a Slack thread or opens a
   * pull request. Promotion is a deliberate edit here, not a threshold.
   *
   * Why a duplicate rather than an edited prompt: a scanner observes a given
   * session once, ever. Editing a live prompt is therefore a silent no-op on
   * every recording already seen, and the new prompt can never be compared
   * against the old one on the same evidence. Two scanners on one trigger
   * event can.
   */
  role: "champion" | "challenger";
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

/**
 * THE FIRST CHAMPION/CHALLENGER EXPERIMENT, AND WHY IT IS OVER (2026-09-21).
 *
 * `LoveIQ report UX (challenger: observation only)` ran against the same 197
 * recordings as its champion. The hypothesis — that a scanner forbidden from
 * explaining WHY anything happened would stop inventing causes — was answered,
 * and answered yes:
 *
 *     champion    197 watched · 43 judged · 22 invented a cause · 0 real
 *     challenger  197 watched ·  1 judged ·  0 invented a cause · 0 real
 *
 * It is retired anyway, for two reasons that only became visible on the day.
 *
 * FIRST, THE WIN EVAPORATED. Those 22 invented causes mattered because each one
 * posted a note under a real person's submission saying our own scanner had
 * described something that never happened. Those are no longer posted at all —
 * see the delivery rules in verify-ux-findings.mjs. With that fixed both
 * scanners are equally harmless, and the challenger's only measured advantage
 * was over a problem that no longer exists.
 *
 * SECOND, THE STOPPING RULE WAS UNREACHABLE. "30 findings or four weeks" was
 * set from the champion's flag rate and applied to a scanner whose entire
 * hypothesis is flagging less: at 1% of recordings it needed roughly 300 days
 * to reach 30. A rule that cannot be met is not a rule, and waiting to the
 * deadline would have decided on a sample of about four.
 *
 * WHAT IS NOT SETTLED, and is the question worth the next spend: NEITHER
 * scanner has ever been right — 0 of 43 for the champion across 197 report
 * recordings. That is either "there are no report defects" or "our probes
 * cannot see them", and no amount of prompt work tells those apart. The survey
 * scanner holds the only 2 confirmed findings in the whole system.
 *
 * The evidence outlives the deletion: the observations are PostHog events and
 * the verdicts are rows in `ux_finding`, both keyed by scanner name. The
 * champion/challenger machinery stays — the next experiment will use it.
 */
export const UX_SCANNERS: readonly UxScanner[] = [
  {
    id: "01a0a00e-1714-742d-baaf-567b5ca225f0",
    name: "LoveIQ survey UX",
    role: "champion",
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
    role: "champion",
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
    role: "champion",
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
    role: "champion",
    triggerEvent: "dead_click",
    samplingMode: "focused",
    // Measured, not guessed: 238 observations over 30 days to 2026-09-21 at 2
    // credits each on the lite model. The old 1,474 was ~3x the truth and fed
    // UX_REVIEW_ESTIMATED_MONTHLY_CREDITS, which is the figure an operator
    // agreed to. PostHog's own `projected_monthly_credits` is authoritative;
    // this is the repo's cross-check against it.
    estimatedMonthlyCredits: 476,
    creditLimit: 1600,
    scannerVersion: 3,
    prompt: [
      "This recording contains at least one dead click on loveiq.org — a tap that our",
      "instrumentation judged did nothing. Decide whether it had a visible cause.",
      "",
      "THE EVENT TELLS YOU WHICH KIND IT IS. Read the dead_click event properties:",
      "- reason=disabled_control — the reader tapped a real control that was switched",
      "  off. This is the case worth reporting. It includes controls the browser could",
      "  not even deliver the tap to, which look and read exactly like live ones.",
      "- reason=non_interactive — the tap was on text, an image or a container. This is",
      "  a reader resting a thumb, and it is the large majority of these events.",
      "- repeat_count=3 means they tapped the same thing again and again rather than",
      "  once. Someone who keeps trying expected it to work; that is the strongest",
      "  evidence available to you, and a single tap is the weakest.",
      "",
      CORRECT_LOOKS_LIKE,
      "",
      "Answer YES only when the thing tapped genuinely invited the tap and did nothing:",
      "- It is a disabled control that gives no explanation of what would enable it, and",
      "  nothing on screen tells the reader what to do to make it work.",
      "- It is styled as a control — a button, card, row, icon, price or link — or the",
      "  cursor changes over it, and nothing happened.",
      "- On-screen copy told the user to do it (for example an instruction to swipe, flip",
      "  or tap something) and that action does nothing.",
      "- The tap was swallowed by something invisible sitting on top of the target.",
      "",
      "A disabled control is NOT automatically a defect. A Next button that is off until",
      "the question is answered is working as intended — say NO unless the screen fails",
      "to make that obvious, or they tapped it repeatedly, which means it was not.",
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

/**
 * Measured monthly spend of the PERMANENT fleet — champions only.
 *
 * Deliberately not the whole bill. This number is the one an operator agreed
 * to, and a temporary experiment must not quietly raise it: if a challenger
 * were summed in here, the agreed ceiling would drift upward every time one was
 * added and nobody would ever see a single decision being made. The real
 * projection, champions plus challengers, is what
 * `scripts/sync-vision-scanners.ts` prints against the live quota before it
 * writes anything.
 */
export const UX_REVIEW_ESTIMATED_MONTHLY_CREDITS = UX_SCANNERS.filter(
  (s) => s.role === "champion"
).reduce((sum, s) => sum + s.estimatedMonthlyCredits, 0);

/**
 * What the running experiments add on top, priced separately so it is a line
 * item rather than a rounding error. Temporary by definition: promoting or
 * deleting a challenger returns this to zero.
 */
export const UX_REVIEW_CHALLENGER_MONTHLY_CREDITS = UX_SCANNERS.filter(
  (s) => s.role === "challenger"
).reduce((sum, s) => sum + s.estimatedMonthlyCredits, 0);
