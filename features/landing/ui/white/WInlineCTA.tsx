"use client";

import type { FC } from "react";
import Link from "next/link";
import { trackStartSurvey } from "@features/analytics/client";

const WInlineCTA: FC = () => {
  return (
    <section className="bg-white pb-10 pt-2">
      <div className="animate-on-scroll content-shell flex justify-center">
        <Link
          href="/survey"
          onClick={() => trackStartSurvey("report_section")}
          className="focus-visible-ring group inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(105deg,#ff6a3a_0%,#cf5afb_52%,#7d88ff_100%)] px-5 py-3 text-center text-sm font-semibold text-white shadow-[0_12px_30px_-8px_rgba(207,90,251,0.4)] transition hover:opacity-95 sm:gap-2.5 sm:px-8 sm:py-4 sm:text-base"
        >
          <span className="sm:hidden">Start test now</span>
          <span className="hidden sm:inline">
            Start test now to reveal your archetype probabilities
          </span>
          <svg
            aria-hidden
            className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
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
      </div>
    </section>
  );
};

export default WInlineCTA;
