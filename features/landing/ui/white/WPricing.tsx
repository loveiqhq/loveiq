"use client";

import type { FC } from "react";
import Link from "next/link";
import { trackStartSurvey } from "@features/analytics/client";

// Static marketing teaser. An anonymous landing visitor has no personalized
// quote, so this mirrors the pricing engine's public anchors (MSRP €59.99,
// ~50%-off starting price €29.99) rather than calling reportPricing. The CTA
// routes to /survey — the report is unlocked after taking the test.
const receives = [
  "Your core archetype + match scores across all 14",
  "Attachment & communication style breakdown",
  "Risk orientation and desire patterns",
  "Personal strengths, challenges & blind spots",
  "Practical, tailored steps to improve intimacy",
  "50+ pages of report per archetype",
];

const WPricing: FC = () => {
  return (
    <section className="bg-[#f5f6f8] py-16 lg:py-24">
      <div className="content-shell">
        <div className="mx-auto grid max-w-4xl items-center gap-10 rounded-3xl border border-black/[0.08] bg-white p-8 shadow-[0_10px_40px_rgba(0,0,0,0.06)] lg:grid-cols-2 lg:gap-12 lg:p-12">
          {/* Left: price + CTA */}
          <div className="animate-on-scroll flex flex-col gap-5">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-black/[0.04] px-3 py-1 text-[11px] font-bold uppercase tracking-[1.4px] text-[#6b6678]">
              Unlock
            </span>
            <h2 className="font-serif text-3xl font-medium text-[#161021] sm:text-4xl">
              Unlock your full report
            </h2>
            <div className="flex items-end gap-3">
              <span className="font-serif text-5xl font-semibold text-[#161021]">€29.99</span>
              <span className="mb-1 text-xl text-[#6b7280] line-through">€59.99</span>
              <span className="mb-1.5 rounded-full bg-gradient-brand px-2.5 py-1 text-xs font-bold text-white">
                50% OFF
              </span>
            </div>
            <Link
              href="/survey"
              onClick={() => trackStartSurvey("report_section")}
              className="focus-visible-ring inline-flex items-center justify-center gap-2 rounded-xl bg-black px-7 py-4 text-lg font-semibold text-white transition hover:bg-gray-800"
            >
              <span>Start test to unlock</span>
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
            <p className="text-sm text-[#6b6678]">Backed by a 14-day money-back guarantee.</p>
          </div>

          {/* Right: what you receive */}
          <div className="animate-on-scroll flex flex-col gap-4">
            <p className="text-[11px] font-bold uppercase tracking-[1.4px] text-[#6b6678]">
              What you receive
            </p>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {receives.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[15px] text-[#3f3a4d]">
                  <svg
                    aria-hidden
                    className="mt-0.5 h-5 w-5 shrink-0 text-accent-orange"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WPricing;
