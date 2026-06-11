"use client";

import { useState, type FC } from "react";
import { faqs } from "@/data/faqs";
import { trackFaqExpanded } from "@features/analytics/client";

// Tiny stable hash for the analytics `question_text_hash` (no PII, just a key).
function hashQuestion(q: string): string {
  let h = 5381;
  for (let i = 0; i < q.length; i++) h = (h * 33) ^ q.charCodeAt(i);
  return (h >>> 0).toString(36);
}

const WFAQ: FC = () => {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="bg-white py-16 lg:py-24" aria-labelledby="w-faq-heading">
      <div className="content-shell max-w-3xl">
        <div className="mb-10">
          <h2
            id="w-faq-heading"
            className="font-serif text-3xl font-medium text-[#161021] sm:text-[44px]"
          >
            FAQ
          </h2>
          <p className="mt-2 text-[17px] text-[#6b6678]">Curious minds ask. We answer.</p>
        </div>

        <ul className="m-0 list-none border-t border-black/[0.08] p-0">
          {faqs.map((faq, i) => {
            const isOpen = open === i;
            return (
              <li key={faq.question} className="border-b border-black/[0.08]">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`w-faq-panel-${i}`}
                  className="focus-visible-ring flex w-full items-center justify-between gap-4 py-5 text-left"
                  onClick={() => {
                    const next = isOpen ? null : i;
                    setOpen(next);
                    if (next !== null) {
                      trackFaqExpanded({
                        question_index: i,
                        question_text_hash: hashQuestion(faq.question),
                      });
                    }
                  }}
                >
                  <span className="font-serif text-lg font-medium text-[#161021]">
                    {faq.question}
                  </span>
                  <svg
                    aria-hidden
                    className={`h-5 w-5 shrink-0 text-[#9a96a6] transition-transform ${isOpen ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                <div
                  id={`w-faq-panel-${i}`}
                  aria-hidden={!isOpen}
                  className={`grid transition-all duration-300 ease-out ${isOpen ? "grid-rows-[1fr] pb-5" : "grid-rows-[0fr]"}`}
                >
                  <div className="overflow-hidden">
                    <p className="text-[15px] leading-relaxed text-[#6b6678]">{faq.answer}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};

export default WFAQ;
