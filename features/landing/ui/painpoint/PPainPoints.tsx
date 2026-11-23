import type { FC } from "react";
import PCta from "./PCta";
import { HERO, PAIN_POINTS } from "./painPointContent";
import { PP_ACCENT, PP_CARD, PP_H2, PP_INNER } from "./ppStyles";

/**
 * Six patterns in people's own words, each with what the report gives them (board "Pain
 * points"), on the pale grey band. Three across at 1440, one column on a phone.
 */
const PPainPoints: FC = () => (
  <section
    data-landing-section="pain_points"
    className="bg-[#f5f6f8] px-4 py-16 lg:px-6 lg:py-[88px]"
  >
    <div className={`${PP_INNER} flex flex-col gap-10`}>
      <div className="flex max-w-[720px] flex-col gap-4">
        <h2 className={PP_H2}>
          {PAIN_POINTS.titleLead}
          <span className={PP_ACCENT}>{PAIN_POINTS.titleAccent}</span>
          {PAIN_POINTS.titleTail}
        </h2>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-5 lg:grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
        {PAIN_POINTS.cards.map((card) => (
          <div key={card.quote} className={`${PP_CARD} flex flex-col gap-[18px] p-7`}>
            <p className="m-0 font-serif text-[19px] font-semibold italic leading-[28px] text-[#161021] lg:text-[21px] lg:leading-[30px]">
              {card.quote}
            </p>
            <p className="m-0 border-t border-solid border-[#e9e6ee] pt-4 text-[15px] leading-6 text-[#3f3a4d]">
              <strong className="font-bold text-[#161021]">{card.lead}</strong>
              {card.rest}
            </p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <PCta
          label={HERO.ctaStart}
          place="pain points"
          location="pain_points"
          className="self-start"
        />
      </div>
    </div>
  </section>
);

export default PPainPoints;
