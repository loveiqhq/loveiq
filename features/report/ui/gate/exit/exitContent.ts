import { REPORT_PURCHASE_PLANS } from "@features/checkout/server/reportPurchase";
import type { InitialUnlockSource } from "@features/report/logic/initialUnlock";
import { GATE_COPY, euros } from "../gateContent";

/**
 * Every word on the paygate's two exit pages: Marcus's "Paygate exit pages" canvas (28.10),
 * Main for the EUR 1.99 gate's way out, FullUnlock for a EUR 1.99 holder who is not ready
 * for the full report, and its "Not today?" survey. As drawn, but (sync 28.10, Fatih):
 *   - prices, the credit and the guarantee read the payload and the reader's own quote, so
 *     "€1.99" where the canvas writes "€1,99";
 *   - the offer card's lines are the gate's own (GATE_COPY) and the full report's plan line,
 *     where the canvas still says "Premium Report" and "24 chapters, 50+ pages";
 *   - no deadline on the credit: none exists, so the canvas's "expires in 7 days" would be an
 *     invented one (UCPD Annex I no. 7);
 *   - headings that are not sentences are in the report's 02.10 heading case
 *     (logic/titleCase.ts); sentences stay as written;
 *   - the reasons fit what each reader has seen: the gate's reader has seen no result yet.
 */

/** Which exit: the EUR 1.99 gate's (`pre`) or the full report's, after the EUR 1.99 (`full`). */
export type ExitStage = "pre" | "full";

export type { InitialUnlockSource };

/** The query parameter that opens an exit over its page: `?leave=pre` / `?leave=full`. */
export const EXIT_LEAVE_PARAM = "leave";

export function isExitStage(value: unknown): value is ExitStage {
  return value === "pre" || value === "full";
}

export type ExitReasonCode =
  | "unexpected_payment"
  | "see_first"
  | "unclear_value"
  | "fit_doubt"
  | "time_commitment"
  | "low_value"
  | "enough_already"
  | "result_off"
  | "unclear_content"
  | "too_expensive"
  | "privacy"
  | "later"
  | "other";

export interface ExitReason {
  code: ExitReasonCode;
  label: string;
}

/**
 * "Not today? Tell us why." The codes are unlock-feedback's where they mean the same
 * (features/unlock-feedback/logic/reasons.ts), so the two surfaces read side by side.
 * The gate's reader has seen no result yet, so its list asks about paying before seeing;
 * the full report's reader has read the open chapters, so "free" became "what I've unlocked".
 */
export function exitReasons(stage: ExitStage, priceCents: number): ReadonlyArray<ExitReason> {
  if (stage === "pre") {
    return [
      { code: "unexpected_payment", label: "I didn’t expect to pay after the survey" },
      { code: "see_first", label: "I want to see some of it before I pay" },
      { code: "unclear_value", label: `I wasn’t sure what I’d get for ${euros(priceCents)}` },
      { code: "fit_doubt", label: "I’m not sure the result will feel like me" },
      { code: "too_expensive", label: "It was too expensive and more than I wanted to pay" },
      { code: "privacy", label: "Paying for something this personal felt uncomfortable" },
      { code: "later", label: "I’ll come back to it later" },
      { code: "other", label: "Something else (tell us in a sentence)" },
    ];
  }
  return [
    { code: "time_commitment", label: "The full report felt like too much of a time commitment" },
    { code: "low_value", label: "What I’ve unlocked didn’t feel valuable enough" },
    { code: "enough_already", label: "What I’ve unlocked already told me what I wanted to know" },
    { code: "result_off", label: "My result didn’t quite feel like me" },
    { code: "unclear_content", label: "I wasn’t sure what the full report includes" },
    { code: "too_expensive", label: "It was too expensive and more than I wanted to pay" },
    { code: "privacy", label: "Paying for something this personal felt uncomfortable" },
    { code: "other", label: "Something else (tell us in a sentence)" },
  ];
}

/**
 * The order a reader sees: every reason but "Something else" shuffled, that one last, as the
 * canvas's three boards each draw a different order of the same eight. The order shown is
 * recorded with the answer, so a reason's place can be read against how often it is chosen.
 */
export function orderExitReasons<T extends { code: string }>(
  reasons: ReadonlyArray<T>,
  random: () => number = Math.random
): T[] {
  const rest = reasons.filter((r) => r.code !== "other");
  const other = reasons.filter((r) => r.code === "other");
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  return [...rest, ...other];
}

/** The longest "Something else" sentence we keep. */
export const EXIT_NOTE_MAX = 500;

/** The full report's plan line, as the plan picker words it ("17 chapters and personalised growth"). */
const FULL_REPORT_CHAPTERS =
  REPORT_PURCHASE_PLANS.find((p) => p.plan === "full_report")?.features[1]?.label ??
  "17 chapters and personalised growth";

/**
 * Trustpilot's own word for a TrustScore (its bands: 4.3 and up Excellent, 3.8 Great,
 * 2.8 Average, 1.8 Poor, below that Bad), so the card never says more than the score does.
 */
export function trustpilotLabel(score: number): string {
  if (score >= 4.3) return "Excellent";
  if (score >= 3.8) return "Great";
  if (score >= 2.8) return "Average";
  if (score >= 1.8) return "Poor";
  return "Bad";
}

export const EXIT_COPY = {
  back: { pre: "Back to your result", full: "Back to my report" },
  brand: { lead: "Love", emph: "IQ" },
  /** Main/FullUnlock's headline: a sentence, so in the canvas's case. */
  hero: { lead: "Unlocking is", emph: "fully risk-free" },
  guarantee: {
    title: (days: number) => `${days}-Day Money-Back Guarantee`,
    subtitle: "Unlocking is 100% risk-free",
    body: (days: number) =>
      `If you unlock and don’t find it valuable, write to us within ${days} days and we refund you in full.`,
    bodyStrong: "No questions asked.",
    care: "We care that this helps you. If it doesn’t, you shouldn’t pay for it.",
    chips: ["Full refund", "No questions asked", "Zero risk"],
  },
  /**
   * Main's box under the guarantee (Marcus's canvas, 29.10), with Fatih's headline in place of
   * "Don't lose your results": leaving loses nothing, the result is saved and its link is in
   * the reader's email, so the box says so and keeps Marcus's line. The minutes are the
   * reader's own (surveyMinutesFromDuration); without them, the line has no number.
   */
  saved: {
    tileLabel: "MIN",
    title: "Your result is ready and saved",
    lead: "You invested",
    minutes: (minutes: number) => `${minutes} minutes`,
    rest: "into your answers. Don’t leave without seeing what they say.",
    noMinutes: "Your answers are in. Don’t leave without seeing what they say.",
  },
  /** FullUnlock's banner, with no expiry: the credit has none. */
  credit: {
    tileLabel: "CREDIT",
    title: (creditCents: number) => `Don’t lose your ${euros(creditCents)} credit`,
    paid: (priceCents: number) => `You earned it with your ${euros(priceCents)} unlock.`,
    gift: "It’s yours toward your Full Report.",
  },
  trustpilot: {
    brand: "Trustpilot",
    outOf: (score: string) => `· ${score} out of 5`,
    reviews: (count: string) => `${count} reviews on`,
    aria: (label: string, score: string, count: string) =>
      `Rated ${label}, ${score} out of 5 on Trustpilot, from ${count} reviews`,
  },
  why: {
    title: "Why It’s Worth Unlocking",
    rows: [
      { strong: "Stop guessing.", text: "Know what turns you on and off." },
      { strong: "Find the words.", text: "Ask for what you want." },
      { strong: "Keep desire alive.", text: "See what you need to stay close." },
    ],
  },
  reasons: {
    title: "Not today? Tell us why.",
    hint: "One tap is enough. We read every answer ourselves.",
    group: "Why didn’t you unlock your report?",
    footnote: "Your answer is only used to improve LoveIQ.",
    thanks: "Thank you. We read every answer.",
    noteLabel: "Tell us in a sentence",
    notePlaceholder: "Tell us in a sentence…",
    send: "Send",
    sending: "Sending…",
  },
  offer: {
    /** The gate's own pill, title and lines, so the two pages sell the same thing. */
    badge: GATE_COPY.card.badge,
    pre: {
      title: GATE_COPY.card.title,
      description: GATE_COPY.card.description,
      cta: GATE_COPY.card.cta,
      features: GATE_COPY.card.features,
    },
    full: {
      title: "Your Full Report",
      cta: "Unlock full report",
      features: (
        creditCents: number,
        source: InitialUnlockSource,
        priceCents: number
      ): ReadonlyArray<{ strong?: string; text: string }> => [
        { text: FULL_REPORT_CHAPTERS },
        { text: "Turn-ons, turn-offs and communication" },
        { text: "Practices to try this week" },
        source === "gift"
          ? { strong: `${euros(creditCents)} credit applied`, text: "" }
          : {
              strong: `${euros(creditCents)} credit applied`,
              text: ` from your ${euros(priceCents)}`,
            },
      ],
    },
    priceSuffix: GATE_COPY.card.priceSuffix,
    guarantee: (days: number) => `${days}-day money-back guarantee`,
    guaranteeLine: "No questions asked.",
    paymentsLabel: GATE_COPY.paymentsLabel,
    fineprint: "Anonymous · No subscription · Discreet billing",
  },
  /** Main's "Maybe later" stays on the page and says how the reader comes back (sync 29.10). */
  leave: {
    pre: "Maybe later",
    full: "Back to my open chapters",
    saved: "Saved. The link to your result is in your email.",
  },
  sticky: {
    cta: (priceCents: number) => `Unlock risk-free · ${euros(priceCents)}`,
    guarantee: (days: number) => `${days}-day money-back guarantee`,
    pre: "one-time payment",
    /** FullUnlock's, where the canvas counted the credit's days down: it has none. */
    full: (creditCents: number) => `${euros(creditCents)} credit applied`,
  },
} as const;
