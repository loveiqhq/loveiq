import { formatOfferPrice, type PayToStartOfferId } from "@features/pay-to-start/logic/offer";
import { INITIAL_UNLOCK_CREDIT_CENTS } from "@features/report/logic/initialUnlock";

/**
 * Every word on the pay-to-start assessment page, verbatim from Figma Report-3.0
 * "Pay to start > Full Payments" (desktop 1706:1699, mobile 1706:2034), read from the
 * frames' text nodes on 18.10. Kept here, not in the components, so a copy change is one
 * diff and a test can hold the page to it. What the initial report's page says otherwise
 * is `PTS_INITIAL`, at the end.
 *
 * A price is never written out: every string that names one is a function of the price
 * the server sells at (`formatOfferPrice`), so the setting changes every mention at once.
 * `features/pay-to-start/tests/no-hardcoded-price.test.ts` fails on a "€" + digit here.
 *
 * Where the frames said something the product does not, the copy follows the product (Eman,
 * 27.10): a 17-chapter report, not 50+ pages; no motto; Attachment style and Fantasy vs.
 * reality in place of the two chapters the slimmed report took out (Core insecurities,
 * Confidence level). The survey's own facts are stated as the survey has them
 * since sync 26.10 (Marcus handed the copy calls to Fatih): SURVEY_TOTAL_QUESTIONS questions
 * and its own 15-minute estimate, where the frames said 57, and nine minutes beside fifteen
 * (`tests/survey-facts.test.ts`).
 */

/** The address the frames give for refunds (FAQ 2 and the guarantee band). */
export const PTS_SUPPORT_EMAIL = "hello@loveiq.org";

/*
 * No header copy: the page wears the LoveIQ site's own header (PtsHeader), not Figma's
 * Facets wordmark (Marcus, 18.10: LoveIQ "until we are ready with the new brand").
 */

/** Shown as plain text: the pages it names do not exist yet (Fatih, 18.10). */
export const PTS_BREADCRUMB = ["Assessments", "Sexuality", "What’s my sexual archetype?"] as const;

export const PTS_HERO = {
  title: "What’s my sexual archetype?",
  lead: "You were never taught the words for what you want. This gives you the language, and a precise map of how you desire.",
  ratingStars: "★★★★★",
  ratingValue: "4.9/5",
  ratingLabel: " rating",
  takers: "10,000+ people took the test",
  length: "62 questions · ~15 min",
} as const;

/**
 * Landing V2's chapter overview (Mark, final 30.10), `#inside-your-report` (the ads' "See a
 * sample page" sitelink): the report's own chapter menu beside the questions it answers. The
 * rows are the live menu's (REPORT_V4_NAV_PARTS), not V2's drawing of the menu before the
 * slimmed report (16.10); the five questions are Mark's, each beside its chapter.
 */
export const PTS_INSIDE = {
  title: { lead: "The questions", emph: "your report", tail: "answers." },
  /** The menu row the drawing highlights, as if the reader were on it. */
  activeId: "core_archetype",
  notes: [
    {
      id: "core_archetype",
      title: "Start with who you are.",
      body: "Your Core Archetype, your constellation and how this report was built.",
    },
    { id: "typical_beliefs", title: "Which rules about sex did you never agree to?" },
    {
      id: "typical_arousal_accelerators_turn_ons_of_the_core_archetype",
      title: "What turns you on, and what shuts you down?",
    },
    {
      id: "challenges_in_partnership",
      title: "Where do you and your partners keep missing each other?",
    },
    {
      id: "typical_sexual_fantasy_amp_practice_tendencies",
      title: "Which fantasies belong in your head, and which in your bed?",
    },
  ],
} as const;

/**
 * Landing V2's "Inside Each Chapter" (Mark, final 30.10; the sync's label, in the report's
 * heading case): how one chapter reads, Typical Beliefs, in four cards. Its words are the
 * report's own (data/report3-typical-beliefs.ts). The lead is the offer's (PtsOfferCopy).
 */
export const PTS_SAMPLE = {
  title: { lead: "Inside", emph: "Each Chapter", tail: "." },
  cards: [
    {
      icon: "book",
      eyebrow: "Read",
      title: "What drives your pattern",
      kind: "read",
      label: "Part 3 · Typical Beliefs",
      text: "The goal is not to eliminate shadow beliefs or replace them with artificially positive ones. It is to notice when an automatic interpretation has quietly turned into a fact.",
    },
    {
      icon: "eye",
      eyebrow: "Recognise",
      title: "The belief, and the shift",
      kind: "shift",
      from: "“If sex has to be planned, the spark must be gone.”",
      shiftLabel: "THE SHIFT",
      to: "“Planning can create the conditions for anticipation and spark.”",
    },
    {
      icon: "target",
      eyebrow: "Practice time: ~15 min.",
      title: "Something to try",
      kind: "try",
      lead: "Separate the event from its meaning.",
      text: "First describe what actually happened without interpretation. Then ask: ",
      quote: "“What did I decide that meant?”",
    },
    {
      icon: "layers",
      eyebrow: "Go deeper",
      title: "Where it comes from",
      kind: "deeper",
      sources: [
        { title: "100+ research papers", body: "peer-reviewed, across several scientific fields" },
        { title: "Clinical models", body: "the frameworks therapists use, and their pointers" },
        {
          title: "Foundational books",
          body: "the texts experts return to, and their key insights",
        },
      ],
    },
  ],
  swipe: "Swipe",
} as const;

/**
 * Landing V2 (Mark, final 30.10): each step under an eyebrow, the price no longer in step 1.
 * The survey's own facts stand where V2 drew the older count, length and page total (Fatih,
 * 30.10; survey-facts.test.ts holds them).
 */
export const PTS_HOW_IT_WORKS = {
  title: "How it works",
  steps: [
    {
      number: "1",
      eyebrow: "One payment",
      title: "Unlock once",
      body: () =>
        "Paid securely with Apple Pay, card or Link. One payment covers the survey and the full report.",
    },
    {
      number: "2",
      eyebrow: "About 15 minutes",
      title: "Answer 62 questions",
      body: () =>
        "About 15 minutes, at your own pace. Anonymous by default; pause and come back anytime.",
    },
    {
      number: "3",
      eyebrow: "The moment you finish",
      title: "Read your report",
      body: () =>
        "Your archetype and your full 17-chapter report open the moment you finish. Nothing left to pay.",
    },
  ],
} as const;

/**
 * Landing V2's "One price" (Mark, final 30.10): the plan picker's card. The survey's own facts
 * stand where V2 drew older ones (Fatih, 30.10): 62 questions, about 15 minutes, 17 chapters.
 */
export const PTS_ONE_PRICE = {
  title: { lead: "One price.", emph: "Every chapter unlocked." },
  badge: "Survey + full report",
  cardTitle: { strong: "Your survey", rest: "and full archetype report" },
  covers: "One payment covers the survey and ",
  coversStrong: "the full report.",
  terms: "one-time payment",
  cta: "Unlock Survey & Full Report",
  guarantee: "14-day money-back guarantee.",
  includes: [
    "62 questions · ~15 minutes",
    "Full 17-chapter report included",
    "Anonymous by default",
    "Pay once · no subscription",
  ],
  secure: "Guaranteed Safe & Secure Checkout",
  chapters: { emph: "All chapters", rest: " of the report", second: "fully unlocked" },
} as const;

/** Landing V2's guarantee box under the desktop's price card (Mark, final 30.10). */
export const PTS_GUARANTEE = {
  title: "14-day money-back guarantee",
  body: "Risk-free. If it isn’t valuable to you, full refund, ",
  strong: "no questions asked.",
} as const;

export const PTS_FAQ = {
  // Landing V2's heading (Mark, 30.10), the home page's; the answers stay this page's own.
  title: { lead: "The questions people", emph: "actually ask." },
  items: [
    {
      question: "Why do I pay before the survey?",
      answer:
        "So the report is ready the moment you finish, with nothing locked and no second paywall. One payment covers the survey and the full report.",
    },
    {
      question: "What if I don’t like it?",
      answer: `You have a 14-day money-back guarantee. Write to ${PTS_SUPPORT_EMAIL} and we refund you, no questions asked.`,
    },
    {
      question: "Is it anonymous?",
      answer:
        "Yes, by default. We only need an email for your receipt and to send you the link to your report. Your answers are encrypted and never sold.",
    },
    {
      question: "What if I stop halfway?",
      answer:
        "Your progress is saved. Come back from the link in your receipt email and continue where you left off.",
    },
    {
      question: "How long does it take?",
      answer:
        "About 15 minutes for 62 questions. The report reads in chapters of a few minutes each.",
    },
    {
      question: "Is this a diagnosis?",
      answer:
        "No. It is a science-led reflection to help you understand yourself and start better conversations. It doesn’t replace a qualified professional.",
    },
  ],
  disclaimerBefore: "This assessment supports self-understanding. It is ",
  disclaimerBold: "not a diagnosis",
  disclaimerAfter:
    " and doesn’t replace a qualified professional. If you are in distress, please contact a local crisis line or emergency services.",
} as const;

export const PTS_PRICE_CARD = {
  eyebrow: "SURVEY + FULL REPORT",
  per: "one-time",
  /** Each page's buttons name its own report (Sanjin Studenovic, 20.10: both pages read the same). */
  cta: "Unlock Survey & Full Report",
  guarantee: "14-day money-back guarantee",
  includes: [
    "62 questions · ~15 minutes",
    "Full 17-chapter report included",
    "Anonymous by default",
    "Pay once · no subscription",
  ],
} as const;

export const PTS_FINAL_CTA = {
  stars: "★★★★★",
  title: "Find the words for what you want",
  /** Split so the price clause never breaks at the hyphen in "one-time". */
  leadBefore: "62 questions · about 15 minutes · a 17-chapter report you keep. ",
  leadPrice: (price: string) => `${price}, one-time.`,
  cta: (price: string) => `Unlock Survey & Full Report · ${price}`,
  /** The phone frame's shorter label (1706:2329). */
  ctaShort: (price: string) => `Unlock for ${price}`,
  badges: ["Anonymous by default", "14-day money-back", "No subscription"],
} as const;

export const PTS_STICKY_BAR = {
  label: "Survey + full report",
  /**
   * Shorter than the other buttons: the bar's button never wraps, and on a 360-wide phone
   * "Unlock Survey & Full Report" leaves the price too little room (measured 20.10).
   */
  cta: "Unlock Full Report",
} as const;

/**
 * What the initial report's page (EUR 1.99, `/sexual-archetype/initial`) says where it differs
 * from the full report's: Figma "Pay to start > Pre-Payments", desktop 1733:4089 and phone
 * 1733:4424, read from the frames' text nodes on 19.10. Everything else on it is the copy
 * above, and it has no "One price" band (neither frame draws one).
 *
 * Marcus drew it from the full report's frames and edited what changed. Lines he left as
 * they were, which say what EUR 1.99 does not buy, are corrected here and listed for him in
 * the PR (Fatih, 19.10: "fix them, flag to Marcus"):
 * - step 1 and the first answer said "the full report" (and the answer "nothing locked and
 *   no second paywall"): they now say the initial report;
 * - the phone's step 3 and closing line kept the full report's; both take the desktop's.
 */
export const PTS_INITIAL = {
  insideLead:
    "A 17-chapter report (when fully unlocked) written for your archetype, in chapters you can read in a few minutes each. This is how “Typical Beliefs” reads.",
  steps: [
    {
      ...PTS_HOW_IT_WORKS.steps[0],
      // The frames dropped the price here (the phone's reads "Paid securely …").
      body: () =>
        "Paid securely with Apple Pay, card or Link. One payment covers the survey and your initial report.",
    },
    PTS_HOW_IT_WORKS.steps[1],
    {
      ...PTS_HOW_IT_WORKS.steps[2],
      body: () =>
        "Your archetype and your initial report open the moment you finish. Nothing left to pay.",
    },
  ],
  faqItems: [
    {
      question: "Why do I pay before the survey?",
      answer:
        "So the report is ready the moment you finish. One payment covers the survey and your initial report.",
    },
    ...PTS_FAQ.items.slice(1),
  ],
  priceCard: {
    ...PTS_PRICE_CARD,
    eyebrow: "SURVEY + INITIAL REPORT",
    cta: "Unlock Survey & Initial Report",
    includes: [
      "62 questions · ~15 minutes",
      "Your Core Archetype and what drives it",
      "3x full chapters + 4x partly open",
      "How you rank against all 14 archetypes",
      // The initial unlock's credit (features/report/logic/initialUnlock.ts), as checkout takes it.
      `${formatOfferPrice(INITIAL_UNLOCK_CREDIT_CENTS)} credit toward your Full Report`,
    ],
  },
  finalCta: {
    ...PTS_FINAL_CTA,
    leadBefore: "62 questions · about 15 minutes",
    leadPrice: null,
    // As drawn: no middle dot before the price.
    cta: (price: string) => `Unlock Survey & Initial Report ${price}`,
  },
  stickyLabel: "Survey + Initial Report",
  // Short for the bar, as the full report's (PTS_STICKY_BAR).
  stickyCta: "Unlock Initial Report",
} as const;

/** One offer's page: what it says where the two pages differ. */
export interface PtsOfferCopy {
  insideLead: (price: string) => string;
  steps: ReadonlyArray<{
    number: string;
    eyebrow: string;
    title: string;
    body: (price: string) => string;
  }>;
  faqItems: ReadonlyArray<{ question: string; answer: string }>;
  priceCard: {
    eyebrow: string;
    per: string;
    cta: string;
    guarantee: string;
    includes: readonly string[];
  };
  finalCta: {
    title: string;
    stars: string;
    leadBefore: string;
    /** The closing line's price clause; the initial report's line has none. */
    leadPrice: ((price: string) => string) | null;
    cta: (price: string) => string;
    ctaShort: (price: string) => string;
    badges: readonly string[];
  };
  stickyLabel: string;
  stickyCta: string;
  /** The "One price" band, and the header's `#price` on it: the full report's page only. */
  onePrice: boolean;
}

export const PTS_OFFER_COPY: Record<PayToStartOfferId, PtsOfferCopy> = {
  full: {
    insideLead: () =>
      "A 17-chapter report written for your archetype, in chapters you can read in a few minutes each. This is how “Typical Beliefs” reads.",
    steps: PTS_HOW_IT_WORKS.steps,
    faqItems: PTS_FAQ.items,
    priceCard: PTS_PRICE_CARD,
    finalCta: PTS_FINAL_CTA,
    stickyLabel: PTS_STICKY_BAR.label,
    stickyCta: PTS_STICKY_BAR.cta,
    onePrice: true,
  },
  pre: {
    insideLead: () => PTS_INITIAL.insideLead,
    steps: PTS_INITIAL.steps,
    faqItems: PTS_INITIAL.faqItems,
    priceCard: PTS_INITIAL.priceCard,
    finalCta: PTS_INITIAL.finalCta,
    stickyLabel: PTS_INITIAL.stickyLabel,
    stickyCta: PTS_INITIAL.stickyCta,
    onePrice: false,
  },
};

export const PTS_FOOTER = {
  company: "© Applied Psychometrics UG · Berlin",
  disclaimer: "Screening tools, not a diagnosis, and never a substitute for clinical care.",
  /**
   * Not in the frames: the legal pages a shop has to link from every page (the imprint
   * within two clicks, DDG § 5), with the site's own labels, and the Digital Content Terms
   * the checkout's consent names. Flagged for Mark.
   */
  links: [
    { label: "Imprint", href: "/imprint" },
    { label: "Privacy Policy", href: "/privacy-policy" },
    { label: "Terms & Conditions", href: "/terms-and-conditions" },
    { label: "Digital Content & Subscription Terms", href: "/digital-content-terms" },
    { label: "Cookie Policy", href: "/cookies" },
  ],
} as const;

/** The page's own notices, for a return from Stripe or the email's continue link. */
export const PTS_NOTICES = {
  cancelled: "No payment was taken. You can unlock the survey and report whenever you’re ready.",
  continueInvalid:
    "That link didn’t work. If you paid, open the link in your confirmation email again, or write to us.",
  continueRefunded: "This payment was refunded, so the link no longer unlocks the survey.",
  continueUnpaid: "We couldn’t find a completed payment for that link.",
  continueUsed:
    "The survey for this purchase is done. Open the report from the link in the report email.",
  continueError: "Something went wrong on our side. Please try the link again in a moment.",
  checkoutStarting: "Taking you to secure checkout…",
  checkoutFailed: "We couldn’t open secure checkout. Please try again.",
  alreadyUsed:
    "This browser’s purchase has already been used for a report. Open it from the link in your email.",
} as const;

/** The hero video's play button, and what it says to a screen reader. */
export const PTS_VIDEO = {
  /** The film runs 70.4 s; Figma's "[2:30]" is a placeholder (flagged for Marcus). */
  duration: "1:10",
  label: "Watch the intro video with sound (1:10)",
  videoLabel: "LoveIQ intro video",
} as const;

/**
 * The "Checkout status" page Stripe sends the buyer back to (Figma 1475:2090 "08 Back on
 * LoveIQ", 2091 "09 Payment received", 2092 "10 Unlocked"). The three states are Figma's
 * words; the rest covers what the frames do not draw (a failed, refunded or used
 * payment, a wait that runs out), in the same voice. State 10's back link reads "Back to
 * report" in Figma, the reused component's default: no report exists yet, so it is the
 * landing page here too (flagged).
 */
export const PTS_STATUS = {
  title: "Checkout status",
  back: "Back to Landing Page",
  verifying: "Verifying your checkout session…",
  received: "Payment received. Unlocking your report…",
  completeLead: "Payment complete.",
  completeRest: " Your report is unlocked. Redirecting you now…",
  usedRest: " Your report is ready.",
  returnToLanding: "Return to Landing Page",
  startAgain: "Start checkout again",
  goToSurvey: "Go to Survey",
  openReport: "Open your report",
  missing: "We couldn’t find a checkout session. Go back and try again; nothing was charged.",
  failed: "The payment didn’t go through, so nothing was charged.",
  refunded: "This payment was refunded, so it no longer unlocks the survey.",
  unknown:
    "We couldn’t find this checkout. If you paid, the link in your confirmation email opens the survey.",
  slow: "Your payment is still being confirmed. We’ll email you the moment it is; you can close this page.",
  error: "We couldn’t verify the checkout result. Please reload this page in a moment.",
  // What the page says once the purchase belongs to a finished survey: the status route
  // never sends the report's address (a checkout session id is no secret).
  usedNoReport:
    "Payment complete. Your report is unlocked: open it from the link in your report email.",
} as const;
