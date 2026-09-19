"use client";

import type { FC, ReactNode } from "react";
import Link from "next/link";
import { trackStartSurvey } from "@features/analytics/client";

/**
 * "What you might find out" — free-vs-locked teaser (Figma node 8982:3208).
 * Three free headline findings, then a sample insight-map card next to the
 * locked depth the paid report adds.
 */

const freeCards: { kicker: string; title: string }[] = [
  { kicker: "DESIRE ACCELERATORS", title: "Your strongest turn-on, named" },
  { kicker: "DESIRE BRAKES", title: "What quietly kills the mood for you" },
  { kicker: "CORE PERSONALITY", title: "Your personality type, out of 14" },
];

const lockedRows: ReactNode[] = [
  <>
    The{" "}
    <strong className="font-bold text-[#161021]">conditions your desire needs to flourish</strong>,
    and the ones that quietly kill it
  </>,
  <>
    The{" "}
    <strong className="font-bold text-[#161021]">patterns you keep landing in with partners</strong>
    , and how to break them
  </>,
  <>
    How to <strong className="font-bold text-[#161021]">reignite desire when it has faded</strong>
  </>,
  <>
    Your <strong className="font-bold text-[#161021]">Power Orientation and Arousal Style</strong>,
    and the conditions each one needs met
  </>,
];

const FreeTag: FC<{ label?: string }> = ({ label = "FREE" }) => (
  <span className="shrink-0 rounded-full border border-[rgba(40,184,119,0.3)] bg-[rgba(40,184,119,0.1)] px-2.5 py-1 text-[10px] font-bold tracking-[0.8px] text-[#137a4b]">
    {label}
  </span>
);

const LockIcon: FC = () => (
  <svg
    aria-hidden
    className="mt-0.5 h-[17px] w-[17px] shrink-0"
    viewBox="0 0 17 17"
    fill="none"
    stroke="#fe6839"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12.75 7.8H4.25c-.78 0-1.42.63-1.42 1.41v4.25c0 .78.64 1.42 1.42 1.42h8.5c.78 0 1.42-.64 1.42-1.42V9.21c0-.78-.64-1.41-1.42-1.41Z" />
    <path d="M5.67 7.8V4.96a2.83 2.83 0 1 1 5.66 0V7.8" />
  </svg>
);

const WFindOut: FC = () => (
  <section className="bg-white py-16 lg:py-[92px]" aria-labelledby="w-findout-heading">
    <div className="content-shell">
      {/* Centered intro */}
      <div className="mx-auto flex max-w-[700px] flex-col items-center gap-3.5 text-center">
        <div className="animate-on-scroll flex items-center gap-2.5">
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent-orange" />
          <span className="text-[12px] font-bold tracking-[1.68px] text-[#5f6675]">
            WHAT YOU MIGHT FIND OUT
          </span>
        </div>
        <h2
          id="w-findout-heading"
          className="animate-on-scroll stagger-1 font-serif text-[clamp(2rem,5.5vw,2.875rem)] font-medium leading-[1.18] tracking-[-0.01em] text-[#161021]"
        >
          Some of it you suspect.{" "}
          <span className="bg-gradient-to-r from-[#fe6839] via-[#bf66d9] to-[#958ef6] bg-clip-text text-transparent">
            Some of it you don&apos;t.
          </span>
        </h2>
      </div>

      {/* Three free findings */}
      <ul className="m-0 mt-11 grid list-none gap-3.5 p-0 sm:grid-cols-3">
        {freeCards.map((c, i) => (
          <li
            key={c.kicker}
            className={`animate-on-scroll stagger-${i + 1} flex flex-col gap-2.5 rounded-2xl border border-[#e9e6ee] bg-white px-5 pb-[22px] pt-6 transition duration-300 hover:border-[#d6d0e3] motion-safe:hover:-translate-y-1`}
          >
            <div className="flex items-center gap-2.5">
              <span className="flex-1 text-[11px] font-bold tracking-[1.1px] text-[#c2410c]">
                {c.kicker}
              </span>
              <FreeTag />
            </div>
            <p className="font-serif text-[19px] font-medium leading-[25px] text-[#161021]">
              {c.title}
            </p>
          </li>
        ))}
      </ul>

      {/* Sample insight map + locked depth */}
      <div className="mt-11 grid items-center gap-11 lg:grid-cols-2">
        <div className="animate-on-scroll flex flex-col gap-2.5 overflow-hidden rounded-3xl border border-[rgba(157,138,215,0.3)] bg-gradient-to-b from-[#faf7fe] to-white px-6 pt-7 shadow-[0_30px_60px_-40px_rgba(60,30,110,0.4)] sm:px-8">
          <div className="flex justify-end">
            <FreeTag label="FREE IN YOUR RESULT" />
          </div>
          <div className="flex items-center gap-2.5">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-[#795fc8]" />
            <span className="text-[11px] font-bold tracking-[1.1px] text-[#795fc8]">
              YOUR INSIGHT MAP · AROUSAL
            </span>
          </div>
          <p className="font-serif text-[21px] font-medium leading-[28px] text-[#161021]">
            Your desire is responsive, not spontaneous
          </p>
          <p className="text-[13.5px] leading-[21px] text-[#5f6675]">
            It doesn&apos;t switch on. It warms up, and the conditions are the ignition.
          </p>
          {/* Arousal curve. `preserveAspectRatio="none"` lets the line stretch to
              the card width; the marker is an HTML dot so it stays circular. */}
          <div className="relative h-[110px] w-full">
            {/* Two full-size wrappers carry the motion: a % translate on a
                full-size box resolves against this container, so the marker
                tracks the stretched curve at any width while animating on the
                compositor (see .w-dot-x / .w-dot-y in globals.css). */}
            <span aria-hidden className="w-dot-x pointer-events-none absolute inset-0">
              <span className="w-dot-y absolute inset-0">
                <span className="w-draw-dot absolute left-0 top-0 h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#75589f] shadow-[0_2px_6px_rgba(60,30,110,0.35)]" />
              </span>
            </span>
            <svg
              aria-hidden
              className="h-full w-full"
              viewBox="0 0 610.5 88.5"
              preserveAspectRatio="none"
              fill="none"
            >
              <defs>
                <linearGradient
                  id="w-arousal-grad"
                  x1="1.25"
                  y1="0"
                  x2="609.25"
                  y2="0"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop stopColor="#958EF6" />
                  <stop offset="1" stopColor="#FE6839" />
                </linearGradient>
              </defs>
              <path
                className="w-draw-line"
                pathLength={1}
                d="M1.25 87.25C106.481 85.25 176.635 79.25 246.788 61.25C316.942 43.25 398.788 19.25 609.25 1.25"
                stroke="url(#w-arousal-grad)"
                strokeWidth="2.5"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
        </div>

        <div className="flex flex-col">
          <div className="animate-on-scroll flex items-center gap-2.5">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent-orange" />
            <span className="text-[12px] font-bold tracking-[1.68px] text-[#5f6675]">
              THE FULL REPORT GOES DEEPER
            </span>
          </div>
          <ul className="m-0 mt-[22px] list-none p-0">
            {lockedRows.map((row, i) => (
              <li
                key={i}
                className={`animate-on-scroll stagger-${i + 1} flex items-start gap-3 border-t border-[#e9e6ee] py-3.5`}
              >
                <LockIcon />
                <p className="flex-1 text-[15.5px] font-semibold leading-[23px] text-[#3a3444]">
                  {row}
                </p>
              </li>
            ))}
          </ul>
          <div className="animate-on-scroll mt-[22px]">
            <Link
              href="/survey"
              aria-label="Start the free test - what you might find out"
              onClick={() => trackStartSurvey("find_out")}
              className="focus-visible-ring group inline-flex items-center gap-2.5 w-btn-gradient-border px-[22px] py-3.5 text-[15px] font-bold text-white motion-safe:hover:-translate-y-0.5"
            >
              <span>Start the free test</span>
              <span
                aria-hidden
                className="transition-transform duration-300 motion-safe:group-hover:translate-x-1"
              >
                &rarr;
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default WFindOut;
