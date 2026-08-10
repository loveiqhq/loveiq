"use client";

import type { FC } from "react";
import Link from "next/link";
import { trackStartSurvey } from "@features/analytics/client";
import WQuestionCard from "./WQuestionCard";

/**
 * Closing CTA (Figma node 8947:8597) — the first survey question rendered in
 * full so the funnel can start without leaving the page.
 */
const WCTA: FC = () => {
  return (
    <section className="bg-white py-16 lg:py-[70px]" aria-labelledby="w-cta-heading">
      <div className="content-shell flex flex-col items-center">
        <h2
          id="w-cta-heading"
          className="animate-on-scroll text-center font-serif text-[clamp(2.5rem,8vw,3.88rem)] font-normal leading-[1.15] text-[#161021]"
        >
          Ready to
          <br />
          <span className="bg-gradient-to-r from-[#fe6839] from-[29%] via-[#bf66d9] via-[70%] to-[#958ef6] bg-clip-text text-transparent">
            meet yourself?
          </span>
        </h2>

        <p className="animate-on-scroll stagger-1 mt-5 max-w-[493px] text-center text-[17px] font-medium leading-[32px] text-[#6b6678] sm:text-[18px]">
          Answer the first question right here.
          <br />
          One tap and your report starts building.
        </p>

        <div className="animate-on-scroll stagger-2 mt-9 w-full max-w-[640px]">
          <WQuestionCard size="final" location="footer" />
        </div>

        <Link
          href="/survey"
          aria-label="Continue free test - closing CTA"
          onClick={() => trackStartSurvey("footer")}
          className="focus-visible-ring group mt-8 inline-flex h-12 items-center justify-center gap-2.5 rounded-lg bg-black px-10 text-[16px] font-semibold text-white transition duration-300 hover:bg-gray-800 motion-safe:hover:-translate-y-0.5"
        >
          <span>Continue free test</span>
          <svg
            aria-hidden
            className="h-4 w-4 transition-transform duration-300 motion-safe:group-hover:translate-x-1"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </Link>

        <p className="animate-on-scroll mt-8 text-center text-[15px] font-bold text-[#6f6a7a] sm:text-[16px]">
          Anonymous by default · ~9 minutes · No account required
        </p>
      </div>
    </section>
  );
};

export default WCTA;
