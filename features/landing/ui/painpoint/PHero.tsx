import type { FC } from "react";
import Link from "next/link";
import WHeroVideo from "../white/WHeroVideo";
import PHeroQuestion from "./PHeroQuestion";
import PLiveTakers from "./PLiveTakers";
import { PP_FOCUS } from "./ppStyles";
import { HERO } from "./painPointContent";

/**
 * The hero (board "Hero 3 · inline question + film poster"): the headline, question 1 with
 * its button, the live line and the privacy line on the left; the film card on the right,
 * under them on a phone.
 *
 * The board's box is content-sized (1180 wide plus 24px sides) and its desktop content box
 * is fixed at 545px, which the column overflows by about 40px into the 80px foot. The same
 * picture comes from a 37.5px foot here, without a fixed height that narrower desktops would
 * overflow into the next section.
 */
const PHero: FC = () => (
  <section
    data-testid="pp-hero"
    data-landing-time="hero"
    className="mx-auto flex max-w-[1212px] flex-wrap items-center gap-8 px-4 pb-14 pt-10 lg:max-w-[1228px] lg:gap-14 lg:px-6 lg:pb-[37.5px] lg:pt-[72px]"
  >
    <div className="flex min-w-0 flex-[1_1_min(100%,480px)] flex-col gap-6">
      <h1 className="m-0 font-serif text-[38px] font-semibold leading-[1.15] tracking-[-0.01em] text-[#161021] [text-wrap:balance] lg:text-[58px] lg:leading-[1.12]">
        {HERO.titleLead}
        <span className="bg-[linear-gradient(135deg,#fe6839_0%,#bf66d9_43%,#958ef6_100%)] bg-clip-text text-transparent">
          {HERO.titleAccent}
        </span>
      </h1>
      <p className="m-0 max-w-[540px] text-[16px] leading-[26px] text-[#3f3a4d] lg:text-[18px] lg:leading-[29px]">
        <span className="text-[16px] text-[#5f6675]">
          {HERO.introGrounded}
          {/* A phone keeps "research. In" together, as the phone board's &nbsp; does. */}
          <span className="lg:hidden">{" "}</span>
        </span>
        <br className="hidden lg:inline" />
        <span className="text-[16px] font-extrabold text-black">{HERO.introTime}</span>
        <span className="text-[16px] text-[#5f6675]">{HERO.introRest}</span>
      </p>
      <div className="flex flex-col items-start gap-5">
        <PHeroQuestion />
        <PLiveTakers />
        <p className="m-0 text-center text-[15px] font-light leading-[23px] text-[#161021] lg:text-left lg:text-[18px] lg:leading-[28px]">
          {HERO.privacyLead}
          <strong className="font-bold">{HERO.privacyStrong}</strong>
          {HERO.privacyTail}
          <Link
            href="/trust-zone"
            className={`inline-flex items-center gap-1.5 font-semibold text-[#c2410c] no-underline ${PP_FOCUS}`}
          >
            <svg
              aria-hidden
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
            {HERO.privacyLink}
          </Link>
        </p>
      </div>
    </div>
    <div className="mx-auto flex min-w-0 max-w-[480px] flex-[1_1_min(100%,400px)] flex-col gap-5">
      <WHeroVideo skin="film" />
    </div>
  </section>
);

export default PHero;
