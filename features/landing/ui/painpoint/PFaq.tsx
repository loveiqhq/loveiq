"use client";

import { useState, type FC } from "react";
import { faqs } from "@/data/faqs";
import { trackFaqExpanded } from "@features/analytics/client";
import { hashQuestion } from "@features/landing/logic/faqHash";
import { FAQ_TITLE } from "./painPointContent";
import { PP_FOCUS, PP_H2 } from "./ppStyles";

/**
 * "The questions people actually ask." (board "FAQ"): today's questions from data/faqs.ts,
 * which the homepage's FAQPage JSON-LD is built from, numbered. One answer is open at a
 * time, the first on arrival as the board draws it; a second click closes it. Opening one
 * sends faq_expanded keyed as on the video page. The panels keep the video page's ids
 * (w-faq-panel-<i>), which the persona walk finds the questions by.
 *
 * The numbers keep the board's `line-height: normal`: inheriting the page's 25.6px line
 * would make every row 3.6px taller than the board's 57.
 */
const PFaq: FC = () => {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section
      id="faq"
      aria-labelledby="w-faq-heading"
      data-landing-section="faq"
      className="bg-[#f5f6f8] px-4 py-16 lg:px-6 lg:py-24"
    >
      <div className="mx-auto flex max-w-[820px] flex-col gap-7">
        <h2 id="w-faq-heading" className={PP_H2}>
          {FAQ_TITLE}
        </h2>
        <ul className="m-0 flex list-none flex-col border-b border-solid border-[#e9e6ee] p-0">
          {faqs.map((faq, i) => {
            const isOpen = open === i;
            return (
              <li key={faq.question} className="border-t border-solid border-[#e9e6ee]">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`w-faq-panel-${i}`}
                  onClick={() => {
                    setOpen(isOpen ? null : i);
                    if (!isOpen) {
                      trackFaqExpanded({
                        question_index: i,
                        question_text_hash: hashQuestion(faq.question),
                      });
                    }
                  }}
                  className={`flex min-h-[44px] w-full items-center gap-3 py-[17px] text-left text-[#6b6678] ${PP_FOCUS}`}
                >
                  <span className="w-[18px] flex-none font-serif text-[12px] leading-[normal] tabular-nums text-[#6b6678]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1 font-serif text-[16px] font-medium leading-[22px] text-[#161021]">
                    {faq.question}
                  </span>
                  <svg
                    aria-hidden
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="flex-none"
                  >
                    <path d={isOpen ? "M5 12h14" : "M12 5v14M5 12h14"} />
                  </svg>
                </button>
                <div
                  id={`w-faq-panel-${i}`}
                  hidden={!isOpen}
                  className="pb-[18px] pl-[30px] pr-6 text-[14px] leading-[22.4px] text-[#3f3a4d]"
                >
                  {faq.answer}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};

export default PFaq;
