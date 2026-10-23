/**
 * The eight answers to "Why didn't you unlock your report?", with every piece of copy the email,
 * the /why page and the admin page show for them. Copy from the epic's canvas ("Unlock feedback
 * email": Main = the email, Landing = /why) and the AP-Analytics canvas (Unlock feedback: the
 * short labels and themes), as Mark revised the answers on 22.10 (Marcus: "ok great changes"):
 * "The free report didn't feel valuable enough" for the preview line, "too much of a time
 * commitment" added, "Checkout didn't work" and "life got in the way" taken out.
 */

export const UNLOCK_REASONS = [
  "too_expensive",
  "low_value",
  "free_enough",
  "unclear_content",
  "result_off",
  "privacy",
  "time_commitment",
  "other",
] as const;

export type UnlockReason = (typeof UNLOCK_REASONS)[number];

export type ReasonTheme = "Price" | "Offer" | "Friction" | "Trust" | "Other";

export interface ReasonCopy {
  /** The email's button. */
  email: string;
  /** The /why page's "Your answer" select. */
  landing: string;
  /** The admin's charts and tables. */
  short: string;
  theme: ReasonTheme;
  /** The /why page's optional follow-up. */
  question: string;
  chips: readonly string[];
  placeholder: string;
}

export const REASON_COPY: Record<UnlockReason, ReasonCopy> = {
  too_expensive: {
    email: "It was too expensive and more than I wanted to pay",
    landing: "It was more than I wanted to pay",
    short: "More than I wanted to pay",
    theme: "Price",
    question: "What would have felt fair?",
    chips: [
      "About half the price",
      "A little less",
      "Pay per chapter",
      "A gift or bundle for two",
      "Price wasn’t really it",
    ],
    placeholder: "For example: what you’d expect a report like this to cost",
  },
  low_value: {
    email: "The free report didn’t feel valuable enough",
    landing: "The free report didn’t feel valuable enough",
    short: "Free report not valuable enough",
    theme: "Offer",
    question: "What was missing from the free report?",
    chips: [
      "Couldn’t see what’s inside",
      "Felt too general",
      "Too little about my archetype",
      "Nothing for couples",
      "Not practical enough",
    ],
    placeholder: "What would have made it worth it for you?",
  },
  free_enough: {
    email: "My free result already told me what I wanted to know",
    landing: "My free result already told me what I wanted to know",
    short: "Free result was enough",
    theme: "Offer",
    question: "What did you come to LoveIQ for?",
    chips: [
      "Just my archetype",
      "Curiosity",
      "To compare with a partner",
      "A specific question",
      "Someone shared it",
    ],
    placeholder: "Was there anything you still wondered about?",
  },
  unclear_content: {
    email: "I wasn’t sure what the full report includes",
    landing: "I wasn’t sure what the full report includes",
    short: "Unsure what’s included",
    theme: "Offer",
    question: "What would have helped you decide?",
    chips: [
      "A full sample chapter",
      "A table of contents",
      "Reviews from readers",
      "A money-back guarantee",
      "Who wrote it",
    ],
    placeholder: "What did you want to know before buying?",
  },
  result_off: {
    email: "My result didn’t quite feel like me",
    landing: "My result didn’t quite feel like me",
    short: "Result didn’t feel like me",
    theme: "Trust",
    question: "What felt off?",
    chips: [
      "Too broad",
      "Didn’t match my experience",
      "Some questions felt off",
      "I’m between two types",
      "Not sure yet",
    ],
    placeholder: "Which part didn’t fit, and why?",
  },
  privacy: {
    email: "Paying for something this personal felt uncomfortable",
    landing: "Paying for something this personal felt uncomfortable",
    short: "Paying felt too personal",
    theme: "Trust",
    question: "What gave you pause?",
    chips: [
      "Seeing it on my bank statement",
      "Giving my email",
      "How my data is stored",
      "Someone seeing it on my device",
      "Paying for this topic at all",
    ],
    placeholder: "What would make you feel more at ease?",
  },
  // Mark, 22.10. The canvas gives it no follow-up of its own yet: the page asks only for the
  // reader's words, as "Something else" does.
  time_commitment: {
    email: "The full report felt like too much of a time commitment",
    landing: "The full report felt like too much of a time commitment",
    short: "Too much of a time commitment",
    theme: "Friction",
    question: "What would have made it easier?",
    chips: [],
    placeholder: "One sentence is plenty",
  },
  other: {
    email: "Something else (tell us in a sentence)",
    landing: "Something else",
    short: "Something else",
    theme: "Other",
    question: "Tell us in your own words",
    chips: [],
    placeholder: "One sentence is plenty",
  },
};

export function isUnlockReason(value: unknown): value is UnlockReason {
  return typeof value === "string" && (UNLOCK_REASONS as readonly string[]).includes(value);
}

/** The chips a reason offers, by label: anything else a client sends is dropped. */
export function keepKnownChips(reason: UnlockReason, chips: readonly unknown[]): string[] {
  const known = REASON_COPY[reason].chips;
  return [...new Set(chips.filter((c): c is string => typeof c === "string" && known.includes(c)))];
}

/**
 * The order one email shows the answers in: all but "Something else" shuffled (the design's
 * "rotate the rows per send", against order bias; Marcus 22.10, "randomize them in email"),
 * "Something else" always last. `random` returns [0, 1), Math.random in the send and a fixed
 * sequence in tests.
 */
export function rotateReasons(random: () => number = Math.random): UnlockReason[] {
  const first = UNLOCK_REASONS.filter((r) => r !== "other");
  for (let i = first.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [first[i], first[j]] = [first[j]!, first[i]!];
  }
  return [...first, "other"];
}
