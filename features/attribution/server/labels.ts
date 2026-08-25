/**
 * Plain-English names for every A/B arm, in one place.
 *
 * Both the Slack notifications and the /admin dashboard render arms through
 * these helpers, so the two surfaces can never disagree about what an arm is
 * called. The audience is non-technical: nobody reading a Slack message should
 * have to know that `white_prev` means the pre-rebuild landing page.
 *
 * Read the RAW stored value. Three existing helpers in this repo
 * (`recordVisit.ts`, the admin explorer, and the `get_landing_variant_funnel`
 * RPC) collapse anything that isn't `"white"` down to `"control"`, which means
 * round-2 `white_prev` traffic is currently reported as the RETIRED dark arm.
 * That is a live mislabelling — do not route values through those helpers before
 * they get here.
 */

/** The four experiment axes we can attribute a person to, server-side. */
export type ExperimentAxis = "landing" | "survey" | "pricing" | "paywall";

export interface ArmLabel {
  /** Short name for a chart axis or a table cell, e.g. "Landing page A (current design)". */
  short: string;
  /** Sentence for Slack, e.g. "Landing page A: the current design". */
  long: string;
  /** Set when the arm is no longer being assigned to new visitors. */
  retired?: boolean;
}

const UNKNOWN: ArmLabel = {
  short: "Not recorded",
  long: "not recorded",
};

/**
 * `unknown` is a real, expected state, not an error: the landing and survey arms
 * are only stamped when the visitor actually carried the cookie, so crawlers,
 * direct hits and anyone who predates the stamping (added 2026-06-20) legitimately
 * have no arm. Saying "not recorded" is honest; guessing an arm would not be.
 */
const LABELS: Record<ExperimentAxis, Record<string, ArmLabel>> = {
  landing: {
    // The A/B letter carries the identity and the parenthetical says which is
    // which, so "variant A" in a meeting and "Landing page A" in Slack are
    // unambiguously the same thing. Parentheses rather than a dash because these
    // strings are interpolated into whole sentences in the digest, where a second
    // dash reads as a break in the sentence.
    white: {
      short: "Landing page A (current design)",
      long: "Landing page A: the current design",
    },
    white_prev: {
      short: "Landing page B (previous design)",
      long: "Landing page B: the design it replaced",
    },
    // Round-1 dark landing page. Never assigned since 2026-08-21, but ~5% of stored
    // submissions still carry it, so it needs a truthful label of its own.
    control: {
      short: "Original dark landing page",
      long: "Landing page: the original dark design",
      retired: true,
    },
  },
  survey: {
    white: { short: "White survey", long: "Survey questions: white" },
    dark: { short: "Dark survey", long: "Survey questions: dark" },
  },
  pricing: {
    // No "(lower)" / "(higher)" here on purpose. These labels said A was the lower
    // arm, which was true for pricing 2.0 and became FALSE on 2026-08-24 when 2.1
    // raised A above B (A 39.99/49.99/59 vs B 29/39/49). Nothing failed — the
    // label just quietly started lying to Slack and /admin about which price a
    // buyer was shown. A direction baked into a name goes stale silently every
    // time the test flips, so the name identifies the arm and the surrounding
    // numbers (the amount paid, the digest's rates) carry the direction.
    A: { short: "Pricing A", long: "Pricing: group A" },
    B: { short: "Pricing B", long: "Pricing: group B" },
    // Retired 2026-06 in the 3-bucket → 2-bucket cut. Legacy quotes still read back as C.
    C: { short: "Pricing C", long: "Pricing: group C", retired: true },
  },
  paywall: {
    treatment: { short: "Forced paywall", long: "Paywall: forced — had to pay to read on" },
    control: { short: "Dismissible paywall", long: "Paywall: dismissible — could close it" },
  },
};

/** Look up an arm's labels. Never throws; unrecognised or absent values read as "not recorded". */
export function armLabel(axis: ExperimentAxis, arm: string | null | undefined): ArmLabel {
  if (!arm) return UNKNOWN;
  // eslint-disable-next-line security/detect-object-injection -- axis is a closed union.
  return LABELS[axis][arm] ?? UNKNOWN;
}

/** Every arm we actively assign for an axis, in a stable order for charts. Excludes retired arms. */
export function activeArms(axis: ExperimentAxis): string[] {
  // eslint-disable-next-line security/detect-object-injection -- axis is a closed union.
  return Object.entries(LABELS[axis])
    .filter(([, label]) => !label.retired)
    .map(([arm]) => arm);
}

/** True when the value is an arm we know about (retired ones included). */
export function isKnownArm(axis: ExperimentAxis, arm: string | null | undefined): boolean {
  // eslint-disable-next-line security/detect-object-injection -- axis is a closed union.
  return Boolean(arm && LABELS[axis][arm]);
}

/** Human name for the experiment itself, for chart titles and Slack section headings. */
export const AXIS_TITLES: Record<ExperimentAxis, string> = {
  landing: "Landing page design",
  survey: "Survey design",
  pricing: "Report pricing",
  paywall: "Paywall style",
};
