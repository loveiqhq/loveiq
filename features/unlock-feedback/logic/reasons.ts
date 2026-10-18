/**
 * The nine answers to "Why didn't you unlock your report?", with every piece of copy the email,
 * the /why page and the admin page show for them. Copy is Marcus's, exact, from the epic's
 * canvas ("Unlock feedback email": Main = the email, Landing = /why) and the AP-Analytics
 * canvas (Unlock feedback: the short labels and themes).
 */

export const UNLOCK_REASONS = [
  "too_expensive",
  "low_value",
  "free_enough",
  "unclear_content",
  "result_off",
  "privacy",
  "checkout",
  "later",
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
    email: "I didn’t see enough value in the preview",
    landing: "I didn’t see enough value in the preview",
    short: "Not enough value in the preview",
    theme: "Offer",
    question: "What was missing from the preview?",
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
  checkout: {
    email: "Checkout didn’t work for me",
    landing: "Checkout didn’t work for me",
    short: "Checkout didn’t work",
    theme: "Friction",
    question: "What happened at checkout?",
    chips: [
      "My payment method was missing",
      "Payment failed",
      "Page didn’t load",
      "Couldn’t find the button",
      "Price changed",
    ],
    placeholder: "Device, browser, what you saw on screen",
  },
  later: {
    email: "I meant to, and life got in the way",
    landing: "I meant to, and life got in the way",
    short: "Life got in the way",
    theme: "Friction",
    question: "What got in the way?",
    chips: [
      "Busy at the time",
      "Wanted to read on a bigger screen",
      "Wanted to ask my partner first",
      "Simply forgot",
      "Waited for a discount",
    ],
    placeholder: "Anything that would have made it easier?",
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
 * The order one email shows the answers in: the first eight shuffled (the design's "rotate the
 * first eight rows per send", against order bias), "Something else" always last. `random`
 * returns [0, 1), Math.random in the send and a fixed sequence in tests.
 */
export function rotateReasons(random: () => number = Math.random): UnlockReason[] {
  const first = UNLOCK_REASONS.filter((r) => r !== "other");
  for (let i = first.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [first[i], first[j]] = [first[j]!, first[i]!];
  }
  return [...first, "other"];
}
