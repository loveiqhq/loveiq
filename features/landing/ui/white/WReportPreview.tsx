"use client";

import type { FC } from "react";
import Image from "next/image";
import Link from "next/link";
import { trackStartSurvey } from "@features/analytics/client";

/**
 * White-variant "+50 page report" section (Figma node 7828:10437): left = report
 * value props (4 numbered items) + CTA; right = a styled mock of the LoveIQ
 * report ("What the LoveIQ Report looks like") + a short testimonial.
 */

const items = [
  {
    num: "01",
    title: "Guided educational assessment",
    body: "Built on latest psychology & relationship science.",
  },
  {
    num: "02",
    title: "Personalized to your archetype",
    body: "Showing your individual patterns and challenges.",
  },
  {
    num: "03",
    title: "20+ detailed report sections",
    body: "Covering turn-ons, fears, strengths & growth paths.",
  },
  {
    num: "04",
    title: "Tailored recommendations",
    body: "Curated resources for your archetype & preferences.",
  },
];

const WReportPreview: FC = () => (
  <section className="bg-white py-16 lg:py-24">
    <div className="content-shell grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
      {/* Left: value props + CTA */}
      <div className="animate-on-scroll flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent-orange" />
            <span className="text-[11px] font-bold tracking-wide text-[#6b6678]">Your report</span>
          </div>
          <h2 className="font-serif text-[clamp(2rem,5vw,2.6rem)] font-normal leading-[1.1] text-black">
            We will provide you with a{" "}
            <span className="bg-gradient-to-r from-[#fe6839] via-[#bf66d9] to-[#958ef6] bg-clip-text text-transparent">
              +50 page long report
            </span>
          </h2>
          <p className="max-w-xl text-[16px] leading-relaxed text-[#69707d]">
            LoveIQ helps you decode your desires, attachment patterns, emotional needs, and intimate
            dynamics so you can build relationships that are aligned, exciting, and safe.
          </p>
        </div>

        <div className="flex flex-col gap-5">
          {items.map((it) => (
            <div key={it.num} className="flex items-center gap-10">
              <span className="text-[11px] font-bold text-[#6f6c78]">{it.num}</span>
              <div className="flex flex-col gap-1">
                <p className="text-[15px] font-bold text-[#161021]">{it.title}</p>
                <p className="text-[13.5px] text-[#6b6678]">{it.body}</p>
              </div>
            </div>
          ))}
        </div>

        <Link
          href="/survey"
          onClick={() => trackStartSurvey("report_section")}
          className="focus-visible-ring inline-flex w-fit items-center justify-center gap-2.5 rounded-lg bg-black px-5 py-2.5 text-base font-semibold text-white transition hover:bg-gray-800"
        >
          <span>Start test now</span>
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

      {/* Right: report mock + testimonial */}
      <div className="animate-on-scroll flex flex-col gap-8">
        <div className="rounded-xl border border-[#bbc1cc] bg-white p-4 shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
          <p className="mb-3 text-center text-[12px] font-medium text-black">
            What the{" "}
            <span className="bg-gradient-to-r from-[#fe6839] via-[#bf66d9] to-[#958ef6] bg-clip-text font-semibold text-transparent">
              LoveIQ Report
            </span>{" "}
            looks like:
          </p>
          {/* Real report screenshot, blurred slightly. */}
          <div className="overflow-hidden rounded-lg border border-black/[0.06]">
            <Image
              src="/images/white/report-preview.png"
              alt="A preview of the LoveIQ report"
              width={760}
              height={900}
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="h-auto w-full object-contain blur-[1.5px] sm:h-[440px] sm:object-cover sm:object-top"
            />
          </div>
        </div>

        {/* Testimonial */}
        <div className="flex items-center gap-4">
          <Image
            src="/testimonials/gebhardt.jpg"
            alt=""
            width={80}
            height={80}
            className="h-16 w-16 shrink-0 rounded-full object-cover"
            sizes="64px"
          />
          <div className="flex flex-col">
            <p className="font-serif text-[16px] italic text-[#6b6678]">
              &ldquo;My report was{" "}
              <strong className="font-bold text-black">shockingly accurate</strong>.&rdquo;
            </p>
            <p className="mt-1 text-[18px] font-bold text-black">Dr. Philip Gebhardt, 40</p>
            <p className="text-[14px] text-[#69707d]">Dentist and orthodontist</p>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default WReportPreview;
