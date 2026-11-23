import type { FC } from "react";
import { STATS } from "./painPointContent";
import { PP_ACCENT, PP_H2, PP_INNER } from "./ppStyles";

/**
 * "Sex problems are common. Talking about them isn't." (board "Stats"): four numbers in
 * outlined cards, four across at 1440 and one column on a phone. Where they come from is in
 * painPointContent.ts (no sources line on the page since v2).
 */
const PStats: FC = () => (
  <section data-landing-section="stats" className="px-4 py-16 lg:px-6 lg:py-24">
    <div className={`${PP_INNER} flex flex-col gap-10`}>
      <div className="flex max-w-[760px] flex-col gap-4">
        <h2 className={`${PP_H2} max-w-[760px]`}>{STATS.title}</h2>
      </div>
      <div className="flex flex-col gap-[14px]">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-5 lg:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
          {STATS.cards.map((card) => (
            <div
              key={card.value}
              data-stat
              className="flex flex-col gap-3 rounded-[20px] border border-solid border-[#e9e6ee] p-7"
            >
              <span
                className={`font-serif text-[40px] font-semibold leading-none lg:text-[48px] ${PP_ACCENT}`}
              >
                {card.value}
              </span>
              <p className="m-0 text-[15px] leading-6 text-[#3f3a4d]">{card.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);

export default PStats;
