import { SURVEY_FREE_LINE } from "@features/landing/logic/freeClaims";

export interface Faq {
  question: string;
  answer: string;
}

/**
 * Single source of truth for the homepage FAQ.
 *
 * Rendered by features/landing/ui/white/WFAQ.tsx AND emitted as FAQPage JSON-LD
 * on the homepage (app/page.tsx). Sharing one array keeps the structured data
 * byte-for-byte identical to the visible content, which Google's structured-data
 * policy requires (FAQ rich results are rejected/penalized when the markup does
 * not match what users see). Edit here only.
 */
export const faqs: Faq[] = [
  {
    question: "What exactly does LoveIQ do?",
    answer:
      "LoveIQ analyzes how you think, feel, communicate, and relate. It translates your responses into a personalized archetype profile and relationship intelligence report that highlights patterns, strengths, challenges, and compatibility dynamics.",
  },
  {
    question: "How is my data used and protected?",
    answer:
      "Your data is encrypted, private, and never sold. Responses are used to generate your results and, in aggregated and anonymized form, to improve the quality of our service — never to train public or third-party AI models. You can delete or export your data at any time.",
  },
  {
    question: "What kind of results will I receive?",
    answer:
      "Your results will include core archetype, other archetype match scores, attachment style, communication style, risk orientation, strengths and challenges, practical insights and much more. The report is designed to feel both emotionally resonant and scientifically grounded.",
  },
  {
    question: "Who is this for?",
    answer:
      "LoveIQ is for anyone seeking deeper clarity about their sexuality and relationship patterns. It is especially relevant for people who value self-awareness, emotional intelligence, and personal growth.",
  },
  {
    question: "Is it based on science?",
    // No machine learning: scoring follows fixed rules (data/scoring-config.ts). Free claims,
    // 14 Nov (Marcus: no claims we can't deliver on); the dimension count is held to the
    // config by home-schema-counts.test.ts's rule.
    answer:
      "Yes. LoveIQ builds on research in relationship psychology, attachment, personality and behavior. Your answers are scored by fixed rules across 21 measured dimensions.",
  },
  {
    question: "How accurate are the insights?",
    answer:
      "Accuracy depends on the clarity and honesty of your inputs. The model identifies consistent patterns across multiple dimensions, going beyond a casual personality quiz. While no system can capture every nuance of a person, many users report that the insights feel precise and personally meaningful.",
  },
  {
    question: "Is it anonymous?",
    answer:
      "Yes. You can use LoveIQ with only an email address, to which your results will be delivered.",
  },
  // "Can I talk to a professional or coach through the app?" is gone (14 Nov): it promised
  // paid sessions that do not exist. Bring it back with the offer, not before.
  {
    question: "Is it free?",
    answer: `${SURVEY_FREE_LINE.slice(0, -1)}, paid once.`,
  },
  {
    question: "How long does the first assessment take?",
    answer:
      "Most users complete the initial assessment in 15 minutes. It is mobile-friendly, intuitive, and can be paused and resumed at any time.",
  },
  {
    question: "Can I save progress, revisit results, or share with a partner?",
    answer:
      "Yes. Progress is saved using a secure magic link sent to your email. You can resume, revisit results, or share them with a partner—no account required.",
  },
];
