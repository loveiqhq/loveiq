"use client";

import type { FC } from "react";
import Link from "next/link";
import { trackStartSurvey } from "@features/analytics/client";

const WCTA: FC = () => {
  return (
    <section className="bg-white pb-20 pt-8 lg:pb-28">
      <div className="content-shell">
        <div className="relative overflow-hidden rounded-3xl bg-[#f5f6f8] px-6 py-16 text-center">
          {/* Soft brand glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 h-48 w-[80%] -translate-x-1/2 rounded-full bg-gradient-to-r from-[#fe6839]/15 via-[#d95b88]/15 to-[#9c7dff]/15 blur-3xl"
          />
          <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-6">
            <h2 className="font-serif text-[clamp(2rem,5vw,3rem)] font-medium leading-tight text-[#161021]">
              Ready to understand and grow?
            </h2>
            <p className="text-[17px] leading-relaxed text-[#6b6678]">
              In just 15 minutes, unlock a personalized report decoding your sexual archetype — and
              the practical steps to improve intimacy.
            </p>
            <Link
              href="/survey"
              onClick={() => trackStartSurvey("footer")}
              className="focus-visible-ring inline-flex items-center justify-center gap-3 rounded-xl bg-black px-8 py-4 text-lg font-semibold text-white transition hover:bg-gray-800"
            >
              <span>Start test now</span>
              <svg
                aria-hidden
                className="h-5 w-5"
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
            <p className="text-xs font-bold uppercase tracking-[1.4px] text-[#6b6678]">
              • Takes 15 minutes • No account required
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WCTA;
