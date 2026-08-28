"use client";

import type { FC } from "react";
import Link from "next/link";
import { trackStartSurvey } from "@features/analytics/client";
import WHeroConstellation from "../white/WHeroConstellation";

const stats: { label: string; value: string }[] = [
  { label: "Completion time", value: "≈ 15 min" },
  { label: "Archetypes", value: "14" },
  { label: "Dimensions measured", value: "21" },
  { label: "Report pages per Archetype", value: "+50" },
  { label: "14-day money-back guarantee used", value: "0,00%" },
  { label: "Methodology", value: "Validated, multi-factor" },
];

const WHero: FC = () => {
  return (
    <section className="relative overflow-hidden bg-white pt-[64px]">
      <div className="content-shell relative">
        <div className="relative flex flex-col items-center gap-8 py-14 sm:gap-10 lg:py-24 xl:flex-row xl:justify-between xl:gap-6">
          {/* Center: animated "constellation" — archetype names + dimension words
              appear/disappear one-by-one across a soft brand glow (the old molecule
              image was removed for reading as too noisy). On desktop it's the
              centered backdrop (behind copy + stats); on mobile it sits in-flow
              between them. Single instance → one timer set. */}
          <WHeroConstellation className="order-2 w-full max-w-[320px] sm:max-w-[380px] xl:absolute xl:left-1/2 xl:top-1/2 xl:order-none xl:w-[clamp(380px,40vw,540px)] xl:max-w-none xl:-translate-x-1/2 xl:-translate-y-1/2" />

          {/* Left: copy */}
          <div className="relative z-10 order-1 flex w-full max-w-[40rem] flex-col gap-6 xl:order-none xl:max-w-[25rem]">
            <div className="animate-on-load flex items-center gap-2.5">
              <span className="animate-pulse-glow h-[7px] w-[7px] shrink-0 rounded-full bg-accent-orange" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-[#6b6678]">
                Science-backed methodology
              </span>
            </div>

            <h1 className="animate-on-load stagger-1 font-serif text-[clamp(2.75rem,8vw,3.75rem)] font-semibold leading-[1.05] text-[#161021]">
              Determine{" "}
              <span className="whitespace-nowrap">
                Your{" "}
                <span className="bg-gradient-to-r from-[#fe6839] via-[#d95b88] to-[#cb5fc1] bg-clip-text italic text-transparent">
                  Sexual
                </span>
              </span>{" "}
              <span className="bg-gradient-to-r from-[#c267c9] via-[#a871f4] to-[#9893f7] bg-clip-text italic text-transparent">
                Archetypes
              </span>
            </h1>

            <p className="animate-on-load stagger-2 max-w-[34rem] text-[15px] leading-7 text-[#6b7280]">
              Grounded in state-of-the-art science &amp; research.{" "}
              <strong className="font-extrabold text-black">In just 15 minutes</strong>,{" "}
              <strong className="font-extrabold text-black">
                unlock a freemium personalized report
              </strong>{" "}
              decoding your sexual archetype and patterns, so you get clear, practical steps to
              improve intimacy.
            </p>

            <div className="animate-on-load stagger-3">
              <Link
                href="/survey"
                aria-label="Start test now - hero"
                className="focus-visible-ring inline-flex items-center justify-center gap-3 rounded-xl bg-black px-6 py-3.5 text-base font-semibold text-white transition hover:bg-gray-800"
                onClick={() => trackStartSurvey("hero")}
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
            </div>

            <p className="animate-on-load stagger-4 text-sm text-black">
              <span className="font-light">Your </span>
              <strong className="font-extrabold">privacy &amp; anonymity</strong>
              <span className="font-light"> come first. Learn more in our </span>
              <Link
                href="/trust-zone"
                className="focus-visible-ring font-bold text-accent-orange hover:underline"
              >
                › Trust Center
              </Link>
            </p>
          </div>

          {/* Right: stat block */}
          <dl className="animate-on-load stagger-2 relative z-10 order-3 flex w-full max-w-[40rem] flex-col xl:order-none xl:max-w-[19rem]">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="flex items-center justify-between gap-6 border-b border-black/[0.06] py-3.5 last:border-b-0"
              >
                <dt className="text-sm text-[#6b6678]">{stat.label}</dt>
                <dd className="shrink-0 font-serif text-[17px] text-[#161021]">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
};

export default WHero;
