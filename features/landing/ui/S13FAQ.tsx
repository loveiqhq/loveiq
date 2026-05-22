"use client";

import { useState, useRef, useLayoutEffect, type FC } from "react";
import { trackFaqExpanded } from "@features/analytics/client";

// Stable, anonymized question identifier — non-cryptographic hash so we can
// surface a question_text_hash in analytics without shipping the literal copy.
function hashQuestion(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

const faqs = [
  {
    question: "What exactly does LoveIQ do?",
    answer:
      "LoveIQ analyzes how you think, feel, communicate, and relate. It translates your responses into a personalized archetype profile and relationship intelligence report that highlights patterns, strengths, challenges, and compatibility dynamics.",
  },
  {
    question: "How is my data used and protected?",
    answer:
      "Your data is encrypted, private, and never sold. Responses are used only to generate your results and to improve our models in anonymized form. You can delete or export your data at any time.",
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

interface FAQItemProps {
  question: string;
  answer: string;
  index: number;
}

const FAQItem: FC<FAQItemProps> = ({ question, answer, index }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const updateHeight = () => {
      if (contentRef.current) {
        setContentHeight(contentRef.current.scrollHeight);
      }
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, [answer]);

  return (
    <div className="flex w-full flex-col">
      {/* Question Bar */}
      <button
        type="button"
        onClick={() => {
          if (!isOpen) {
            // Fire only on closed→open transition. Collapse is not tracked
            // (signal is engagement, not toggling).
            trackFaqExpanded({
              question_index: index,
              question_text_hash: hashQuestion(question),
            });
          }
          setIsOpen(!isOpen);
        }}
        className="flex w-full cursor-pointer select-none items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#120b1c] px-4 py-3.5 text-left transition-colors duration-300 hover:border-white/10 sm:gap-4 sm:px-6 sm:py-4 disabled:opacity-100 disabled:cursor-pointer"
        aria-expanded={isOpen}
      >
        <span className="text-sm font-medium leading-snug text-white/90 sm:text-base md:text-lg">
          {question}
        </span>
        <span className="flex-shrink-0 text-white/50">
          {isOpen ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="2"
              viewBox="0 0 14 2"
              fill="none"
            >
              <path d="M1 1h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
            >
              <path
                d="M7 1v12M1 7h12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          )}
        </span>
      </button>

      {/* Answer Panel */}
      <div
        className="relative z-10 w-full overflow-hidden"
        style={{
          maxHeight: isOpen ? contentHeight + 40 : 0,
          opacity: isOpen ? 1 : 0,
          marginTop: isOpen ? -4 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition:
            "max-height 500ms ease-out, opacity 500ms ease-out, margin-top 500ms ease-out",
        }}
      >
        <div ref={contentRef} className="pt-5">
          {/* Answer Content Box */}
          <div className="relative rounded-bl-2xl rounded-br-2xl rounded-tr-2xl border border-white/5 bg-[#120B1C] px-6 py-5">
            <span className="absolute -left-px -top-4 flex h-8 w-8 items-center justify-center rounded-full bg-[#FE6839] shadow-[0px_10px_15px_-3px_rgba(0,0,0,0.1),0px_4px_6px_-4px_rgba(0,0,0,0.1)]">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
              >
                <path
                  d="M12.25 8.75C12.25 9.3939 11.7272 9.91667 11.0833 9.91667H4.08333L1.75 12.25V2.91667C1.75 2.27277 2.27277 1.75 2.91667 1.75H11.0833C11.7272 1.75 12.25 2.27277 12.25 2.91667V8.75"
                  stroke="white"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <p className="text-sm leading-relaxed text-gray-300 sm:text-base">{answer}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const S13FAQ: FC = () => {
  return (
    <section
      className="section-shell relative overflow-hidden bg-[#0A0510] px-4 text-text-primary"
      aria-labelledby="faq-heading"
    >
      <div className="content-shell relative flex max-w-4xl flex-col items-center gap-8">
        <div className="animate-on-scroll flex items-center gap-2 rounded-full border border-border bg-white/5 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#FE6839]">
          FAQs
        </div>
        <div className="animate-on-scroll stagger-1 space-y-3 text-center">
          <h2
            id="faq-heading"
            className="font-serif text-3xl leading-tight sm:text-4xl md:text-5xl"
          >
            <span className="block sm:inline">Curious Minds Ask.</span>{" "}
            <span className="block sm:inline text-[#9c7dff]">We Answer.</span>
          </h2>
        </div>

        <div className="animate-on-scroll stagger-2 flex w-full flex-col gap-3 sm:gap-4">
          {faqs.map((item, idx) => (
            <FAQItem
              key={item.question}
              index={idx}
              question={item.question}
              answer={item.answer}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default S13FAQ;
