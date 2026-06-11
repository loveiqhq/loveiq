"use client";

import type { FC } from "react";
import Link from "next/link";
import { trackStartSurvey } from "@features/analytics/client";

const WInlineCTA: FC = () => {
  return (
    <section className="bg-white pb-8 pt-2">
      <div className="content-shell flex justify-center">
        <Link
          href="/survey"
          onClick={() => trackStartSurvey("report_section")}
          className="focus-visible-ring group inline-flex items-center gap-2 text-center text-base font-medium text-[#3f3a4d] transition hover:text-black"
        >
          <span>
            <span className="font-bold text-black">Start test now</span> to reveal your archetype
            probabilities
          </span>
          <svg
            aria-hidden
            className="h-4 w-4 text-accent-orange transition-transform group-hover:translate-x-0.5"
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
