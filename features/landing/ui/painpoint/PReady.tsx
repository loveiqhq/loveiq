import type { FC } from "react";
import PCta from "./PCta";
import { HERO, READY } from "./painPointContent";
import { PP_REUSED_SHELL } from "./ppStyles";

/**
 * "Ready to better understand yourself?" (board "READY (production)"): the video page's
 * closing heading and line (features/landing/ui/white/WCTA.tsx) without its question card,
 * and the page's gradient button instead of the black one. Sizes are WCTA's, which the
 * board measured: 62.08px on a 1.15 line from 776px wide, 40px on a phone, fluid between.
 * The button counts as the footer CTA, as WCTA's does.
 */
const PReady: FC = () => (
  <section
    id="ready"
    aria-labelledby="pp-ready-heading"
    data-landing-section="closing_cta"
    className="bg-white py-16 lg:py-[70px]"
  >
    <div className={`${PP_REUSED_SHELL} flex flex-col items-center`}>
      <h2
        id="pp-ready-heading"
        className="m-0 text-center font-serif text-[clamp(2.5rem,8vw,3.88rem)] font-normal leading-[1.15] text-[#161021]"
      >
        {READY.titleLead}
        <br />
        <span className="bg-gradient-to-r from-[#fe6839] from-[29%] via-[#bf66d9] via-[70%] to-[#958ef6] bg-clip-text text-transparent">
          {READY.titleAccent}
        </span>
      </h2>
      <PCta label={HERO.ctaStart} place="closing CTA" location="footer" className="mt-9" />
      <p className="m-0 mt-8 text-center text-[15px] font-bold leading-[22.5px] text-[#6f6a7a] sm:text-[16px] sm:leading-6">
        {READY.note}
      </p>
    </div>
  </section>
);

export default PReady;
