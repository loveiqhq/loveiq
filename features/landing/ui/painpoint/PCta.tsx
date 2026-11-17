"use client";

import type { FC } from "react";
import Link from "next/link";
import { trackStartSurvey } from "@features/analytics/client";
import { PP_FOCUS } from "./ppStyles";

type CtaLocation = Parameters<typeof trackStartSurvey>[0];

/**
 * The page's gradient button ("lq-cta" on the boards): 56px tall, 18px text on a phone,
 * 64px and 20px from lg, a soft violet glow that grows as it lifts under a mouse. Every one
 * starts the survey (Fatih, 14 Nov: no in-page jumps) and counts as a `cta_click` from its
 * place. Its accessible name is "<label> - <place>", the page's contract with the nightly
 * persona walkers (scripts/walkers/walk.ts clicks the one ending "- hero").
 */
const PCta: FC<{
  label: string;
  /** The words after the dash in the accessible name: "hero", "pain points", … */
  place: string;
  location: CtaLocation;
  /** Set for question 1's continue, as on the video page's card. */
  element?: "question_card";
  className?: string;
}> = ({ label, place, location, element, className = "" }) => (
  <Link
    href="/survey"
    aria-label={`${label} - ${place}`}
    onClick={() => trackStartSurvey(location, element)}
    className={`inline-flex min-h-[56px] items-center gap-[18px] rounded-full px-7 text-[18px] font-semibold text-white no-underline shadow-[0_10px_26px_-12px_rgba(191,102,217,0.75)] transition-[transform,box-shadow] duration-[250ms] ease-[cubic-bezier(.16,1,.3,1)] [background:linear-gradient(135deg,#fe6839_0%,#bf66d9_43%,#958ef6_100%)] hover:shadow-[0_14px_30px_-10px_rgba(191,102,217,0.85)] motion-safe:hover:-translate-y-0.5 motion-reduce:transition-none lg:min-h-[64px] lg:px-9 lg:text-[20px] ${PP_FOCUS} ${className}`}
  >
    <span>{label}</span>
    <svg
      aria-hidden
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  </Link>
);

export default PCta;
