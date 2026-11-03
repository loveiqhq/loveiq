"use client";

import type { FC } from "react";
import Link from "next/link";
import { trackStartSurvey } from "@features/analytics/client";

/**
 * "The language" — the vocabulary your report hands you (Figma node 9200:32761).
 * Left: pitch + CTA. Right: a wrap of report terms (three highlighted, three
 * blurred/locked). The "Say this instead" sample card under them went with the 12.10
 * copy (Figma Report-3.0 1604:8233).
 */

/**
 * `slug`: the glossary term an unlocked chip links to. These are the only links from the
 * home page into the glossary's term pages, which helps crawlers find and rank them; the
 * targets are the fullest page for each idea (e.g. "novelty", not the thinner "novelty seeking").
 */
type Chip = { label: string; tone: "accent" | "plain" | "locked"; slug?: string };

const chips: Chip[] = [
  { label: "responsive desire", tone: "accent", slug: "responsive-desire" },
  { label: "pursuit & chase", tone: "locked" },
  { label: "accelerators & brakes", tone: "plain", slug: "dual-control-model-of-sexual-response" },
  { label: "aftercare", tone: "accent", slug: "aftercare" },
  { label: "novelty seeking", tone: "plain", slug: "novelty" },
  { label: "edge & taboo", tone: "locked" },
  { label: "initiation style", tone: "plain", slug: "initiation-pattern" },
  { label: "attachment & desire", tone: "plain", slug: "attachment-style" },
  { label: "power play", tone: "accent", slug: "power-exchange" },
  { label: "sacred & ritual", tone: "locked" },
];

const chipClass = (tone: Chip["tone"]) =>
  `flex items-center rounded-full border border-[#e9e6ee] bg-white ${
    tone === "accent"
      ? "gap-2.5 py-[11px] pl-[15px] pr-[18px] shadow-[0_1px_1.5px_rgba(20,15,33,0.05)]"
      : tone === "locked"
        ? "gap-2 py-[11px] pl-[18px] pr-3 shadow-[0_8px_18px_-14px_rgba(20,10,40,0.3)]"
        : "px-[18px] py-[11px] shadow-[0_8px_18px_-14px_rgba(20,10,40,0.3)]"
  }`;

const WVocab: FC = () => (
  <section
    className="bg-[#f5f4f8] py-16 lg:py-[84px]"
    aria-labelledby="w-vocab-heading"
    data-landing-section="vocab"
  >
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
            aria-label="Start test now - the language section"
            onClick={() => trackStartSurvey("vocab")}
            className="focus-visible-ring group inline-flex items-center gap-2.5 w-btn-gradient-border px-[22px] py-3.5 text-[15px] font-bold text-white motion-safe:hover:-translate-y-0.5"
          >
            <span>Start test now</span>
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
      <ul className="animate-on-scroll m-0 flex list-none flex-wrap gap-2.5 p-0">
        {chips.map((chip) => {
          const content = (
            <>
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
            </>
          );
          // The whole chip is the link (a full-size tap target), styled as before.
          return chip.slug ? (
            <li key={chip.label} className="flex">
              <Link
                href={`/glossary/${chip.slug}`}
                prefetch={false}
                className={`${chipClass(chip.tone)} focus-visible-ring transition-colors hover:border-[#c2410c]`}
              >
                {content}
              </Link>
            </li>
          ) : (
            <li key={chip.label} className={chipClass(chip.tone)}>
              {content}
            </li>
          );
        })}
      </ul>
    </div>
  </section>
);

export default WVocab;
