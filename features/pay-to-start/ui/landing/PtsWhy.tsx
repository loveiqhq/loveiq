import type { FC } from "react";
import { WHY_UNLOCK_CARDS } from "@features/report/logic/whyUnlockCards";
import { PTS_SECTION, PTS_REVEAL, ptsRevealItem } from "./ptsStyles";

const PICKER_GRADIENT_TEXT =
  "bg-[linear-gradient(103deg,#ff6a3a_0%,#cf5afb_52%,#7d88ff_100%)] bg-clip-text italic text-transparent [-webkit-text-fill-color:transparent]";

/**
 * Landing V2's "Why unlock your report?" (Mark, final 30.10): the plan picker's four cards, two
 * to a row from `md`, their words shared with it (WHY_UNLOCK_CARDS), the chapters counted.
 */
export const PtsWhy: FC = () => (
  <section aria-labelledby="pts-why" className={PTS_SECTION}>
    <h2
      id="pts-why"
      className={`m-0 text-center font-serif text-[38px] font-normal leading-[44px] tracking-[-0.01em] text-[#161021] ${PTS_REVEAL}`}
    >
      Why unlock your <em className={PICKER_GRADIENT_TEXT}>report</em>?
    </h2>
    <div className="mt-10 grid gap-4 md:grid-cols-2">
      {WHY_UNLOCK_CARDS.map((card, i) => (
        <article
          key={card.emph}
          className={`flex flex-col gap-2 rounded-2xl border border-[rgba(22,16,33,0.09)] bg-white p-5 shadow-[0_4px_4px_rgba(22,16,33,0.04)] ${ptsRevealItem(i, 2)}`}
        >
          <h3 className="m-0 font-serif text-[20px] font-semibold leading-[1.28] text-[#17121f]">
            {card.green ? <span className="font-bold text-[#00892f]">{card.green} </span> : null}
            {card.lead}
            <em className={`${PICKER_GRADIENT_TEXT} font-medium`}>{card.emph}</em>
            {card.tail}
          </h3>
          <p className="m-0 font-sans text-[14px] leading-5 text-[#4b5563]">{card.body}</p>
        </article>
      ))}
    </div>
  </section>
);
