import type { FC } from "react";
import { DiscoverHeading, DiscoverList } from "@features/landing/ui/white/WDiscover";
import { RING_ICON_INK, RING_ICON_STYLE } from "@features/landing/ui/ringIcon";
import { PTS_HOW_IT_WORKS, type PtsOfferCopy } from "./payToStartContent";
import { PTS_H2, PTS_REVEAL, PTS_SECTION } from "./ptsStyles";

/**
 * The left column's first two sections in Landing V2's order (Mark, final 30.10): How it works
 * under the hero, then what the report finds out. Each starts 56 above its heading and has no
 * bottom padding of its own unless drawn: the next one's top is the gap. Headings and items fly
 * in as they scroll into view (PTS_REVEAL, ptsStyles.ts).
 */

/**
 * Landing V2's How it works (Mark, final 30.10), right under the hero, in the offer's words
 * (PtsOfferCopy): on a desktop three columns, each number in a ring on one hairline; on a phone
 * a card, the rings down a rail. The rings pulse three times as the steps come into view
 * (payToStart.css; the sync's "pulsing icons"), never under reduced motion.
 */
export const PtsHowItWorks: FC<{ price: string; steps: PtsOfferCopy["steps"] }> = ({
  price,
  steps,
}) => (
  <section aria-labelledby="pts-how" className={`${PTS_SECTION} pb-14`}>
    <h2 id="pts-how" className={`${PTS_H2} ${PTS_REVEAL}`}>
      {PTS_HOW_IT_WORKS.title}
    </h2>
    <ol
      className={`pts-how-steps ${PTS_REVEAL} relative mt-5 rounded-[22px] border border-[#e9e6ee] bg-white px-[18px] pb-[22px] pt-5 md:mt-[26px] md:grid md:grid-cols-3 md:gap-8 md:rounded-none md:border-0 md:bg-transparent md:p-0`}
    >
      {/* The desktop's one hairline, through the rings' centres from the first to the last. */}
      <span
        aria-hidden
        className="absolute left-[22px] right-[calc((100%_-_64px)/3_-_22px)] top-[21px] hidden h-px bg-[#e7e2ee] md:block"
      />
      {steps.map((step, i) => (
        <li
          key={step.number}
          className={`relative flex gap-3.5 md:flex-col md:items-start md:gap-4 ${
            i < steps.length - 1 ? "pb-[22px] md:pb-0" : ""
          }`}
        >
          {/* The phone's rail, from under this ring to the next. */}
          {i < steps.length - 1 ? (
            <span
              aria-hidden
              className="absolute bottom-[-4px] left-[17.5px] top-[42px] w-px bg-[#e7e2ee] md:hidden"
            />
          ) : null}
          <span
            aria-hidden
            className="pts-ring-step relative inline-flex h-9 w-9 flex-none items-center justify-center rounded-full font-serif text-[17px] font-semibold shadow-[0_0_0_6px_#ffffff] md:h-11 md:w-11 md:text-[19px]"
            style={{ ...RING_ICON_STYLE, color: RING_ICON_INK }}
          >
            {step.number}
          </span>
          <div className="flex flex-col gap-[3px] pt-px md:gap-1 md:pt-0">
            <span className="font-sans text-[13px] font-semibold leading-[18px] text-[#6b5b95]">
              {step.eyebrow}
            </span>
            <h3 className="mt-1 font-serif text-[19px] font-medium leading-6 text-[#161021] md:mt-0 md:text-[22px] md:leading-[1.25]">
              {step.title}
            </h3>
            <p className="font-sans text-[14px] leading-[21px] text-[#3f3a4d] md:text-[15px] md:leading-[1.6]">
              {step.body(price)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  </section>
);

/**
 * Landing V2 (Mark, final 30.10): the home page's "In 15 minutes" findings in place of the five
 * numbered cards, its heading and list shared with the home page (WDiscover), ring icons and all.
 */
export const PtsFindOut: FC = () => (
  <section aria-labelledby="pts-find-out" className={PTS_SECTION}>
    <DiscoverHeading id="pts-find-out" />
    <DiscoverList />
  </section>
);
