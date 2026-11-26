import type { FC } from "react";
import CountUpOnView from "../CountUpOnView";
import PStatDots from "./PStatDots";
import { STATS } from "./painPointContent";
import { PP_H2, PP_INNER } from "./ppStyles";

/** The brand sweep as text, as on the video page's stat numbers (WWowStats). */
const STAT_NUMBER =
  "bg-gradient-to-r from-[#fe6839] via-[#bf66d9] to-[#958ef6] bg-clip-text text-transparent";

/**
 * "Sex problems are common. Talking about them isn't." (board "Stats"), in the video page's
 * stat cards since v2 (Mark, 12 Nov: "we had more engaging and more professionally looking
 * designs for stats on the current landing page"; features/landing/ui/white/WWowStats.tsx).
 * Each card draws its share as 100 dots with that many lit, and its number rolls up from 0 as
 * it comes into view (Hana's board). Four across from lg, two by two from sm, one column on a
 * phone. Where the numbers come from is noted in painPointContent.ts.
 */
const PStats: FC = () => (
  <section data-landing-section="stats" className="px-4 py-16 lg:px-6 lg:py-24">
    <div className={`${PP_INNER} flex flex-col items-center gap-10`}>
      <h2 className={`animate-on-scroll ${PP_H2} max-w-[760px] text-center`}>{STATS.title}</h2>
      <ul className="m-0 grid w-full list-none gap-[22px] p-0 sm:grid-cols-2 lg:grid-cols-4">
        {STATS.cards.map((card, i) => (
          <li
            key={card.share}
            data-stat
            className={`animate-on-scroll stagger-${i + 1} flex flex-col items-center rounded-[20px] border border-solid border-[#e9e6ee] bg-white px-6 pb-[26px] pt-[30px] shadow-[0_2px_5px_rgba(20,15,33,0.05)] transition duration-300 hover:shadow-[0_10px_28px_-14px_rgba(20,15,33,0.25)] motion-safe:hover:-translate-y-1`}
          >
            <div className="aspect-[282/110] w-full max-w-[282px]">
              <PStatDots lit={card.share} id={`pp-stat-dots-${i}`} />
            </div>
            <p className="m-0 mt-4 text-center font-serif text-[40px] font-semibold leading-none">
              <CountUpOnView value={card.share} suffix="%" index={i} className={STAT_NUMBER} />
            </p>
            <p
              data-stat-body
              className="m-0 mt-2 max-w-[282px] text-center text-[13px] font-semibold leading-[19px] text-[#5f6675]"
            >
              {card.body}
            </p>
          </li>
        ))}
      </ul>
    </div>
  </section>
);

export default PStats;
