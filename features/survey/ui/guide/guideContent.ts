/**
 * Survey 2.0's short guide, in place of today's intro and its four slides: Mark's Pre Survey
 * Wizard, the row "Suggestion · 3 cards excl. future/past me" (canvas LcXv9Kc2vTQR1jGhacobak,
 * read 23 Nov 2026). Two typos in the first card are fixed ("you report", "anwer").
 *
 * Only Survey 2.0 shows it (SurveyPage, a run on the `survey2` order); every other run keeps the
 * intro. The cards record `guide_card_N`, `guide_back_N` and `guide_skip_N` (funnel_event).
 */

/** The header over every card: the first line in the brand gradient. */
export const GUIDE_HEADER = { accent: "Short guide", rest: "before you start" } as const;

/** A run of a card's text: plain, bold, or a link. */
export type GuideRun = string | { strong: string } | { link: string; href: string };

export interface GuideRule {
  title: string;
  text: string;
}

export type GuideCard =
  | { icon: "sparkle"; heading: string; rules: readonly GuideRule[] }
  | {
      icon: "perspective" | "privacy";
      heading: string;
      /** Lines of text, each its own line; `gap` is the space between them, in px. */
      lines: readonly (readonly GuideRun[])[];
      gap: number;
    };

export const GUIDE_CARDS: readonly GuideCard[] = [
  {
    icon: "sparkle",
    heading: "Three rules to increase your report quality:",
    rules: [
      { title: "Be honest", text: "The more honest you answer, the more precise your report." },
      {
        title: "Answer freely, no one judges",
        text: "There are no right or wrong answers, every answer is ok.",
      },
      {
        title: "Stay to the end",
        text: "It takes about 9 minutes from start to finish, question by question.",
      },
    ],
  },
  {
    icon: "perspective",
    heading: "Answer from the perspective of today",
    lines: [
      [
        {
          strong:
            "You might have answered differently in the past, or want to answer differently in the future.",
        },
      ],
      ["Reflecting on your answers can be as valuable as the report itself."],
    ],
    gap: 10,
  },
  {
    icon: "privacy",
    heading: "Your Privacy Matters",
    lines: [
      [{ strong: "We encrypt everything you share." }],
      [{ strong: "A nickname and an alias email are fine" }, " if you’d rather stay anonymous."],
      ["Learn more in our ", { link: "> Trust Zone", href: "/trust-zone" }, "."],
    ],
    gap: 0,
  },
];

export const GUIDE_CARD_COUNT = GUIDE_CARDS.length;
