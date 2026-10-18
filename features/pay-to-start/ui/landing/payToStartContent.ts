/**
 * Every word on the pay-to-start assessment page, verbatim from Figma Report-3.0
 * "Pay to start > Full Payments" (desktop 1706:1699, mobile 1706:2034), read from the
 * frames' text nodes on 18.10. Kept here, not in the components, so a copy change is one
 * diff and a test can hold the page to it.
 *
 * A price is never written out: every string that names one is a function of the price
 * the server sells at (`formatOfferPrice`), so the setting changes every mention at once.
 * `features/pay-to-start/tests/no-hardcoded-price.test.ts` fails on a "€" + digit here.
 *
 * Where the frames say something the product does not (57 questions, "~15 minutes" on the
 * price card, the motto and two chapters the slimmed report took out, 50+ pages), the
 * copy is kept as drawn and listed for Marcus in the PR (Fatih, 18.10: verbatim + flag).
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
  badge: "Applied Psychometrics original",
  title: "What’s my sexual archetype?",
  lead: "You were never taught the words for what you want. This gives you the language, and a precise map of how you desire.",
  ratingStars: "★★★★★",
  ratingValue: "4.9/5",
  ratingLabel: " rating",
  takers: "10,000+ people took the test",
  length: "57 questions · ~9 min",
} as const;

export const PTS_FIND_OUT = {
  title: "What you’ll find out",
  lead: "In about 9 minutes you’ll know things about yourself most people never learn. Your desire has a logic; we put it into plain words you can use.",
  cards: [
    {
      number: "01",
      title: "Identify your core archetype out of 14",
      body: "Your sexual personality among 14 research-based types, and how closely you match the others.",
    },
    {
      number: "02",
      title: "What actually turns you on",
      body: "Your desire has a logic. We put it into plain words you can use.",
    },
    {
      number: "03",
      title: "What raises the heat, and what kills it",
      body: "The exact conditions that switch desire on for you, and the ones that shut it down.",
    },
    {
      number: "04",
      title: "Words for what you crave",
      body: "You can’t ask for what you can’t name. The report gives you the vocabulary.",
    },
    {
      number: "05",
      title: "Where you and a partner keep missing each other",
      body: "See how your patterns collide in bed, and where the real gap is.",
    },
  ],
} as const;

export const PTS_INSIDE = {
  title: "Inside your report",
  lead: (price: string) =>
    `A 50+ page report written for your archetype, in chapters you can read in a few minutes each. All of it is included in ${price}; nothing is held back after you pay.`,
  chapters: [
    {
      number: "01",
      title: "Your core archetype",
      body: "Your sexual personality out of 14, your motto, and how closely you match the neighbouring types.",
    },
    {
      number: "02",
      title: "Desire accelerators & brakes",
      body: "Your strongest turn-on, named, and what quietly kills the mood for you.",
    },
    {
      number: "03",
      title: "How your archetype works",
      body: "Your typical sun and shadow beliefs, the challenges they create, and a 15-minute practice.",
    },
    {
      number: "04",
      title: "Core insecurities",
      body: "How fears of rejection or inadequacy shape when you open up, pull away or seek reassurance.",
    },
    {
      number: "05",
      title: "Confidence level",
      body: "Where your confidence feels solid, where it wavers, and how that shapes how you express desire.",
    },
    {
      number: "06",
      title: "Power orientation",
      body: "The balance of dominance, submission and equality that feels most natural to you.",
    },
  ],
  sample: {
    label: "SAMPLE PAGE · SPARK SEEKER",
    title: "Typical beliefs, and the shift",
    shiftLabel: "THE SHIFT",
    beliefs: [
      {
        from: "“If sex has to be planned, the spark must be gone.”",
        to: "“Planning can create the conditions for anticipation and spark.”",
      },
      {
        from: "“Real desire should happen spontaneously.”",
        to: "“Spontaneous desire excites me, but desire can also emerge once intimacy begins.”",
      },
      {
        from: "“I need novelty to stay sexually interested.”",
        to: "“Novelty strongly activates my desire, but I can create freshness without constantly needing something completely new.”",
      },
    ],
    caption: "From “How your archetype works”, one of the chapters in every report.",
  },
} as const;

export const PTS_PERSONALITIES = {
  title: "14 sexual personalities. You are more than just one of them.",
  lead: "You get matched to your nearest archetype, with your distance to the neighbouring types kept visible, because most people lead with one and borrow from others.",
  archetypes: [
    {
      name: "Spark Seeker",
      color: "#FE6839",
      motto: "“Let’s find the spark, then turn it into a blaze.”",
    },
    {
      name: "Sensual Connector",
      color: "#D05976",
      motto: "“Touch me with presence and meet me with heart.”",
    },
    {
      name: "Authority Conductor",
      color: "#E09A2A",
      motto: "“I set the frame, and we play inside it.”",
    },
    { name: "Tender Devotee", color: "#BF66D9", motto: "“Tell me I’m enough.”" },
    { name: "Minimalist Companion", color: "#8F9BB3", motto: "“Simple is enough.”" },
    { name: "Radiant Performer", color: "#E0A83A", motto: "“Watch me shine.”" },
    { name: "Curious Apprentice", color: "#56B4D3", motto: "“Teach me everything.”" },
    {
      name: "Explorer of Edges",
      color: "#E0518F",
      motto: "“Take me somewhere new, intense, and real enough to shake me awake.”",
    },
    {
      name: "Analytical Sexualist",
      color: "#795FC8",
      motto: "“Tell me what works, and I’ll get better at pleasing you.”",
    },
    {
      name: "Loyal Ritualist",
      color: "#1F9D6B",
      motto: "“Give me the familiar touch and the trusted rhythm.”",
    },
    {
      name: "Relational Nurturer",
      color: "#C97B5A",
      motto: "“Let us make each other feel safe, cared for, and wanted again.”",
    },
    {
      name: "Emotional Voyeur",
      color: "#6B8FD6",
      motto: "“Let me watch, imagine, and feel the tension before I fully step in.”",
    },
    {
      name: "Spiritual Lover",
      color: "#A58BD9",
      motto: "“Make it feel meaningful, like our bodies are saying something deeper.”",
    },
    {
      name: "Quiet Withdrawer",
      color: "#7A8A99",
      motto: "“Come slowly, ask gently, and let me feel that I can say no and still be safe.”",
    },
  ],
} as const;

export const PTS_HOW_IT_WORKS = {
  title: "How it works",
  steps: [
    {
      number: "01",
      title: "Unlock once",
      body: (price: string) =>
        `${price}, paid securely with Apple Pay, card or Link. One payment covers the survey and the full report.`,
    },
    {
      number: "02",
      title: "Answer 57 questions",
      body: () =>
        "About 9 minutes, at your own pace. Anonymous by default; pause and come back anytime.",
    },
    {
      number: "03",
      title: "Read your report",
      body: () =>
        "Your archetype and your full 50+ page report open the moment you finish. Nothing left to pay.",
    },
  ],
} as const;

export const PTS_TESTIMONIALS = {
  title: "What people say",
  ratingStars: "★★★★★",
  ratingValue: "4.9/5",
  ratingLabel: " · 10,000+ people",
  quotes: [
    {
      // The frame sets this one without quotation marks; the other three have them.
      quote:
        "The results are extensive and spot-on, without the test being too long. I got to know myself better, and it will help my partner understand me better as well.",
      name: "Dorian, 34",
      role: "File manager",
      avatar: "/testimonials/dorian.jpg",
    },
    {
      quote:
        "“I’d never really explored my sexuality or the patterns behind it before. The insights in the full report were truly eye-opening. Absolutely worth it.”",
      name: "Philipp Leonhard, 42",
      role: "Product Owner IT",
      avatar: "/testimonials/philipp.jpg",
    },
    {
      quote:
        "“The results were more insightful than I expected. It connected dots between emotional triggers and communication styles I hadn’t noticed before.”",
      name: "Richard Petrich, 34",
      role: "Entrepreneur",
      avatar: "/testimonials/richard.jpg",
    },
    {
      quote:
        "“Unlocking my report was one of the best investments made for my sexuality. It is shockingly precise.”",
      name: "Marija Mustapić, 41",
      role: "IT Infrastructure",
      avatar: "/testimonials/marija.jpg",
    },
  ],
} as const;

export const PTS_RESEARCH = {
  title: "Built by researchers, not for clicks",
  lead: "Science-backed, not a horoscope. We show our work.",
  stats: [
    {
      value: "≈60",
      label: "Calibrated items",
      body: "Situational questions across the full instrument, not self-flattering ones.",
    },
    {
      value: "30,000+",
      label: "Responses scored against",
      body: "Each answer loads onto the model’s dimensions, weighted by data.",
    },
    {
      value: "100+",
      label: "Papers and books",
      body: "Clinical models and peer-reviewed research behind every chapter.",
    },
  ],
  experts: [
    {
      quote:
        "“Care and transparency should go hand in hand. Especially when technology touches intimacy.”",
      name: "Dr. Dijana Galijašević",
      role: "Business Ethics & Social Science · HHL & ESADE",
      photo: "/academic/dijana-avatar.jpg",
    },
    {
      quote:
        "“The 14 personalities aren’t invented categories. They’re recurring patterns in how desire, attachment and arousal cluster across the research.”",
      name: "Dr. Bruno Steinkraus",
      role: "Biochemistry & Neuroscience · Oxford & Imperial",
      photo: "/academic/bruno-avatar.jpg",
    },
  ],
} as const;

export const PTS_ONE_PRICE = {
  title: "One price. Survey and full report.",
  terms: "One-time payment · no subscription",
  cta: "Unlock survey & report",
  includes: [
    "The full survey: 57 questions, about 9 minutes",
    "Your core archetype out of 14, with your closest matches",
    "Your full 50+ page report, unlocked the moment you finish",
    "Practices and one-sentence scripts you can use with a partner",
    "Lifetime access to your report",
    "A receipt and invoice by email",
  ],
  guaranteeLead: "14-day money-back guarantee.",
  guaranteeRest: ` If the report doesn’t give you anything new, write to ${PTS_SUPPORT_EMAIL} and we refund you. No questions asked.`,
} as const;

export const PTS_FAQ = {
  title: "Questions before you pay",
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
        "About 9 minutes for 57 questions. The report reads in chapters of a few minutes each.",
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
  cta: "Unlock survey & report",
  guarantee: "14-day money-back guarantee",
  includes: [
    "57 questions · ~15 minutes",
    "Full 50+ page report included",
    "Anonymous by default",
    "Pay once · no subscription",
  ],
} as const;

export const PTS_FINAL_CTA = {
  stars: "★★★★★",
  title: "Find the words for what you want",
  /** Split so the price clause never breaks at the hyphen in "one-time". */
  leadBefore: "57 questions · about 9 minutes · a 50+ page report you keep. ",
  leadPrice: (price: string) => `${price}, one-time.`,
  cta: (price: string) => `Unlock survey & report · ${price}`,
  /** The phone frame's shorter label (1706:2329). */
  ctaShort: (price: string) => `Unlock for ${price}`,
  badges: ["Anonymous by default", "14-day money-back", "No subscription"],
} as const;

export const PTS_STICKY_BAR = {
  label: "Survey + full report",
  cta: "Unlock survey & report",
} as const;

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
