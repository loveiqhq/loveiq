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
  /** Short name for a chart axis or a table cell, e.g. "Landing Page V2 (Survey in Hero)". */
  short: string;
  /** Sentence for Slack, e.g. "Landing Page V2: survey in the hero". */
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
    // Marketing's naming convention (2026-08-27), adopted verbatim so the words in
    // Slack, in /admin and in a meeting are the same words. It replaced "Landing
    // page A / B (current / previous design)", which had two problems: the A/B
    // letters carried no hint of WHICH came first, and "current design" is a name
    // that goes stale the next time the page is rebuilt — the same failure already
    // documented on the pricing arms below.
    //
    // V2 is the version with question 1 in the hero, hence "Survey in Hero"; V1 is
    // the white landing that preceded that rebuild. The version numbers are the
    // identity and the parenthetical says which is which. Parentheses rather than a
    // dash because these strings are interpolated into whole sentences in the
    // digest, where a second dash reads as a break in the sentence.
    white: {
      short: "Landing Page V2 (Survey in Hero)",
      long: "Landing Page V2: survey in the hero",
    },
    white_prev: {
      short: "Landing Page V1 (First Design)",
      long: "Landing Page V1: the first design",
    },
    // Round-1 dark landing page. Never assigned since 2026-08-21, but ~5% of stored
    // submissions still carry it, so it needs a truthful label of its own.
    //
    // Deliberately NOT called V0 or "first". It predates the V1/V2 numbering, which
    // covers the two white designs only, and "Original dark landing page" beside
    // "Landing Page V1 (First Design)" would put two arms on screen both claiming to
    // be the first one. "before V1" is the one phrase that orders it without
    // competing for the name.
    control: {
      short: "Dark landing page (before V1)",
      long: "Landing page: the original dark design, before V1",
      retired: true,
    },
  },
  survey: {
    white: { short: "White survey", long: "Survey questions: white" },
    // Concluded 2026-08-25 in favour of white. The AXIS is retired too — it is
    // absent from every live-axis list, the same as `paywall` — but the flag is
    // what makes `activeArms("survey")` truthful, and it is a second guard: if
    // anyone re-adds the axis to CHART_AXES, `rowsForAxis` drops this arm and the
    // comparison collapses to one arm rather than quietly reviving a dead test.
    dark: { short: "Dark survey", long: "Survey questions: dark", retired: true },
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
  // Whole axis concluded, and the forced wall itself was removed on 2026-08-31,
  // so NEITHER arm is assigned any more — both carry `retired` for the same
  // second-guard reason as the survey axis above. Stored rows still read back
  // with a truthful label; `activeArms("paywall")` is correctly empty.
  paywall: {
    treatment: {
      short: "Forced paywall",
      long: "Paywall: forced — had to pay to read on",
      retired: true,
    },
    control: {
      short: "Dismissible paywall",
      long: "Paywall: dismissible — could close it",
      retired: true,
    },
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
