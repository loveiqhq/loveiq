import type { FC } from "react";
import Link from "next/link";
import WHeroVideo from "../white/WHeroVideo";
import PHeroQuestion from "./PHeroQuestion";
import PLiveTakers from "./PLiveTakers";
import { PP_FOCUS } from "./ppStyles";
import { HERO, QUESTION_1, QUESTION_C } from "./painPointContent";

/**
 * Which hero: `b`, the page as released (round 4's B, `pain_point`, paused on 24 Nov 2026),
 * or `c`, version C (`pain_point_c`), asking Q10003, with the privacy line under the film.
 */
export type PHeroVersion = "b" | "c";

const Title: FC = () => (
  <h1 className="m-0 font-serif text-[38px] font-semibold leading-[1.15] tracking-[-0.01em] text-[#161021] [text-wrap:balance] lg:text-[58px] lg:leading-[1.12]">
    {HERO.titleLead}
    <span className="bg-[linear-gradient(135deg,#fe6839_0%,#bf66d9_43%,#958ef6_100%)] bg-clip-text text-transparent">
      {HERO.titleAccent}
    </span>
  </h1>
);

const Intro: FC = () => (
  <p className="m-0 max-w-[540px] text-[16px] leading-[26px] text-[#3f3a4d] lg:text-[18px] lg:leading-[29px]">
    <span className="text-[16px] text-[#5f6675]">
      {HERO.introGrounded}
      {/* A phone keeps "research. In" together, as the phone board's &nbsp; does. */}
      <span className="lg:hidden"> </span>
    </span>
    <br className="hidden lg:inline" />
    <span className="text-[16px] font-extrabold text-black">{HERO.introTime}</span>
    <span className="text-[16px] text-[#5f6675]">{HERO.introRest}</span>
  </p>
);

/**
 * `balanced`: version C's line under the film, where it wraps: two even lines ("...come
 * first." / "Learn more in our > Trust Center") rather than the link alone on the second.
 */
const Privacy: FC<{ balanced?: boolean }> = ({ balanced = false }) => (
  <p
    className={`m-0 text-center text-[15px] font-light leading-[23px] text-[#161021] lg:text-left lg:text-[18px] lg:leading-[28px]${balanced ? " [text-wrap:balance]" : ""}`}
  >
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
);

/**
 * The hero (board "Hero 3 · inline question + film poster"): the headline, the question with
 * its button, the live line and the privacy line on the left; the film card on the right,
 * under them on a phone.
 *
 * Version C (LoveIQ Sync 24 Nov 2026) asks Q10003 where B asks Q01002, and moves the privacy
 * line under the film (Marcus, 24 Nov: the question stays on the left, the privacy line swaps
 * over), so a phone reads the headline, the question, the live line, the film, then the
 * privacy line. B renders as released.
 *
 * The board's box is content-sized (1180 wide plus 24px sides) and its desktop content box
 * is fixed at 545px, which the column overflows by about 40px into the 80px foot. The same
 * picture comes from a 37.5px foot here, without a fixed height that narrower desktops would
 * overflow into the next section.
 */
const PHero: FC<{ version?: PHeroVersion }> = ({ version = "b" }) => {
  const c = version === "c";
  return (
    <section
      data-testid="pp-hero"
      data-landing-time="hero"
      data-hero-version={c ? "c" : undefined}
      className="mx-auto flex max-w-[1212px] flex-wrap items-center gap-8 px-4 pb-14 pt-10 lg:max-w-[1228px] lg:gap-14 lg:px-6 lg:pb-[37.5px] lg:pt-[72px]"
    >
      <div className="flex min-w-0 flex-[1_1_min(100%,480px)] flex-col gap-6">
        <Title />
        <Intro />
        <div className="flex flex-col items-start gap-5">
          <PHeroQuestion question={c ? QUESTION_C : QUESTION_1} />
          <PLiveTakers />
          {!c && <Privacy />}
        </div>
      </div>
      <div
        data-testid={c ? "pp-hero-media" : undefined}
        className="mx-auto flex min-w-0 max-w-[480px] flex-[1_1_min(100%,400px)] flex-col gap-5"
      >
        <WHeroVideo skin="film" />
        {c && <Privacy balanced />}
      </div>
    </section>
  );
};

export default PHero;
