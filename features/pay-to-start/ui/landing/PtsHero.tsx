import type { FC } from "react";
import { PTS_HERO } from "./payToStartContent";
import { Stars } from "./ptsIcons";
import { PtsHeroMedia } from "./PtsHeroMedia";

/**
 * The top of the left column (Figma 1706:1713-1720, phone 1706:2050-2057): the question as the
 * page's title, the lead, the ratings line and the film. Landing V2 (Mark, 30.10) took the
 * "Applied Psychometrics original" badge off.
 *
 * It flies in on load in the landing hero's rhythm (`animate-on-load`, which starts from a
 * visible floor so the largest paint is not held back), never on scroll: it is in view
 * from the first paint.
 */
export const PtsHero: FC = () => (
  <div>
    <h1 className="animate-on-load stagger-1 font-serif text-[36px] font-semibold leading-[41.4px] tracking-[-0.4px] text-[#161021] sm:text-[58px] sm:leading-[65px] sm:tracking-[-0.6px]">
      {PTS_HERO.title}
    </h1>
    <p className="animate-on-load stagger-2 mt-3 font-serif text-[20px] font-normal leading-[30px] text-[#3f3a4d]">
      {PTS_HERO.lead}
    </p>
    <ul className="animate-on-load stagger-3 mt-[18px] flex flex-wrap items-center gap-x-[14px] gap-y-2 font-sans text-[14px] leading-[19.12px] text-[#3f3a4d]">
      <li className="inline-flex items-center">
        <Stars size={14} spacing={2} className="mr-2" />
        <span>
          <strong className="font-bold text-[#161021]">{PTS_HERO.ratingValue}</strong>
          {PTS_HERO.ratingLabel}
        </span>
      </li>
      <li>{PTS_HERO.takers}</li>
      <li>{PTS_HERO.length}</li>
    </ul>
    <div className="animate-on-load stagger-2 mt-8">
      <PtsHeroMedia />
    </div>
  </div>
);
