import type { FC } from "react";
import { STATS } from "./painPointContent";
import { PP_ACCENT, PP_H2, PP_INNER } from "./ppStyles";

/**
 * "Sex problems are common. Talking about them isn't." (board "Stats"): four numbers in
 * outlined cards, four across at 1440 and one column on a phone. The board names no source;
 * the line under the cards does (Fatih, 14 Nov): 47% is LoveHoney's, as on the video page,
 * and 56%, 42% and 77% are LoveIQ State of Desire 2026's agreement shares.
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
        <p className="m-0 text-[10px] leading-[15px] text-[#6f6a7a]">{STATS.sources}</p>
      </div>
    </div>
  </section>
);

export default PStats;
