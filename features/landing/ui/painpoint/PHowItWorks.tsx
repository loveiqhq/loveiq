import type { FC } from "react";
import { QUESTIONS_ASKED } from "@features/report/logic/reportFacts";
import { ENTRY_PRICE } from "@features/landing/logic/freeClaims";
import { WIZARD_CHAPTER_COUNT } from "@features/survey/ui/wizard/wizardContent";
import { HOW_IT_WORKS, fillFacts } from "./painPointContent";

const FACTS = { questions: QUESTIONS_ASKED, price: ENTRY_PRICE, chapters: WIZARD_CHAPTER_COUNT };

/** The ringed numeral of the design system, 32px. */
const NUMERAL =
  "box-border flex h-8 w-8 flex-none items-center justify-center rounded-full border-[1.5px] border-solid border-transparent font-serif text-[14px] font-semibold text-[#3a2a55] [background:linear-gradient(#fcf9ff,#fcf9ff)_padding-box,linear-gradient(135deg,#fe6839_0%,#bf66d9_50%,#958ef6_100%)_border-box]";

/**
 * The three steps, compact, right under the band (board "How it works (moved, compact)"):
 * the time, the questions, the archetype, and what the report costs and holds. The numbers
 * come from the code that owns them, so the page cannot drift from the survey or the price.
 */
const PHowItWorks: FC = () => (
  <section
    data-landing-section="how_it_works"
    className="border-t border-[#e9e6ee] bg-white px-4 pb-8 pt-7 lg:px-6 lg:pb-10 lg:pt-9"
  >
    <div className="mx-auto flex max-w-[1180px] flex-col gap-[18px] lg:gap-6">
      <h2 className="m-0 font-serif text-[22px] font-medium leading-[1.25] tracking-[-0.01em] text-[#161021] [text-wrap:balance] lg:text-[26px]">
        {HOW_IT_WORKS.title}
      </h2>
      <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4 p-0 lg:gap-x-10 lg:gap-y-5">
        {HOW_IT_WORKS.steps.map((step, i) => (
          <li key={step.title} className="flex min-w-0 items-start gap-[14px]">
            <span aria-hidden className={NUMERAL}>
              {i + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5 lg:gap-1">
              <p className="m-0 font-serif text-[17px] font-medium leading-6 text-[#161021] lg:text-[18px]">
                {fillFacts(step.title, FACTS)}
              </p>
              <p className="m-0 text-[14px] leading-[21px] text-[#3f3a4d]">
                {fillFacts(step.body, FACTS)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  </section>
);

export default PHowItWorks;
