"use client";

import type { FC } from "react";
import Link from "next/link";
import { trackStartSurvey } from "@features/analytics/client";

/**
 * "The language" — the vocabulary your report hands you (Figma node 9200:32761).
 * Left: pitch + CTA. Right: a wrap of report terms (three highlighted, three
 * blurred/locked) above a "Say this instead" sample card.
 */

type Chip = { label: string; tone: "accent" | "plain" | "locked" };

const chips: Chip[] = [
  { label: "responsive desire", tone: "accent" },
  { label: "pursuit & chase", tone: "locked" },
  { label: "accelerators & brakes", tone: "plain" },
  { label: "aftercare", tone: "accent" },
  { label: "novelty seeking", tone: "plain" },
  { label: "edge & taboo", tone: "locked" },
  { label: "initiation style", tone: "plain" },
  { label: "attachment & desire", tone: "plain" },
  { label: "power play", tone: "accent" },
  { label: "sacred & ritual", tone: "locked" },
];

const pairs: { before: string; after: string }[] = [
  { before: "“Are you tired?”", after: "“I want you tonight.”" },
  { before: "You slow down and wait.", after: "“When I slow down, I am starting.”" },
  { before: "“Never mind.”", after: "“I am still here. Ask me again later.”" },
];

const WVocab: FC = () => (
  <section className="bg-[#f5f4f8] py-16 lg:py-[84px]" aria-labelledby="w-vocab-heading">
    <div className="content-shell grid items-center gap-12 lg:grid-cols-2 lg:gap-14">
      {/* Left */}
      <div className="flex flex-col">
        <div className="animate-on-scroll flex items-center gap-2.5">
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent-orange" />
          <span className="text-[12px] font-bold tracking-[1.68px] text-[#5f6675]">
            THE LANGUAGE
          </span>
        </div>

        <h2
          id="w-vocab-heading"
          className="animate-on-scroll stagger-1 mt-3.5 font-serif text-[clamp(2rem,5.5vw,2.875rem)] font-medium leading-[1.18] tracking-[-0.01em] text-[#161021]"
        >
          We give you the{" "}
          <span className="bg-gradient-to-r from-[#fe6839] via-[#bf66d9] to-[#958ef6] bg-clip-text text-transparent">
            words.
          </span>
        </h2>

        <p className="animate-on-scroll stagger-2 mt-3.5 max-w-[34rem] text-[16px] leading-[28px] text-[#5f6675]">
          Most people can feel what they want but can&apos;t say it.
          <br />
          Your report turns your patterns into a vocabulary, so you can finally ask for what you
          want, out loud.
        </p>

        <div className="animate-on-scroll stagger-3 mt-6">
          <Link
            href="/survey"
            aria-label="Find my words - the language section"
            onClick={() => trackStartSurvey("vocab")}
            className="focus-visible-ring group inline-flex items-center gap-2.5 w-btn-gradient-border px-[22px] py-3.5 text-[15px] font-bold text-white motion-safe:hover:-translate-y-0.5"
          >
            <span>Find my words</span>
            <span
              aria-hidden
              className="transition-transform duration-300 motion-safe:group-hover:translate-x-1"
            >
              &rarr;
            </span>
          </Link>
        </div>
      </div>

      {/* Right */}
      <div className="flex flex-col gap-[18px]">
        <ul className="animate-on-scroll m-0 flex list-none flex-wrap gap-2.5 p-0">
          {chips.map((chip) => (
            <li
              key={chip.label}
              className={`flex items-center rounded-full border border-[#e9e6ee] bg-white ${
                chip.tone === "accent"
                  ? "gap-2.5 py-[11px] pl-[15px] pr-[18px] shadow-[0_1px_1.5px_rgba(20,15,33,0.05)]"
                  : chip.tone === "locked"
                    ? "gap-2 py-[11px] pl-[18px] pr-3 shadow-[0_8px_18px_-14px_rgba(20,10,40,0.3)]"
                    : "px-[18px] py-[11px] shadow-[0_8px_18px_-14px_rgba(20,10,40,0.3)]"
              }`}
            >
              {chip.tone === "accent" && (
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-orange" />
              )}
              <span
                className={`whitespace-nowrap font-serif text-[15px] italic sm:text-[16px] ${
                  chip.tone === "accent" ? "text-[#c2410c]" : "text-[#161021]"
                } ${chip.tone === "locked" ? "blur-[2.5px]" : ""}`}
              >
                {chip.label}
              </span>
              {chip.tone === "locked" && (
                <>
                  <span className="sr-only">(locked — unlocked in your report)</span>
                  <svg
                    aria-hidden
                    className="h-3.5 w-3.5 shrink-0 text-[#6f6a7a]"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10.5 6.42H3.5c-.64 0-1.17.52-1.17 1.16v3.5c0 .65.53 1.17 1.17 1.17h7c.64 0 1.17-.52 1.17-1.17v-3.5c0-.64-.53-1.16-1.17-1.16Z" />
                    <path d="M4.67 6.42V4.08a2.33 2.33 0 1 1 4.66 0v2.34" />
                  </svg>
                </>
              )}
            </li>
          ))}
        </ul>

        {/* Sample card */}
        <div className="animate-on-scroll stagger-2 rounded-[20px] border border-[#e9e6ee] bg-white px-6 py-[26px] sm:px-7">
          <p className="text-[11px] font-bold text-[#75589f]">FROM THE REPORT · INITIATION STYLE</p>
          <p className="mt-2.5 font-serif text-[19px] font-semibold text-[#161021]">
            Say this instead
          </p>
          <dl className="m-0 mt-4">
            {pairs.map((p, i) => (
              <div key={p.after} className={i > 0 ? "mt-3 border-t border-[#e9e6ee] pt-3" : ""}>
                <dt className="text-[13px] text-[#6f6a7a]">{p.before}</dt>
                <dd className="mt-[5px] font-serif text-[16px] italic text-[#161021]">{p.after}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-[18px] text-[12px] font-semibold text-[#75589f]">
            Same want, but expressed with words they cannot miss.
          </p>
        </div>
      </div>
    </div>
  </section>
);

export default WVocab;
