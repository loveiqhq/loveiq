import type { FC } from "react";
import Image from "next/image";
import {
  PTS_FIND_OUT,
  PTS_HOW_IT_WORKS,
  PTS_INSIDE,
  PTS_PERSONALITIES,
  PTS_RESEARCH,
  PTS_TESTIMONIALS,
  type PtsOfferCopy,
} from "./payToStartContent";
import { Stars } from "./ptsIcons";
import {
  PTS_CARD,
  PTS_H2,
  PTS_LEAD,
  PTS_NUMBER,
  PTS_REVEAL,
  PTS_SECTION,
  ptsRevealItem,
} from "./ptsStyles";

/**
 * The left column's content sections, top to bottom as Figma 1706:1712 stacks them. Each
 * starts 56 above its heading and has no bottom padding: the next one's top is the gap.
 * The anchors (#inside-your-report, #personalities, #reviews) are the search ad's
 * sitelinks (Figma 1706:1627). Headings, leads and items fly in as they scroll into view
 * (PTS_REVEAL, ptsStyles.ts).
 */

/** 1706:1722: five numbered cards, three to a row on a desktop. */
export const PtsFindOut: FC = () => (
  <section aria-labelledby="pts-find-out" className={PTS_SECTION}>
    <h2 id="pts-find-out" className={`${PTS_H2} ${PTS_REVEAL}`}>
      {PTS_FIND_OUT.title}
    </h2>
    <p className={`${PTS_LEAD} ${PTS_REVEAL} stagger-1`}>{PTS_FIND_OUT.lead}</p>
    <ul className="mt-[26px] grid gap-[14px] sm:grid-cols-2 lg:grid-cols-3">
      {PTS_FIND_OUT.cards.map((card, i) => (
        <li key={card.number} className={`${PTS_CARD} p-6 ${ptsRevealItem(i, 3)}`}>
          <p aria-hidden className={PTS_NUMBER}>
            {card.number}
          </p>
          <h3 className="mt-2 font-serif text-[20px] font-semibold leading-[25.6px] text-[#161021]">
            {card.title}
          </h3>
          <p className="mt-1.5 font-sans text-[15px] leading-[23px] text-[#3f3a4d]">{card.body}</p>
        </li>
      ))}
    </ul>
  </section>
);

/**
 * 1706:1746: the six chapters beside a sample page. The sample shows real report copy for
 * one archetype on purpose: it is the page's marketing, not a paid page leaking. The lead
 * is the offer's (PtsOfferCopy).
 */
export const PtsInsideReport: FC<{ lead: string }> = ({ lead }) => (
  <section id="inside-your-report" aria-labelledby="pts-inside" className={PTS_SECTION}>
    <h2 id="pts-inside" className={`${PTS_H2} ${PTS_REVEAL}`}>
      {PTS_INSIDE.title}
    </h2>
    <p className={`${PTS_LEAD} ${PTS_REVEAL} stagger-1`}>{lead}</p>
    <div className="mt-[26px] grid gap-4 md:grid-cols-[366fr_468fr]">
      <ol className="border-t border-[#e9e6ee]">
        {PTS_INSIDE.chapters.map((chapter, i) => (
          <li
            key={chapter.number}
            className={`flex gap-3 border-b border-[#e9e6ee] pb-[15px] pl-1 pt-[14px] ${ptsRevealItem(i, 3)}`}
          >
            <span aria-hidden className={`${PTS_NUMBER} w-7 shrink-0 tracking-normal`}>
              {chapter.number}
            </span>
            <div>
              <h3 className="font-sans text-[15px] font-bold leading-[20.5px] text-[#161021]">
                {chapter.title}
              </h3>
              {/* 310 at most, as both frames set it, so the lines break where Figma's do. */}
              <p className="mt-[3.5px] max-w-[310px] font-sans text-[13.5px] leading-[20px] text-[#6b6678]">
                {chapter.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <figure
        className={`rounded-[24px] bg-[#fff7f2] p-6 shadow-[0_20px_50px_-30px_rgba(254,104,57,0.55)] ${PTS_REVEAL} stagger-2`}
      >
        <p className="font-sans text-[11px] font-bold leading-[15px] tracking-[0.9px] text-[#c2410c]">
          {PTS_INSIDE.sample.label}
        </p>
        <p className="mt-1 font-serif text-[22px] font-semibold leading-[28px] text-[#161021]">
          {PTS_INSIDE.sample.title}
        </p>
        <ul className="mt-4 space-y-2.5">
          {PTS_INSIDE.sample.beliefs.map((belief) => (
            <li key={belief.from} className="rounded-2xl bg-white px-4 py-3.5">
              <p className="font-serif text-[15.5px] italic leading-[23px] text-[#6b4a3a]">
                {belief.from}
              </p>
              <p className="mt-2 font-sans text-[10.5px] font-bold leading-[14.3px] tracking-[1.1px] text-[#561dbd]">
                {PTS_INSIDE.sample.shiftLabel}
              </p>
              <p className="mt-0.5 font-serif text-[15.5px] italic leading-[23px] text-[#161021]">
                {belief.to}
              </p>
            </li>
          ))}
        </ul>
        <figcaption className="mt-3.5 font-sans text-[13px] leading-[19px] text-[#6b6678]">
          {PTS_INSIDE.sample.caption}
        </figcaption>
      </figure>
    </div>
  </section>
);

/** 1706:1790: the fourteen archetypes, each with Figma's dot colour and motto. */
export const PtsPersonalities: FC = () => (
  <section id="personalities" aria-labelledby="pts-personalities" className={PTS_SECTION}>
    <h2 id="pts-personalities" className={`${PTS_H2} ${PTS_REVEAL}`}>
      {PTS_PERSONALITIES.title}
    </h2>
    <p className={`${PTS_LEAD} ${PTS_REVEAL} stagger-1`}>{PTS_PERSONALITIES.lead}</p>
    <ul className="mt-[26px] grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      {PTS_PERSONALITIES.archetypes.map((archetype, i) => (
        <li
          key={archetype.name}
          className={`rounded-2xl border border-[#e9e6ee] bg-white px-4 py-3.5 ${ptsRevealItem(i, 4)}`}
        >
          <span
            aria-hidden
            className="block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: archetype.color }}
          />
          <h3 className="mt-2 font-serif text-[16px] font-semibold leading-[20.48px] text-[#161021]">
            {archetype.name}
          </h3>
          <p className="mt-1 font-serif text-[13.5px] italic leading-[19px] text-[#6b6678]">
            {archetype.motto}
          </p>
        </li>
      ))}
    </ul>
  </section>
);

/** 1706:1850: three steps under hairlines, in the offer's words (PtsOfferCopy). */
export const PtsHowItWorks: FC<{ price: string; steps: PtsOfferCopy["steps"] }> = ({
  price,
  steps,
}) => (
  <section aria-labelledby="pts-how" className={PTS_SECTION}>
    <h2 id="pts-how" className={`${PTS_H2} ${PTS_REVEAL}`}>
      {PTS_HOW_IT_WORKS.title}
    </h2>
    <ol className="mt-[26px] grid gap-5 md:grid-cols-3 md:gap-8">
      {steps.map((step, i) => (
        <li key={step.number} className={`border-t border-[#e9e6ee] pt-4 ${ptsRevealItem(i, 3)}`}>
          <p aria-hidden className={PTS_NUMBER}>
            {step.number}
          </p>
          <h3 className="mt-[5.5px] font-serif text-[20px] font-semibold leading-[25.6px] text-[#161021]">
            {step.title}
          </h3>
          <p className="mt-[5.5px] font-sans text-[14.5px] leading-[22px] text-[#6b6678]">
            {step.body(price)}
          </p>
        </li>
      ))}
    </ol>
  </section>
);

/** The rating, as the hero and the reviews head print it. */
const RatingLine: FC<{ label: string; className?: string }> = ({ label, className = "" }) => (
  <p
    className={`inline-flex items-center font-sans text-[14px] leading-[19.12px] text-[#3f3a4d] ${className}`}
  >
    <Stars size={14} spacing={2} className="mr-2" />
    <span>
      <strong className="font-bold text-[#161021]">{PTS_TESTIMONIALS.ratingValue}</strong>
      {label}
    </span>
  </p>
);

/** 1706:1865: four quotes; the rating sits right of the heading, under it on a phone. */
export const PtsTestimonials: FC = () => (
  <section id="reviews" aria-labelledby="pts-reviews" className={PTS_SECTION}>
    <div
      className={`flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6 ${PTS_REVEAL}`}
    >
      <h2 id="pts-reviews" className={PTS_H2}>
        {PTS_TESTIMONIALS.title}
      </h2>
      <RatingLine label={PTS_TESTIMONIALS.ratingLabel} className="shrink-0" />
    </div>
    <ul className="mt-[18px] grid gap-[14px] sm:grid-cols-2 lg:grid-cols-3">
      {PTS_TESTIMONIALS.quotes.map((item, i) => (
        <li key={item.name} className={`${PTS_CARD} flex flex-col p-6 ${ptsRevealItem(i, 3)}`}>
          <Stars size={14} spacing={2} />
          <blockquote className="mt-3.5 font-sans text-[15px] leading-6 text-[#3f3a4d]">
            <p>{item.quote}</p>
          </blockquote>
          <div className="mt-auto flex items-center gap-3 pt-3.5">
            <Image
              src={item.avatar}
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
            <div>
              <p className="font-sans text-[14.5px] font-bold leading-[19.8px] text-[#161021]">
                {item.name}
              </p>
              <p className="mt-[3px] font-sans text-[12.5px] leading-[17.1px] text-[#6b6678]">
                {item.role}
              </p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  </section>
);

/** 1706:1893: three numbers, then the two advisors. */
export const PtsResearch: FC = () => (
  <section aria-labelledby="pts-research" className={PTS_SECTION}>
    <h2 id="pts-research" className={`${PTS_H2} ${PTS_REVEAL}`}>
      {PTS_RESEARCH.title}
    </h2>
    <p className={`${PTS_LEAD} ${PTS_REVEAL} stagger-1`}>{PTS_RESEARCH.lead}</p>
    <ul className="mt-[26px] grid gap-[14px] md:grid-cols-3">
      {PTS_RESEARCH.stats.map((stat, i) => (
        <li key={stat.label} className={`${PTS_CARD} p-6 ${ptsRevealItem(i, 3)}`}>
          <p className="font-serif text-[28px] font-medium leading-[35.84px] text-[#561dbd]">
            {stat.value}
          </p>
          <p className="mt-1.5 font-sans text-[14px] font-bold leading-[19.12px] text-[#161021]">
            {stat.label}
          </p>
          <p className="mt-0.5 font-sans text-[13px] leading-[19px] text-[#6b6678]">{stat.body}</p>
        </li>
      ))}
    </ul>
    <ul className="mt-4 grid gap-4 md:grid-cols-2">
      {PTS_RESEARCH.experts.map((expert, i) => (
        <li key={expert.name} className={`rounded-[20px] bg-[#faf7ff] p-6 ${ptsRevealItem(i, 2)}`}>
          <blockquote className="font-serif text-[18px] leading-[27px] text-[#161021]">
            <p>{expert.quote}</p>
          </blockquote>
          {/* 16 under the quote, as drawn: not pinned to the card's foot like the reviews. */}
          <div className="mt-4 flex items-center gap-3">
            <Image
              src={expert.photo}
              alt=""
              width={48}
              height={48}
              className="h-12 w-12 shrink-0 rounded-full object-cover"
            />
            <div>
              <p className="font-sans text-[15px] font-bold leading-[20.5px] text-[#161021]">
                {expert.name}
              </p>
              <p className="mt-[3.5px] font-sans text-[13px] leading-[17.76px] text-[#6b6678]">
                {expert.role}
              </p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  </section>
);
