import type { FC } from "react";
import Link from "next/link";
import WHeroVideo from "../white/WHeroVideo";
import PHeroQuestion from "./PHeroQuestion";
import PLiveTakers from "./PLiveTakers";
import { PP_FOCUS } from "./ppStyles";
import { HERO, QUESTION_1, QUESTION_C } from "./painPointContent";

/**
 * Which hero: `b`, the page as released (round 4's B, `pain_point`, paused on 24 Nov 2026),
 * or `c`, version C (`pain_point_c`), with Q10003 under the film.
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

const Privacy: FC = () => (
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
);

/**
 * B's hero (board "Hero 3 · inline question + film poster"): the headline, question 1 with
 * its button, the live line and the privacy line on the left; the film card on the right,
 * under them on a phone.
 *
 * The board's box is content-sized (1180 wide plus 24px sides) and its desktop content box
 * is fixed at 545px, which the column overflows by about 40px into the 80px foot. The same
 * picture comes from a 37.5px foot here, without a fixed height that narrower desktops would
 * overflow into the next section.
 */
const HeroB: FC = () => (
  <section
    data-testid="pp-hero"
    data-landing-time="hero"
    className="mx-auto flex max-w-[1212px] flex-wrap items-center gap-8 px-4 pb-14 pt-10 lg:max-w-[1228px] lg:gap-14 lg:px-6 lg:pb-[37.5px] lg:pt-[72px]"
  >
    <div className="flex min-w-0 flex-[1_1_min(100%,480px)] flex-col gap-6">
      <Title />
      <Intro />
      <div className="flex flex-col items-start gap-5">
        <PHeroQuestion question={QUESTION_1} />
        <PLiveTakers />
        <Privacy />
      </div>
    </div>
    <div className="mx-auto flex min-w-0 max-w-[480px] flex-[1_1_min(100%,400px)] flex-col gap-5">
      <WHeroVideo skin="film" />
    </div>
  </section>
);

/**
 * Version C's hero (LoveIQ Sync 24 Nov 2026): B's hero with the question moved under the
 * film, to give the headline room (Marcus; Mark and Hana agreed), and asking Q10003.
 *
 * One grid, in reading order: the headline and intro, then the film with the question under
 * it, then the live line and the privacy line. A phone stacks the three in that order. From
 * lg the film and its question are the right column, spanning both rows, and the left column
 * keeps the headline over the two lines, the pair centred against the film's column, as B's
 * columns are: the column's extra height goes to both rows alike, so ending the first block
 * at its row's foot and starting the second at its row's top centres them as one.
 * Spacing as B's: 24px from the intro to the lines (B's intro to its question), 20px from
 * the question to the lines on a phone (B's question to its lines), 24px from the film to
 * the question, and 28px from the intro to the film on a phone, as the video page's phone
 * hero spaces its film.
 */
const HeroC: FC = () => (
  <section
    data-testid="pp-hero"
    data-landing-time="hero"
    data-hero-version="c"
    className="mx-auto grid max-w-[1212px] grid-cols-1 gap-y-5 px-4 pb-14 pt-10 lg:max-w-[1228px] lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] lg:gap-x-14 lg:gap-y-6 lg:px-6 lg:pb-[37.5px] lg:pt-[72px]"
  >
    <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1 lg:self-end">
      <Title />
      <Intro />
    </div>
    <div
      data-testid="pp-hero-media"
      className="mx-auto mt-2 flex w-full min-w-0 max-w-[480px] flex-col gap-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:self-center"
    >
      <WHeroVideo skin="film" />
      <PHeroQuestion question={QUESTION_C} divided={false} />
    </div>
    <div className="flex min-w-0 flex-col items-start gap-5 lg:col-start-1 lg:row-start-2 lg:self-start">
      <PLiveTakers />
      <Privacy />
    </div>
  </section>
);

const PHero: FC<{ version?: PHeroVersion }> = ({ version = "b" }) =>
  version === "c" ? <HeroC /> : <HeroB />;

export default PHero;
