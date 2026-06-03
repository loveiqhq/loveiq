export interface Faq {
  question: string;
  answer: string;
}

/**
 * Single source of truth for the homepage FAQ.
 *
 * Rendered by features/landing/ui/S13FAQ.tsx AND emitted as FAQPage JSON-LD on
 * the homepage (app/page.tsx). Sharing one array keeps the structured data
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
    question: "Who is this app for?",
    answer:
      "LoveIQ is for anyone seeking deeper clarity about their sexuality and relationship patterns. It is especially relevant for people who value self-awareness, emotional intelligence, and personal growth.",
  },
  {
    question: "Is it based on science?",
    answer:
      "Yes. LoveIQ draws from relationship psychology, attachment theory, personality science, behavioral research, and large-scale pattern analysis. These foundations are combined with modern machine-learning techniques to create a rigorous and human-centered system.",
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
  {
    question: "Can I talk to a professional or coach through the app?",
    answer:
      "We are working with selected psychologists and relationship coaches to offer optional paid sessions. These experts will be familiar with the LoveIQ framework and able to support you based on your profile.",
  },
  {
    question: "Is it free?",
    answer:
      "You can start with a free LoveIQ assessment. Full report or specialized bundles are available through a one-time purchase.",
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
