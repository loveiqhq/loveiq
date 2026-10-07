/**
 * Marcus's 22 behaviour signals (Slack #all-loveiq, 2026-09-15), each computed from what a
 * visit actually did: the events `track()` sent (features/analytics/client.ts).
 *
 * ONE DEFINITION, TWO KINDS OF VISIT. A real visitor's events come from PostHog, which gets
 * every `track()` call with no consent gate (server/posthog-visits.ts). A persona walk's come
 * from the same `track()` calls, recorded in the walk's own browser (scripts/walkers/walk.ts,
 * `__loveiqEventTap`). The walk also knows what it really did, so each measure is checked
 * against that every night (scripts/walkers/check-signals.ts), and a signal is shown only
 * once it has been right often enough (logic/proof.ts).
 *
 * Pure, and every value a primitive, so a walk's truth and the measure compare directly and
 * store as they are.
 */

/** One `track()` call: the event as PostHog stores it and a walk records it. */
export interface UxEvent {
  /** Milliseconds since the epoch, from the visitor's clock. */
  t: number;
  event: string;
  props: Record<string, unknown>;
}

/** One visit's events in time order: a PostHog session, or one persona walk. */
export type UxVisit = readonly UxEvent[];

/** A signal's value for one visit. */
export type SignalValue = number | boolean | string;

/**
 * How values of this signal are read and summarized:
 * - `duration`: milliseconds, or "none" when the moment never came;
 * - `count`: how many times it happened;
 * - `category`: one of a few named outcomes;
 * - `bucket`: 0, 25, 50, 75 or 100 (per cent of a page, or of the survey).
 */
export type SignalKind = "duration" | "count" | "category" | "bucket";

export interface SignalDef {
  /** Marcus's wording, as the walks' judge uses it (scripts/walkers/judge.ts). */
  name: string;
  stage: "Landing" | "Survey" | "Report" | "Paywall" | "Checkout" | "Whole visit";
  kind: SignalKind;
  /** What the value is, in one plain sentence. */
  measures: string;
  /** The events it is read from: what the PostHog query has to fetch. */
  from: readonly string[];
  /** The value for one visit, or null when the visit never reached what it is about. */
  measure?: (v: UxVisit) => SignalValue | null;
  /**
   * The non-default outcome, for a signal where most visits show nothing: a backtrack, an
   * error, an escape. Proof then needs enough cases of each side, and to be right on both,
   * or a measure that always says "nothing" would look perfect (logic/proof.ts).
   */
  positive?: (truth: SignalValue) => boolean;
  /** Everywhere it happened in the visit, for the summary's "most often at …". */
  where?: (v: UxVisit) => string[];
  /** The value is a list ("Q4,Q9"), summarized as how often it held anything, not by list. */
  list?: true;
  /** Set when it cannot be measured from what the site records, saying what is missing. */
  missing?: string;
  /**
   * When production began recording what the measure reads (ISO). A real visit from before
   * then cannot show it, so it would count as not doing it; such visits are left out.
   */
  recordedSince?: string;
}

const SECOND = 1000;

// ── Reading events ───────────────────────────────────────────────────────────────────────

/** A number from PostHog (which returns JSON values as text) or from a walk. */
export function num(x: unknown): number | null {
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  if (typeof x === "string" && x.trim() !== "") {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const text = (x: unknown): string | null => (typeof x === "string" && x !== "" ? x : null);

const is =
  (...names: string[]) =>
  (e: UxEvent) =>
    names.includes(e.event);

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Which page a `pathname` property names. Tokens and query strings never leave here. */
export function pageOf(pathname: unknown): "landing" | "survey" | "report" | "checkout" | null {
  const p = text(pathname);
  if (p === null) return null;
  const path = p.split("?")[0]!;
  if (path === "/" || path === "") return "landing";
  if (path.startsWith("/survey")) return "survey";
  if (path.startsWith("/report")) return "report";
  if (path.startsWith("/checkout")) return "checkout";
  return null;
}

/** 0, 25, 50, 75 or 100: the milestone a percentage has reached, as scroll-depth events fire. */
export const bucketOf = (pct: number): number =>
  Math.max(0, ...[25, 50, 75, 100].filter((b) => pct >= b));

/** True when the visit paid: the return page said so, or the report unlocked. */
export function paid(v: UxVisit): boolean {
  return v.some(
    (e) =>
      (e.event === "checkout_return_viewed" && e.props.status === "success") ||
      e.event === "paywall_unlocked"
  );
}

/**
 * The time between one answer and the next, less any time the tab was hidden in between.
 * `survey_answer` fires as a question is left, so each gap is the time spent on the question
 * it names. The first answer has no gap: nothing marks when the first question appeared.
 */
export function answerGaps(v: UxVisit): Array<{ questionId: string; ms: number }> {
  const out: Array<{ questionId: string; ms: number }> = [];
  let previous: UxEvent | null = null;
  let hidden = 0;
  for (const e of v) {
    if (e.event === "tab_visible" && previous) hidden += num(e.props.hidden_ms) ?? 0;
    if (e.event !== "survey_answer") continue;
    if (previous) {
      out.push({
        questionId: text(e.props.question_id) ?? "?",
        ms: Math.max(0, e.t - previous.t - hidden),
      });
    }
    previous = e;
    hidden = 0;
  }
  return out;
}

/** The stage each kind of event belongs to, for where a visit ended. */
const STAGE: Record<string, string> = {
  landing_page_view: "landing",
  cta_click: "landing",
  faq_expanded: "landing",
  survey_started: "survey",
  survey_answer: "survey",
  survey_progress: "survey",
  survey_form_error: "survey",
  survey_pause: "survey",
  survey_completed: "pre-report",
  wizard_slide_advanced: "pre-report",
  report_viewed: "report",
  report_engagement_1min: "report",
  report_engagement_5min: "report",
  report_engagement_10min: "report",
  section_navigated: "report",
  report_chapter_menu_opened: "report",
  locked_card_price_shown: "report",
  price_shown: "paywall",
  paywall_initiated: "paywall",
  paywall_dismissed: "paywall",
  unlock_click: "paywall",
  lock_icon_clicked: "paywall",
  sticky_unlock_clicked: "paywall",
  testimonial_interaction: "paywall",
  begin_checkout: "checkout",
  checkout_return_viewed: "checkout",
};

/**
 * Events that say only which page they were on. Not the tab events: closing a tab from an
 * open paywall sends `tab_hidden` from the report page, and the visit left the paywall.
 */
const PAGE_EVENTS = new Set([
  "dead_click",
  "rage_click",
  "scroll_depth_25",
  "scroll_depth_50",
  "scroll_depth_75",
  "scroll_depth_100",
]);

/** What the page shows by itself, which no visitor did: it never moves a visit on. */
const EXPOSURES = new Set(["price_shown", "locked_card_price_shown"]);

function stageOf(e: UxEvent): string | null {
  if (e.event in STAGE) return STAGE[e.event]!;
  if (PAGE_EVENTS.has(e.event)) return pageOf(e.props.pathname);
  return null;
}

/** The survey question on screen when the visit left it: "Q12" (numbered from 1). */
function questionOnScreen(v: UxVisit): string {
  const moves = v.filter(is("survey_progress"));
  // `question_index` on survey_progress is the index moved TO, counted from 0.
  const at = num(moves.at(-1)?.props.question_index) ?? 0;
  return `Q${at + 1}`;
}

/** The first moment the paywall's prices or the checkout were in front of the visitor. */
function firstPaywall(v: UxVisit): UxEvent | null {
  return v.find(is("price_shown", "paywall_initiated", "begin_checkout")) ?? null;
}

/** The deepest scroll milestone on the report, up to `before` (ms) when given. */
function reportScroll(v: UxVisit, before = Infinity): number | null {
  if (!v.some(is("report_viewed"))) return null;
  let best = 0;
  for (const e of v) {
    if (e.t > before) break;
    const m = /^scroll_depth_(\d+)$/.exec(e.event);
    if (m && pageOf(e.props.pathname) === "report") best = Math.max(best, Number(m[1]));
  }
  return best;
}

/** Answer gaps split in thirds; null under twelve answers, too few to call a trend. */
function paceThirds(v: UxVisit): [number, number] | null {
  const gaps = answerGaps(v).map((g) => g.ms);
  if (gaps.length < 12) return null;
  const third = Math.floor(gaps.length / 3);
  return [median(gaps.slice(0, third))!, median(gaps.slice(-third))!];
}

/** A long pause on a question: over three times this visit's usual and over eight seconds. */
function hesitations(v: UxVisit): string[] | null {
  const gaps = answerGaps(v);
  if (gaps.length < 5) return null;
  const usual = median(gaps.map((g) => g.ms))!;
  return gaps
    .filter((g) => g.ms > 3 * usual && g.ms > 8 * SECOND)
    .map((g) => g.questionId)
    .sort();
}

/** The most common value, for "most often at …". */
export function mode(xs: ReadonlyArray<string | null>): string | null {
  const counts = new Map<string, number>();
  for (const x of xs) if (x) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best: string | null = null;
  for (const [k, n] of counts) if (best === null || n > counts.get(best)!) best = k;
  return best;
}

// ── The 22 ───────────────────────────────────────────────────────────────────────────────

export const SIGNALS: readonly SignalDef[] = [
  {
    name: "Time to first action",
    stage: "Landing",
    kind: "duration",
    measures:
      "From the landing page appearing to the first press of a call to action on it, or none.",
    from: ["landing_page_view", "cta_click"],
    measure: (v) => {
      const view = v.find(is("landing_page_view"));
      if (!view) return null;
      const click = v.find((e) => e.event === "cta_click" && e.t >= view.t);
      return click ? click.t - view.t : "none";
    },
  },
  {
    name: "Step completion time",
    stage: "Survey",
    kind: "duration",
    measures: "The usual (median) time a visit spent on each survey question.",
    from: ["survey_answer", "tab_visible"],
    measure: (v) => {
      const gaps = answerGaps(v);
      return gaps.length >= 5 ? Math.round(median(gaps.map((g) => g.ms))!) : null;
    },
  },
  {
    name: "Drop-off / exit point",
    stage: "Whole visit",
    kind: "category",
    measures:
      "Where the visit ended: landing, survey, pre-report, report, paywall, checkout, or paid.",
    from: [...Object.keys(STAGE), ...PAGE_EVENTS, "paywall_unlocked"],
    measure: (v) => {
      if (paid(v)) return "paid";
      // Pressing to pay leaves for Stripe. A paywall that opens by itself in that moment
      // still fires price_shown after it (a walk saw three, 2026-10-01), but the visitor
      // had gone: what the page shows on its own is not where they were.
      const lastAction = [...v].reverse().find((e) => stageOf(e) && !EXPOSURES.has(e.event));
      if (lastAction?.event === "begin_checkout") return "checkout";
      for (let i = v.length - 1; i >= 0; i--) {
        const s = stageOf(v[i]!);
        if (s) return s;
      }
      return null;
    },
    positive: (t) => t !== "paid",
  },
  {
    name: "Backtracking",
    stage: "Survey",
    kind: "count",
    measures: "How many times the visit went back to an earlier survey question and came on again.",
    from: ["survey_progress"],
    measure: (v) => {
      const moves = v.filter(is("survey_progress")).map((e) => num(e.props.question_index));
      if (moves.length === 0) return null;
      let furthest = -1;
      let backs = 0;
      for (const i of moves) {
        if (i === null) continue;
        // Going back sends no event; coming on again repeats an index already reached.
        if (i <= furthest) backs += 1;
        furthest = Math.max(furthest, i);
      }
      return backs;
    },
    positive: (t) => Number(t) > 0,
    where: (v) => {
      const at: string[] = [];
      let furthest = -1;
      for (const e of v.filter(is("survey_progress"))) {
        const i = num(e.props.question_index) ?? -1;
        // The index repeated is the question gone back to, counted from 1.
        if (i >= 0 && i <= furthest) at.push(`question ${i}`);
        furthest = Math.max(furthest, i);
      }
      return at;
    },
  },
  {
    name: "Dead clicks",
    stage: "Whole visit",
    kind: "category",
    measures:
      "The worst dead tap in the visit: on a disabled control (it looks live and does nothing), on text or a container (mostly reading), or none.",
    from: ["dead_click"],
    measure: (v) => {
      const dead = v.filter(is("dead_click"));
      if (dead.some((e) => e.props.reason === "disabled_control")) return "disabled_control";
      return dead.length ? "non_interactive" : "none";
    },
    positive: (t) => t !== "none",
    where: (v) =>
      v
        .filter((e) => e.event === "dead_click" && e.props.reason === "disabled_control")
        .map((e) => text(e.props.target_selector) ?? "?"),
  },
  {
    name: "Rage clicks / repeated taps",
    stage: "Whole visit",
    kind: "count",
    measures: "How many bursts of three or more taps on one spot within a second.",
    from: ["rage_click"],
    measure: (v) => v.filter(is("rage_click")).length,
    positive: (t) => Number(t) > 0,
    where: (v) => v.filter(is("rage_click")).map((e) => text(e.props.target_selector) ?? "?"),
  },
  {
    name: "Scroll behavior",
    stage: "Report",
    kind: "bucket",
    measures: "How far down the report the visit scrolled: 0, 25, 50, 75 or 100 per cent.",
    from: [
      "report_viewed",
      "scroll_depth_25",
      "scroll_depth_50",
      "scroll_depth_75",
      "scroll_depth_100",
    ],
    measure: (v) => reportScroll(v),
  },
  {
    name: "CTA visibility",
    stage: "Report",
    kind: "category",
    measures:
      "On a report with locked chapters, whether a locked chapter's unlock offer ever came into view: seen or not seen.",
    // locked_card_price_shown (before Report 3.0) or locked_chapters_shown (Report 3.0, which
    // shows no price) says the report HAS locked cards; cta_seen says one was on screen.
    from: ["locked_card_price_shown", "locked_chapters_shown", "cta_seen"],
    measure: (v) => {
      if (!v.some(is("locked_card_price_shown", "locked_chapters_shown"))) return null;
      return v.some((e) => e.event === "cta_seen" && e.props.cta === "locked_chapter")
        ? "seen"
        : "not seen";
    },
    positive: (t) => t === "seen",
    // cta_seen reached production with #442 (live 2026-10-01 00:05:47 UTC): before it, every
    // visit with locked chapters would read "not seen".
    recordedSince: "2026-10-01T00:06:00Z",
  },
  {
    name: "CTA hesitation",
    stage: "Paywall",
    kind: "duration",
    measures:
      "From the plans appearing to pressing one to pay, for visits that pressed one: how long the offer was weighed.",
    from: ["price_shown", "paywall_initiated", "paywall_dismissed", "begin_checkout"],
    measure: (v) => {
      const checkout = v.find(is("begin_checkout"));
      if (!checkout) return null;
      const before = v.filter((e) => e.t <= checkout.t);
      // The latest opening before the press: an earlier one may have been closed again.
      const opened = before.filter(is("price_shown", "paywall_initiated")).at(-1);
      if (!opened) return null;
      // Closed after it, then pressed: either the press came from outside the plans (the
      // sticky bar buys straight away), or the plans opened again unrecorded (the picker
      // stays mounted, so a reopening sends no second price_shown, and one the report opens
      // by itself sends no paywall_initiated). How long they were weighed is unknown; timed
      // from the closed opening, it was 3 of 6 measurable presses in the 28 days to 2026-10-01.
      if (before.some((e) => e.event === "paywall_dismissed" && e.t > opened.t)) return null;
      return checkout.t - opened.t;
    },
  },
  {
    name: "Answer hesitation",
    stage: "Survey",
    kind: "category",
    measures:
      "The survey questions this visit paused on: over three times its usual time and over eight seconds, or none.",
    from: ["survey_answer", "tab_visible"],
    measure: (v) => {
      const h = hesitations(v);
      return h === null ? null : h.length ? h.join(",") : "none";
    },
    positive: (t) => t !== "none",
    where: (v) => hesitations(v) ?? [],
    list: true,
  },
  {
    name: "Skipped / abandoned questions",
    stage: "Survey",
    kind: "category",
    measures:
      "The question a started survey was left on (every question is required, so none can be skipped), or completed.",
    from: ["survey_started", "survey_progress", "survey_completed"],
    measure: (v) => {
      if (!v.some(is("survey_started", "survey_progress"))) return null;
      return v.some(is("survey_completed")) ? "completed" : questionOnScreen(v);
    },
    positive: (t) => t !== "completed",
  },
  {
    name: "Form errors",
    stage: "Survey",
    kind: "count",
    measures: "How many times the survey refused an answer (an invalid email, too many choices).",
    from: ["survey_form_error", "survey_started"],
    measure: (v) =>
      v.some(is("survey_started", "survey_answer"))
        ? v.filter(is("survey_form_error")).length
        : null,
    positive: (t) => Number(t) > 0,
    where: (v) => v.filter(is("survey_form_error")).map((e) => text(e.props.question_id) ?? "?"),
  },
  {
    name: "Progress sensitivity",
    stage: "Survey",
    kind: "bucket",
    measures:
      "How far through the survey the progress bar said a visit was when it left: 0, 25, 50, 75 or 100 per cent.",
    from: ["survey_progress", "survey_completed"],
    measure: (v) => {
      const moves = v.filter(is("survey_progress"));
      if (moves.length === 0) return null;
      if (v.some(is("survey_completed"))) return 100;
      return bucketOf(num(moves.at(-1)!.props.progress_pct) ?? 0);
    },
    positive: (t) => Number(t) < 100,
  },
  {
    name: "Engagement acceleration/deceleration",
    stage: "Survey",
    kind: "category",
    measures:
      "Whether answers came faster or slower towards the end: the last third's usual time against the first third's.",
    from: ["survey_answer", "tab_visible"],
    measure: (v) => {
      const p = paceThirds(v);
      if (!p) return null;
      const ratio = p[1] / Math.max(1, p[0]);
      return ratio > 1.5 ? "slowing" : ratio < 1 / 1.5 ? "speeding up" : "steady";
    },
    positive: (t) => t !== "steady",
  },
  {
    name: "Expectation mismatch",
    stage: "Report",
    kind: "category",
    measures:
      "A visit that left within 45 seconds of the report appearing, without reading past the first quarter: bounced or stayed.",
    from: [
      "report_viewed",
      "scroll_depth_50",
      "section_navigated",
      "price_shown",
      "paywall_initiated",
    ],
    measure: (v) => {
      const shown = v.find(is("report_viewed"));
      if (!shown) return null;
      const after = v.filter((e) => e.t > shown.t);
      const read = after.some(
        (e) =>
          ((e.event === "scroll_depth_50" ||
            e.event === "scroll_depth_75" ||
            e.event === "scroll_depth_100") &&
            pageOf(e.props.pathname) === "report") ||
          e.event === "section_navigated" ||
          e.event === "price_shown" ||
          e.event === "paywall_initiated" ||
          e.event === "begin_checkout"
      );
      const lastAt = v.at(-1)!.t;
      return !read && lastAt - shown.t < 45 * SECOND ? "bounced" : "stayed";
    },
    positive: (t) => t === "bounced",
  },
  {
    name: "Report curiosity",
    stage: "Report",
    kind: "count",
    measures: "How many times the visit opened the chapter list or jumped to a chapter.",
    from: ["report_viewed", "report_chapter_menu_opened", "section_navigated"],
    measure: (v) =>
      v.some(is("report_viewed"))
        ? v.filter(is("report_chapter_menu_opened", "section_navigated")).length
        : null,
    positive: (t) => Number(t) > 0,
  },
  {
    name: "Value discovery before paywall",
    stage: "Report",
    kind: "bucket",
    measures:
      "How far down the free report the visit had scrolled before the paywall's prices first appeared.",
    from: [
      "report_viewed",
      "scroll_depth_25",
      "scroll_depth_50",
      "scroll_depth_75",
      "scroll_depth_100",
      "price_shown",
      "paywall_initiated",
      "begin_checkout",
    ],
    measure: (v) => {
      const wall = firstPaywall(v);
      return wall ? reportScroll(v, wall.t) : null;
    },
  },
  {
    name: "Paywall dwell time",
    stage: "Paywall",
    kind: "duration",
    measures:
      "How long the paywall stayed open before it was first closed without paying, or none.",
    from: ["paywall_dismissed", "price_shown", "paywall_initiated"],
    measure: (v) => {
      if (!v.some(is("price_shown", "paywall_initiated", "paywall_dismissed"))) return null;
      const closed = v.find(is("paywall_dismissed"));
      return closed ? Math.round(num(closed.props.view_duration_ms) ?? 0) : "none";
    },
    positive: (t) => t !== "none",
  },
  {
    name: "Price interaction",
    stage: "Paywall",
    kind: "category",
    measures:
      "Which plan the visit pressed to pay for. Comparing plans is not recorded: the cards sit side by side with no toggle.",
    from: ["begin_checkout", "price_shown"],
    measure: (v) => {
      const checkout = v.find(is("begin_checkout"));
      if (checkout) return text(checkout.props.plan) ?? "unknown";
      return v.some(is("price_shown")) ? "none" : null;
    },
  },
  {
    name: "Paywall escape behavior",
    stage: "Paywall",
    kind: "category",
    measures:
      "How the paywall was first closed without paying: the close button, Escape, a tap outside it, the browser's Back, or not closed.",
    from: ["paywall_dismissed", "price_shown", "paywall_initiated"],
    measure: (v) => {
      if (!v.some(is("price_shown", "paywall_initiated", "paywall_dismissed"))) return null;
      return text(v.find(is("paywall_dismissed"))?.props.source) ?? "not closed";
    },
    positive: (t) => t !== "not closed",
  },
  {
    name: "Trust seeking",
    stage: "Whole visit",
    kind: "count",
    measures:
      "How many times the visit looked for reassurance: opened a question in the landing FAQ, or moved through the reviews on the paywall.",
    from: ["faq_expanded", "testimonial_interaction"],
    measure: (v) => v.filter(is("faq_expanded", "testimonial_interaction")).length,
    positive: (t) => Number(t) > 0,
  },
  {
    name: "Conversion blockers",
    stage: "Checkout",
    kind: "category",
    measures:
      "For visits that went to pay: paid, or stopped short of paying (the checkout, the card, or the way back).",
    from: ["begin_checkout", "checkout_return_viewed", "paywall_unlocked"],
    measure: (v) => (v.some(is("begin_checkout")) ? (paid(v) ? "paid" : "stopped") : null),
    positive: (t) => t === "stopped",
  },
];

/** Every event any signal reads: what the PostHog query fetches and nothing more. */
export const SIGNAL_EVENTS: readonly string[] = [...new Set(SIGNALS.flatMap((s) => s.from))].sort();

/** The event properties the measures read. */
export const SIGNAL_PROPS = [
  "question_id",
  "question_index",
  "progress_pct",
  "pathname",
  "reason",
  "target_selector",
  "view_duration_ms",
  "source",
  "plan",
  "status",
  "hidden_ms",
  "cta",
] as const;

/** Every signal's value for one visit; null where the visit never reached it. */
export function measureVisit(v: UxVisit): Record<string, SignalValue | null> {
  const out: Record<string, SignalValue | null> = {};
  for (const s of SIGNALS) out[s.name] = s.measure ? s.measure(v) : null;
  return out;
}
