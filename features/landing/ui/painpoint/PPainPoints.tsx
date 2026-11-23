import type { FC } from "react";
import PCta from "./PCta";
import PPainPointArrows from "./PPainPointArrows";
import PPainPointDots from "./PPainPointDots";
import { HERO, PAIN_POINTS } from "./painPointContent";
import { PP_ACCENT, PP_CARD, PP_FOCUS, PP_H2, PP_INNER } from "./ppStyles";

/** The row's id, which the buttons and the dots follow. */
const TRACK_ID = "pp-pain-track";

/**
 * Six patterns in people's own words, each with what the report gives them (board "Pain
 * points"), on the pale grey band. Since v2 a carousel (Mark, 12 Nov: "use a carousel for
 * example and make each card more engaging through design"): one row, three cards in view from
 * lg with two buttons that step it, two from sm, and on a phone one card and the edge of the
 * next, with dots that follow the swipe. The row is a plain list that scrolls sideways, so it
 * works with a swipe, a trackpad and, once focused, the arrow keys, with or without
 * JavaScript. It clips vertically: a card's lift and shadow have room in its padding.
 */
const PPainPoints: FC = () => (
  <section
    data-landing-section="pain_points"
    className="bg-[#f5f6f8] px-4 py-16 lg:px-6 lg:py-[88px]"
  >
    <div className={`${PP_INNER} flex flex-col gap-10`}>
      <div className="flex items-end justify-between gap-6">
        <h2 className={`${PP_H2} max-w-[720px]`}>
          {PAIN_POINTS.titleLead}
          <span className={PP_ACCENT}>{PAIN_POINTS.titleAccent}</span>
          {PAIN_POINTS.titleTail}
        </h2>
        <PPainPointArrows trackId={TRACK_ID} />
      </div>
      <div className="flex flex-col gap-3">
        <ol
          id={TRACK_ID}
          aria-label="Six patterns"
          // A phone swipes the row; a keyboard scrolls it once it is focused.
          tabIndex={0}
          className={`-mx-4 my-0 flex list-none snap-x snap-mandatory scroll-pl-4 gap-5 overflow-x-auto overflow-y-hidden px-4 pb-6 pt-2 [scrollbar-width:none] lg:mx-0 lg:scroll-pl-0 lg:px-0 [&::-webkit-scrollbar]:hidden ${PP_FOCUS}`}
        >
          {PAIN_POINTS.cards.map((card) => (
            <li
              key={card.quote}
              className={`${PP_CARD} flex flex-[0_0_84%] snap-start flex-col gap-[18px] p-7 sm:flex-[0_0_calc((100%-20px)/2)] lg:flex-[0_0_calc((100%-40px)/3)]`}
            >
              <p className="m-0 font-serif text-[19px] font-semibold italic leading-[28px] text-[#161021] lg:text-[21px] lg:leading-[30px]">
                {card.quote}
              </p>
              <p className="m-0 mt-auto border-t border-solid border-[#e9e6ee] pt-4 text-[15px] leading-6 text-[#3f3a4d]">
                <strong className="font-bold text-[#161021]">{card.lead}</strong>
                {card.rest}
              </p>
            </li>
          ))}
        </ol>
        <PPainPointDots trackId={TRACK_ID} count={PAIN_POINTS.cards.length} />
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
