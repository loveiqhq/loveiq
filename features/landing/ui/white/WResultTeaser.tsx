"use client";

import type { FC } from "react";
import Image from "next/image";
import Link from "next/link";
import { trackStartSurvey } from "@features/analytics/client";

/**
 * "Insights are waiting for you" (Figma node 8947:7606; the 12.10 copy, Figma
 * Report-3.0 1604:8233, dropped its "Your result" eyebrow and renamed it).
 * The mock is the designer's own report screenshot from the Figma node
 * (public/images/white/report-figma.png), under the same neutral vignette
 * and blur they used, so it teases without giving anything away.
 */

const WResultTeaser: FC = () => (
  <section className="bg-[#f5f4f8] py-16 lg:py-[92px]" aria-labelledby="w-result-heading">
    <div className="content-shell grid items-center gap-12 lg:grid-cols-2 lg:gap-14">
      {/* Left: pitch. The heading keeps its 14px top margin, as the frame does, and from
          xl stays on one line as drawn: it is 575px against the 572px column, so it reaches
          3px into the 56px gap rather than dropping "you" to a line of its own. */}
      <div className="flex flex-col">
        <h2
          id="w-result-heading"
          className="animate-on-scroll stagger-1 mt-3.5 font-serif text-[clamp(2rem,5.5vw,2.875rem)] font-medium leading-[1.18] tracking-[-0.01em] text-[#161021] xl:whitespace-nowrap"
        >
          Insights are{" "}
          <span className="bg-gradient-to-br from-[#fe6839] via-[#bf66d9] via-[43%] to-[#958ef6] bg-clip-text italic text-transparent">
            waiting for you
          </span>
        </h2>

        <p className="animate-on-scroll stagger-2 mt-3.5 max-w-[34rem] text-[16px] leading-[28px] text-[#5f6675]">
          The moment you finish, your personality and your full 50+ page report can be unlocked.
        </p>

        <div className="animate-on-scroll stagger-3 mt-6">
          <Link
            href="/survey"
            aria-label="Start test now - result section"
            onClick={() => trackStartSurvey("result_teaser")}
            className="focus-visible-ring group inline-flex items-center gap-2.5 rounded-full bg-gradient-to-br from-[#fe6839] via-[#bf66d9] via-[43%] to-[#958ef6] px-[22px] py-3.5 text-[16px] font-semibold text-white shadow-[0_10px_26px_-12px_rgba(191,102,217,0.75)] transition duration-300 hover:shadow-[0_14px_30px_-10px_rgba(191,102,217,0.85)] motion-safe:hover:-translate-y-0.5"
          >
            <span>Start test now</span>
            <svg
              aria-hidden
              className="h-[17px] w-[17px] transition-transform duration-300 motion-safe:group-hover:translate-x-1"
              viewBox="0 0 17 17"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.42"
            >
              <path d="M3.54 8.5h9.92M9.21 12.75 13.46 8.5 9.21 4.25" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Right: locked report mock */}
      <div className="animate-on-scroll stagger-2 relative aspect-[470/420] w-full overflow-hidden rounded-[20px] border border-[#e9e6ee] bg-white shadow-[0_40px_80px_-40px_rgba(20,10,40,0.5)] sm:aspect-[470/490] lg:justify-self-end">
        <Image
          src="/images/white/report-figma.png"
          alt=""
          fill
          sizes="(max-width: 1024px) 100vw, 470px"
          className="object-cover object-top blur-[3px]"
        />
        {/* Deliberately NOT the mock's dark vignette: it turned the lower half
            grey. The card stays as light as its top edge, so the only thing
            hiding the report is the blur. A faint even lift (no edge, no tint)
            takes the busiest areas off the boil for the copy below. */}
        <div aria-hidden className="absolute inset-0 bg-white/30" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-[15px] px-6 pb-[8%]">
          <span className="flex h-14 w-14 items-center justify-center rounded-[28px] bg-gradient-to-br from-[#fe6839] via-[#bf66d9] via-[43%] to-[#958ef6] shadow-[0_12px_30px_-8px_rgba(191,102,217,0.7)]">
            <svg
              aria-hidden
              className="h-[26px] w-[26px]"
              viewBox="0 0 26 26"
              fill="none"
              stroke="#ffffff"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19.5 11.9h-13c-1.2 0-2.17.97-2.17 2.17v6.5c0 1.2.97 2.17 2.17 2.17h13c1.2 0 2.17-.97 2.17-2.17v-6.5c0-1.2-.97-2.17-2.17-2.17Z" />
              <path d="M8.67 11.9V7.58a4.33 4.33 0 1 1 8.66 0V11.9" />
            </svg>
          </span>
          <p className="max-w-[300px] text-center font-serif text-[20px] font-semibold leading-[1.25] text-[#161021] [text-shadow:0_1px_12px_rgba(255,255,255,0.95),0_0_28px_rgba(255,255,255,0.85)]">
            Take the test to reveal your result
          </p>
        </div>
      </div>
    </div>
  </section>
);

export default WResultTeaser;
