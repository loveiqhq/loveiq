/**
 * Every word of the new landing page (round 4's `pain_point`), verbatim from Marcus's
 * Claude Design "LoveIQ landing page · pain-point version", final boards "Desktop · Hero 3"
 * and "Mobile · Hero 3" (14 Nov 2026), except where the site's facts or Fatih's calls of
 * 14 Nov change a line. Each change is marked CHANGED with what the board says.
 *
 * Numbers that have a source in the code come from it: the survey's question count, the
 * report's chapter count and the entry price. features/landing/tests/painPointPage.test.tsx
 * prints every line.
 */

/** Question 1 of the survey (data/survey-data.ts, Q01002), asked in the hero. */
export const QUESTION_1 = "Right now, I feel satisfied with my sex life.";

export const HERO = {
  titleLead: "Become a better and ",
  titleAccent: "more intelligent lover.",
  introGrounded: "Grounded in state-of-the-art science & research.",
  // CHANGED: the board says "~9 minutes"; the survey takes 15 (its own estimate, and the
  // whole site's since 27.10: features/landing/tests/survey-length-and-report-size.test.ts).
  introTime: "In just ~15 minutes",
  // CHANGED: full stop added; the board's sentence ends without one.
  introRest:
    ", decode your sexual personality and patterns, so you get clear, practical steps to improve intimacy.",
  scaleAria: "How true is this for you?",
  scaleLabels: [
    "1, not true at all",
    "2",
    "3",
    "4, neutral",
    "5",
    "6",
    "7, completely true",
  ] as const,
  scaleLow: "Not true at all",
  scaleHigh: "Completely true",
  ctaStart: "Start free test",
  ctaContinue: "Continue free test",
  liveTail: "people are taking the test right now",
  privacyLead: "Your ",
  privacyStrong: "privacy & anonymity",
  privacyTail: " come first. Learn more in our ",
  // CHANGED: the board links "#faq"; it goes to the Trust Center page, as on the video page.
  privacyLink: "Trust Center",
} as const;

/** The gradient band under the hero ("Why people trust LoveIQ"). */
export const TRUST_BAND = {
  label: "Why people trust LoveIQ",
  items: [
    { icon: "people", strong: "10,000+ people", muted: "have started the test", strongFirst: true },
    { icon: "book", muted: "Grounded in", strong: "100+ papers and books", strongFirst: false },
    { icon: "lock", strong: "Anonymous, encrypted,", muted: "never sold", strongFirst: true },
  ],
} as const;

/** The three steps. `{questions}`, `{price}` and `{chapters}` are filled from the code. */
export const HOW_IT_WORKS = {
  // CHANGED: the board says "~9 minutes."
  title: "~15 minutes. 14 archetypes. Your next steps.",
  steps: [
    { title: "Answer {questions} questions", body: "Anonymous, no account needed." },
    { title: "Meet your archetype", body: "Plus your core motivation." },
    // CHANGED (Fatih, 14 Nov): the board says "Get your free result", but nothing personal
    // opens before €1.99 today; and "7-day money-back guarantee", where the guarantee is
    // 14 days (Fatih, 02.10).
    {
      title: "Get your result",
      body: "Go deeper from {price}: {chapters} chapters with practices. 14-day money-back guarantee.",
    },
  ],
} as const;

export const PAIN_POINTS = {
  titleLead: "Is your sex life stuck in one of these ",
  titleAccent: "patterns",
  titleTail: "?",
  /** Phone board only. */
  intro:
    "These are the six things people tell us most often before they take the test. Each one has a cause you can name, and your report shows you what it is in your case and what to do about it.",
  cards: [
    {
      quote: "“I want sex more than my partner does, and asking has started to feel like begging.”",
      lead: "You'll understand",
      rest: " your desire gap, and how to talk about it without keeping score.",
    },
    {
      quote: "“I love them. I just don't want sex the way I used to.”",
      lead: "You'll understand",
      rest: " whether your desire is responsive, and what it needs before it shows up.",
    },
    {
      quote: "“The second it feels like pressure, I shut down.”",
      lead: "You'll understand",
      rest: " your brakes: the specific things that switch your desire off.",
    },
    {
      quote: "“It's safe and kind, and somehow not exciting anymore.”",
      lead: "You'll understand",
      rest: " your accelerators: the kind of novelty that works for you, not for everyone.",
    },
    {
      quote: "“I know something's missing. I just can't say what.”",
      lead: "You'll get",
      rest: " the vocabulary for what you want, in plain words you can use.",
    },
    {
      quote: "“We keep having the same argument about how often.”",
      lead: "You'll see",
      rest: " the pattern behind the argument, so you can stop repeating it.",
    },
  ],
} as const;

export const PROMISE = {
  titleLead: "What ",
  titleAccent: "changes",
  titleTail: " with LoveIQ.",
  body: "You can't ask for what you can't describe. Once your pattern has words, the conversation you've been avoiding gets a lot shorter, and a lot kinder.",
  rows: [
    {
      before: "Hoping your partner will guess",
      after: "Ask for what you want in one clear sentence.",
    },
    {
      before: "Wondering what's going on with you",
      after: "Know the conditions your desire needs, and create them on purpose.",
    },
    {
      before: "The same argument about frequency",
      after: "Talk about the gap between you without blame on either side.",
    },
    {
      before: "Sex on autopilot",
      after: "Know which new things are worth trying for you, and which aren't.",
    },
  ],
} as const;

export const WORDS = {
  title: "Sentences you can actually say.",
  body: "Your report turns your answers into plain language: the terms researchers use for what you feel, and the words to bring it up with a partner without it turning into a fight.",
  chips: [
    "responsive desire",
    "accelerators and brakes",
    "desire discrepancy",
    "initiation style",
    "novelty seeking",
    "aftercare",
  ],
  frameUrl: "loveiq.org/report",
  imageAlt:
    "A page from the LoveIQ report: your constellation of top three archetypes, the core archetype card and the summary",
  caption: "A look inside a real LoveIQ report. Yours is written for your own pattern.",
} as const;

export const STATS = {
  title: "Sex problems are common. Talking about them isn't.",
  cards: [
    { value: "47%", body: "of adults have a sexual concern they've never raised with a partner." },
    {
      value: "56%",
      body: "of people who take our test need emotional closeness before desire shows up.",
    },
    { value: "42%", body: "shut down when sex starts to feel like pressure." },
    // CHANGED (Fatih, 14 Nov): the board says 76%; LoveIQ State of Desire 2026 says 77%.
    { value: "77%", body: "want more variety in their sex life than they have now." },
  ],
  // CHANGED (Fatih, 14 Nov): added; the board names no source. 47% is LoveHoney's (as on
  // the video page); 56%, 42% and 77% are our own survey's agreement shares.
  sources: "Sources: LoveHoney Global Sex Survey 2023 · LoveIQ State of Desire 2026 (n = 2,369)",
} as const;

export const FAQ_TITLE = "The questions people actually ask.";

export const READY = {
  titleLead: "Ready to",
  titleAccent: "better understand yourself?",
  note: "Anonymous by default · ~15 minutes · No account required",
} as const;

export const FOOTER = {
  line: "© 2026 Applied Psychometrics UG · Berlin · Democratizing sexual psychology",
  // CHANGED: the board's links are placeholders ("#top"); these are the real pages.
  links: [
    { label: "Privacy", href: "/privacy-policy" },
    { label: "Terms", href: "/terms-and-conditions" },
    { label: "Imprint", href: "/imprint" },
    { label: "Medical disclaimer", href: "/medical-disclaimer" },
  ],
} as const;

/** Fill `{questions}`, `{price}` and `{chapters}` in a line. */
export const fillFacts = (
  line: string,
  facts: { questions: number; price: string; chapters: number }
): string =>
  line
    .replace("{questions}", String(facts.questions))
    .replace("{price}", facts.price)
    .replace("{chapters}", String(facts.chapters));
