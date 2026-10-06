/**
 * The behaviours a proof walk plants, and the truth it knows because it planted them.
 *
 * A proof walk (walk.ts --proof) runs production's code on staging's database
 * (MAIN_ON_STAGING) and does, on purpose, what the 22 signals look for: goes back in the
 * survey, taps a disabled button, pauses, rage-taps, opens the chapter list, closes the
 * paywall one of four ways. Each walk plants a different mix, so every signal meets walks
 * where it happened and walks where it did not (features/ux-signals/logic/proof.ts needs
 * both). What the walk did is the truth its events are checked against.
 */
import { createHash } from "node:crypto";

import { bucketOf, median, type SignalValue } from "@features/ux-signals/logic/signals";

import personasFile from "./personas.json";
import { PLANS, type Plan } from "./rotation";

export type Escape = "close_button" | "escape" | "backdrop" | "browser_back";
export type Quit = "survey" | "report" | "paywall" | "checkout";

export interface Plants {
  /** Milliseconds on the landing page before pressing its call to action. */
  landingWaitMs: number;
  /** Open one answer in the landing FAQ first. */
  faq: boolean;
  /** Survey: how many questions to go back, once, and at which question (counted from 1). */
  backs: 0 | 1 | 2;
  backsAt: number;
  /** Tap the disabled Next once, before answering this question (counted from 1); 0 for none. */
  deadNextAt: number;
  /** Press Enter on the email question with a confirmation that does not match. */
  formError: boolean;
  /** Questions (counted from 1) to pause on for a long time. */
  hesitateAt: number[];
  pace: "steady" | "slowing" | "speeding up";
  /** Four quick taps on a report heading. */
  rage: boolean;
  /** Open the chapter list and jump to two chapters. */
  chapters: boolean;
  /** Close the paywall this way before paying, or not at all. */
  escape: Escape | "none";
  /** How long the paywall stays open before that. */
  dwellMs: number;
  /** Move the paywall's reviews on once while it is open. */
  reviews: boolean;
  /** Extra milliseconds before pressing a plan's button. */
  ctaWaitMs: number;
  /** Leave early, here; absent for a walk that pays. */
  quit?: Quit;
  /** The survey question to leave on (counted from 1), for quit "survey". */
  quitAt?: number;
}

/** A number in [0, 1) that the same night, walk and name always give. */
export function draw(seed: string, name: string): number {
  return createHash("sha256").update(`${seed}|${name}`).digest().readUInt32BE(0) / 2 ** 32;
}

/**
 * Tonight's plants for one walk. Each behaviour is on for about half the walks, so the
 * proof sees both sides within a few nights. Back closes the paywall where the paywall added a
 * history entry (useCloseOnBack), which it does on every engine since 2026-10-05; the walk
 * checks for the entry before pressing it. A tap outside needs room outside, which a phone's
 * full-width paywall barely has.
 */
export function plantsFor(seed: string, opts: { phone: boolean; quit?: Quit }): Plants {
  const d = (name: string) => draw(seed, name);
  const escapes: Escape[] = opts.phone
    ? ["close_button", "escape", "browser_back"]
    : ["close_button", "escape", "backdrop"];
  const hesitate = d("hesitate") < 0.5;
  return {
    landingWaitMs: 1500 + Math.round(d("landingWait") * 6500),
    faq: d("faq") < 0.5,
    backs: d("backs") < 0.5 ? 0 : d("backsTwo") < 0.5 ? 1 : 2,
    backsAt: 6 + Math.floor(d("backsAt") * 30),
    deadNextAt: d("deadNext") < 0.5 ? 0 : 4 + Math.floor(d("deadNextAt") * 30),
    formError: d("formError") < 0.5,
    hesitateAt: hesitate ? [8 + Math.floor(d("hesitateAt") * 30)] : [],
    pace: (["steady", "slowing", "speeding up"] as const)[Math.floor(d("pace") * 3)]!,
    rage: d("rage") < 0.5,
    chapters: d("chapters") < 0.5,
    escape: d("escape") < 0.5 ? "none" : escapes[Math.floor(d("escapeHow") * escapes.length)]!,
    dwellMs: 2500 + Math.round(d("dwell") * 7000),
    reviews: d("reviews") < 0.5,
    ctaWaitMs: Math.round(d("ctaWait") * 6000),
    ...(opts.quit ? { quit: opts.quit, quitAt: 3 + Math.floor(d("quitAt") * 38) } : {}),
  };
}

export interface ProofWalk {
  persona: string;
  device: string;
  plan: Plan;
  quit?: Quit;
}

/** Tonight's proof walks: two phones and two desktops, one of the four leaving early. */
export function proofWalksFor(at: Date, personas = personasFile.personas.map((p) => p.archetype)) {
  const day = Math.floor(at.getTime() / 86_400_000);
  const quits: Quit[] = ["survey", "report", "paywall", "checkout"];
  const walks: ProofWalk[] = [0, 1, 2, 3].map((k) => ({
    persona: personas[(day * 4 + k) % personas.length]!,
    device: k % 2 === 0 ? "iPhone 15 Pro" : "Desktop Chrome",
    plan: PLANS[(day + k) % PLANS.length]!,
  }));
  // The slot moves on by one more every four days, so each way of leaving meets a phone and
  // a desktop within eight nights; the same index for both kept survey quits on a phone.
  walks[(day + Math.floor(day / quits.length)) % 4]!.quit = quits[day % quits.length];
  return walks;
}

/** What a walk records as it goes, to know each signal's true value at the end. */
export interface WalkLog {
  landingShownAt?: number;
  ctaPressedAt?: number;
  /**
   * Each time the survey moved on: when, the question it left, and that question's place in
   * the survey counted from 1 (after a backtrack, the same place comes round again).
   */
  commits: Array<{ at: number; questionId: string; position: number }>;
  backs: number;
  deadTaps: Array<"disabled_control" | "non_interactive">;
  rageBursts: number;
  formErrors: number;
  /** The survey question left on, counted from 1, and the progress the bar showed. */
  quitOn?: { question: number; progressPct: number };
  completedSurvey: boolean;
  reportShown: boolean;
  /** Deepest scroll on the report, in per cent, and the same up to the first prices. */
  reportScrollPct: number;
  scrollBeforePaywallPct?: number;
  reportHasLockedCards?: boolean;
  lockedCtaSeen: boolean;
  chapterMoves: number;
  bounced: boolean;
  /** The prices appeared (the paywall opened) at least once. */
  pricesShown: boolean;
  /** How the paywall was first closed without paying, and after how long. */
  firstClose?: { how: Escape; afterMs: number };
  trustActions: number;
  /** A plan's button pressed on the paywall: how long after the plans appeared. */
  planPressedAfterMs?: number;
  checkoutPlan?: Plan;
  paid: boolean;
  exit?: "survey" | "report" | "paywall" | "checkout";
}

export const emptyLog = (): WalkLog => ({
  commits: [],
  backs: 0,
  deadTaps: [],
  rageBursts: 0,
  formErrors: 0,
  completedSurvey: false,
  reportShown: false,
  reportScrollPct: 0,
  lockedCtaSeen: false,
  chapterMoves: 0,
  bounced: false,
  pricesShown: false,
  trustActions: 0,
  paid: false,
});

/**
 * The time on each question, from the walk's own clock: the same rule the measure applies
 * to the events (logic/signals.ts answerGaps), applied to what the walk knows it did.
 */
function gaps(log: WalkLog): Array<{ questionId: string; ms: number }> {
  return log.commits
    .slice(1)
    .map((c, i) => ({ questionId: c.questionId, ms: c.at - log.commits[i]!.at }));
}

/** Every signal the walk can speak to, and its true value. */
export function truthOf(log: WalkLog): Record<string, SignalValue> {
  const t: Record<string, SignalValue> = {};
  if (log.landingShownAt !== undefined) {
    t["Time to first action"] =
      log.ctaPressedAt !== undefined ? log.ctaPressedAt - log.landingShownAt : "none";
  }
  const g = gaps(log);
  if (g.length >= 5) {
    t["Step completion time"] = Math.round(median(g.map((x) => x.ms))!);
    const usual = median(g.map((x) => x.ms))!;
    const long = g
      .filter((x) => x.ms > 3 * usual && x.ms > 8000)
      .map((x) => x.questionId)
      .sort();
    t["Answer hesitation"] = long.length ? long.join(",") : "none";
  }
  if (g.length >= 12) {
    const third = Math.floor(g.length / 3);
    const first = median(g.slice(0, third).map((x) => x.ms))!;
    const last = median(g.slice(-third).map((x) => x.ms))!;
    const ratio = last / Math.max(1, first);
    t["Engagement acceleration/deceleration"] =
      ratio > 1.5 ? "slowing" : ratio < 1 / 1.5 ? "speeding up" : "steady";
  }
  // Only when known: a walk that finished without paying or leaving (--no-pay) stopped
  // where it was told to, which is no visitor's exit.
  if (log.paid || log.exit) t["Drop-off / exit point"] = log.paid ? "paid" : log.exit!;
  if (log.commits.length > 0 || log.quitOn) {
    t["Backtracking"] = log.backs;
    t["Form errors"] = log.formErrors;
    t["Skipped / abandoned questions"] = log.completedSurvey
      ? "completed"
      : `Q${log.quitOn?.question ?? 1}`;
    t["Progress sensitivity"] = log.completedSurvey ? 100 : bucketOf(log.quitOn?.progressPct ?? 0);
  }
  t["Dead clicks"] = log.deadTaps.includes("disabled_control")
    ? "disabled_control"
    : log.deadTaps.length
      ? "non_interactive"
      : "none";
  t["Rage clicks / repeated taps"] = log.rageBursts;
  t["Trust seeking"] = log.trustActions;
  if (log.reportShown) {
    t["Scroll behavior"] = bucketOf(log.reportScrollPct);
    t["Expectation mismatch"] = log.bounced ? "bounced" : "stayed";
    t["Report curiosity"] = log.chapterMoves;
    if (log.reportHasLockedCards) t["CTA visibility"] = log.lockedCtaSeen ? "seen" : "not seen";
  }
  if (log.pricesShown || log.checkoutPlan) {
    if (log.scrollBeforePaywallPct !== undefined) {
      t["Value discovery before paywall"] = bucketOf(log.scrollBeforePaywallPct);
    }
    t["Price interaction"] = log.checkoutPlan ?? "none";
  }
  if (log.pricesShown) {
    t["Paywall dwell time"] = log.firstClose ? log.firstClose.afterMs : "none";
    t["Paywall escape behavior"] = log.firstClose?.how ?? "not closed";
    if (log.planPressedAfterMs !== undefined) t["CTA hesitation"] = log.planPressedAfterMs;
  }
  if (log.checkoutPlan) t["Conversion blockers"] = log.paid ? "paid" : "stopped";
  return t;
}

/** Report tokens and Stripe sessions out of anything a walk stores. */
export function scrubEvent<T extends { props: Record<string, unknown> }>(e: T): T {
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e.props)) {
    props[k] =
      typeof v === "string"
        ? v
            .replace(/\/report\/[^/?#\s]+/g, "/report/<token>")
            .replace(/rpt_[A-Za-z0-9_-]+/g, "rpt_<token>")
            .replace(/cs_(?:test|live)_[A-Za-z0-9_-]+/g, "cs_<session>")
        : v;
  }
  return { ...e, props };
}

export { PLANS };

if (process.argv[1]?.endsWith("plants.ts")) {
  // Tonight's proof walks, as JSON: `npx tsx scripts/walkers/plants.ts`.
  console.log(JSON.stringify(proofWalksFor(new Date())));
}
