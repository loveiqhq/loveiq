import type { FC } from "react";
import Image from "next/image";
import PCta from "./PCta";
import { HERO, WORDS } from "./painPointContent";
import { PP_H2, PP_INNER } from "./ppStyles";

/** A page of today's report UI (the unlocked preview, captured 15 Nov at the board's
 *  composition: Spark Seeker's constellation, core archetype card and summary); 1344 × 2216.
 *  Not the board's own screenshot, which showed a 7-day guarantee and FREE badges. Named by its
 *  content's hash: images are cached for a year. */
export const REPORT_PREVIEW_SRC = "/images/painpoint/report-preview.4c05cfc1.jpg";

/**
 * "Sentences you can actually say." (board "The words"): the report's plain words for what
 * people feel, six of its terms as chips, the button, and a look inside a real report in a
 * browser frame that slowly scrolls the page (still under reduced motion, paused under a
 * mouse). On the lilac band; the frame sits under the words on a phone. The frame and its
 * bar are content-sized boxes, as on the board: their 1px rules add to their heights.
 */
const PWords: FC = () => (
  <section
    id="words"
    data-landing-section="words"
    className="bg-[#f3ecff] px-4 py-16 lg:px-6 lg:py-24"
  >
    <div className={`${PP_INNER} flex flex-wrap items-start gap-8 lg:gap-14`}>
      <div className="flex min-w-0 flex-[1_1_min(100%,440px)] flex-col gap-6">
        <h2 className={PP_H2}>{WORDS.title}</h2>
        <p className="m-0 text-[16px] leading-[26px] text-[#3f3a4d] lg:text-[18px] lg:leading-[29px]">
          {WORDS.body}
        </p>
        <div className="flex flex-wrap gap-[10px]">
          {WORDS.chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-solid border-[#e9e6ee] bg-white px-4 py-2 font-serif text-[15px] italic text-[#161021]"
            >
              {chip}
            </span>
          ))}
        </div>
        <PCta label={HERO.ctaStart} place="words" location="words" className="self-start" />
      </div>
      <div className="flex min-w-0 flex-[1_1_min(100%,440px)] flex-col gap-[14px]">
        <div className="pp-fly-wrap relative box-content h-[380px] overflow-hidden rounded-[22px] border border-solid border-[#e9e6ee] bg-white shadow-[0_22px_54px_-20px_rgba(103,60,120,0.3)] lg:h-[460px]">
          <div
            aria-hidden
            className="box-content flex h-[34px] items-center gap-1.5 border-b border-solid border-[#e9e6ee] bg-[#f5f6f8] px-[14px]"
          >
            <span className="h-[9px] w-[9px] rounded-full bg-[#e0dce6]" />
            <span className="h-[9px] w-[9px] rounded-full bg-[#e0dce6]" />
            <span className="h-[9px] w-[9px] rounded-full bg-[#e0dce6]" />
            <span className="ml-[10px] text-[11px] text-[#6b6678]">{WORDS.frameUrl}</span>
          </div>
          <div className="absolute inset-x-0 bottom-0 top-[34px] overflow-hidden">
            <Image
              src={REPORT_PREVIEW_SRC}
              alt={WORDS.imageAlt}
              width={1344}
              height={2216}
              sizes="(min-width: 1024px) 560px, 92vw"
              className="pp-fly block h-auto w-full [--fly-h:346px] lg:[--fly-h:426px]"
            />
          </div>
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-[72px] bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,#ffffff_100%)]"
          />
        </div>
        <p className="m-0 text-center text-[13px] leading-5 text-[#6b6678]">{WORDS.caption}</p>
      </div>
    </div>
  </section>
);

export default PWords;
