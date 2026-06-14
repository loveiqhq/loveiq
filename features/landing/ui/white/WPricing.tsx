"use client";

import type { FC } from "react";
import Image from "next/image";
import Link from "next/link";
import { trackStartSurvey } from "@features/analytics/client";
import {
  WHITE_PREPAID_PRICE_CENTS,
  WHITE_PREPAID_STRIKE_CENTS,
  formatReportPurchasePrice,
} from "@features/checkout/server/reportPurchase";

// Prices derived from the SAME constants the pay-first checkout charges
// (WHITE_PREPAID_PRICE_CENTS) so the landing can never advertise a number the
// gate doesn't honor. CTA routes to /survey — white users pay at the gate
// before the test. Matches Figma node 7828:10838.
const PRICE_LABEL = formatReportPurchasePrice(WHITE_PREPAID_PRICE_CENTS);
const STRIKE_LABEL = formatReportPurchasePrice(WHITE_PREPAID_STRIKE_CENTS);
const receives = [
  "Your Core Archetype",
  "Other Archetype Probabilities",
  "+50 pages of deep insights into your sexuality",
  "+20 chapters on your arousal & desire patterns",
  "Personalised growth paths & suggestions",
  "Share your report with up to 2 extra e-mails",
];

const Check: FC = () => (
  <svg
    aria-hidden
    className="h-5 w-5 shrink-0 text-accent-orange"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const WPricing: FC = () => {
  return (
    <section className="bg-[#f5f6f8] py-16 lg:py-24">
      <div className="content-shell">
        <div className="animate-on-scroll max-w-3xl">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent-orange" />
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#6b6678]">
              Unlock
            </span>
          </div>
          <h2 className="font-serif text-3xl font-medium leading-tight text-[#161021] sm:text-[44px]">
            Take the test & unlock your{" "}
            <span className="bg-gradient-to-r from-[#fe6839] via-[#bf66d9] to-[#958ef6] bg-clip-text italic text-transparent">
              Full Personal Report
            </span>{" "}
            now.
          </h2>
          <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-[#6b7280]">
            One assessment, one payment, lifetime access. No subscription, no account required,
            anonymous by default — now 50% off.
          </p>
        </div>

        <div className="mt-10 grid gap-10 border-t border-black/[0.08] pt-10 lg:grid-cols-[1fr_360px] lg:gap-16">
          {/* What you receive + testimonial */}
          <div className="animate-on-scroll flex flex-col">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#9a96a6]">
                What you receive
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#9a96a6]">
                Full report
              </span>
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {receives.map((item) => (
                <li
                  key={item}
                  className="flex items-center justify-between gap-4 border-b border-black/[0.06] py-3.5 text-[15px] text-[#3f3a4d]"
                >
                  <span>{item}</span>
                  <Check />
                </li>
              ))}
            </ul>

            {/* Testimonial */}
            <div className="mt-8 flex items-center gap-4">
              <Image
                src="/academic/dijana.jpg"
                alt=""
                width={80}
                height={80}
                className="h-16 w-16 shrink-0 rounded-full object-cover"
                style={{ objectPosition: "30% 15%" }}
                sizes="64px"
              />
              <div className="flex flex-col">
                <p className="font-serif text-[15px] italic leading-relaxed text-[#3f3a4d]">
                  &ldquo;I hesitated at first, but getting the{" "}
                  <strong className="font-bold">
                    full report turned out to be one of the best decisions
                  </strong>{" "}
                  I made. Completely worth it.&rdquo;
                </p>
                <p className="mt-1.5 text-[15px] font-bold text-[#161021]">
                  Dr. Dijana Galijašević, 36
                </p>
                <p className="text-[13px] text-[#6b7280]">Business founder &amp; CEO</p>
              </div>
            </div>
          </div>

          {/* Pricing card */}
          <div className="animate-on-scroll h-fit rounded-2xl border border-black/[0.08] bg-white p-6 shadow-[0_10px_40px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#6b6678]">
                Full personal report
              </span>
              <span className="rounded-full bg-[#1f9d57] px-2.5 py-1 text-[11px] font-bold text-white">
                50% OFF
              </span>
            </div>
            <p className="mt-5 text-[15px] text-[#9a96a6]">
              <span className="line-through">{STRIKE_LABEL}</span> one off
            </p>
            <p className="mt-1 flex items-end gap-2">
              <span className="bg-gradient-to-r from-[#fe6839] to-[#bf66d9] bg-clip-text font-serif text-6xl font-semibold text-transparent">
                {PRICE_LABEL}
              </span>
              <span className="mb-2 text-[13px] text-[#6b7280]">/ one time payment</span>
            </p>
            <div className="mt-5 rounded-xl border border-[#1f9d57]/30 bg-[#1f9d57]/[0.06] p-4">
              <div className="flex items-center gap-2">
                <svg
                  aria-hidden
                  className="h-5 w-5 shrink-0 text-[#1f9d57]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="m8.5 12 2.5 2.5 4.5-5" />
                </svg>
                <span className="text-[15px] font-bold text-[#161021]">
                  14-day money-back guarantee
                </span>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-[#6b7280]">
                Try the full report risk-free. Not for you? We refund you, no questions asked.
              </p>
            </div>
            <Link
              href="/survey"
              onClick={() => trackStartSurvey("report_section")}
              className="focus-visible-ring mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-black px-6 py-3.5 text-base font-semibold text-white transition hover:bg-gray-800"
            >
              <span>Unlock your full report</span>
              <svg
                aria-hidden
                className="h-4 w-4"
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
        </div>
      </div>
    </section>
  );
};

export default WPricing;
