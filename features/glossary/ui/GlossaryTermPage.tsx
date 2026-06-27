"use client";

import type { FC } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import type { GlossaryTerm } from "@/data/glossary-data";
import WNavSection from "@features/landing/ui/white/WNavSection";
import WFooterSection from "@features/landing/ui/white/WFooterSection";

interface GlossaryTermPageProps {
  term: GlossaryTerm;
  relatedTermsWithLinks: Array<{ name: string; slug: string | null }>;
}

interface MythRealityCardProps {
  myth: string;
  reality: string;
  index: number;
  defaultRevealed?: boolean;
}

// One myth/reality pair inside the purple "Common Misunderstandings" card.
// Tap the myth row to reveal the reality (height + opacity animation).
const MythRealityCard: FC<MythRealityCardProps> = ({
  myth,
  reality,
  index,
  defaultRevealed = false,
}) => {
  const [isRevealed, setIsRevealed] = useState(defaultRevealed);
  const [contentHeight, setContentHeight] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const cardId = `myth-reality-${index}`;

  useLayoutEffect(() => {
    const updateHeight = () => {
      if (contentRef.current) {
        setContentHeight(contentRef.current.scrollHeight);
      }
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, [reality]);

  return (
    <div>
      {/* Myth row — clickable */}
      <button
        type="button"
        onClick={() => setIsRevealed(!isRevealed)}
        className="focus-visible-ring flex w-full cursor-pointer select-none items-start gap-3 rounded-lg text-left"
        aria-expanded={isRevealed}
        aria-controls={cardId}
      >
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[rgba(225,29,72,0.12)]">
          <svg
            className="h-2.5 w-2.5 text-[#E11D48]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </span>
        <span className="min-w-0 flex-1 text-sm font-bold leading-5 text-[rgba(0,0,0,0.7)]">
          <span className="text-[rgba(0,0,0,0.6)]">Myth:</span> {myth}
        </span>
        <svg
          className="h-4 w-4 shrink-0 text-gray-500 transition-transform duration-300"
          style={{
            transform: isRevealed ? "rotate(180deg)" : "rotate(0deg)",
            transitionTimingFunction: "cubic-bezier(0.2,0.8,0.2,1)",
          }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Reality row — collapsible */}
      {reality && (
        <div
          id={cardId}
          className="overflow-hidden transition-all duration-500 ease-out"
          style={{
            maxHeight: isRevealed ? contentHeight : 0,
            opacity: isRevealed ? 1 : 0,
          }}
        >
          <div ref={contentRef}>
            <p className="pl-[28px] pt-1 text-sm font-light leading-5 text-[rgba(0,0,0,0.6)]">
              <span className="font-medium text-[rgba(0,0,0,0.6)]">Reality:</span> {reality}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

const GlossaryTermPage: FC<GlossaryTermPageProps> = ({ term, relatedTermsWithLinks }) => {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const observerOptions = {
      root: null,
      rootMargin: "0px",
      threshold: 0.1,
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    document.querySelectorAll(".reveal-on-scroll").forEach((element) => {
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <main className="relative min-h-screen bg-white text-gray-900">
      <WNavSection />

      {/* Main Content */}
      <section className="relative pt-32 pb-16 sm:pt-36">
        <div className="content-shell">
          <div className="mx-auto max-w-[896px]">
            {/* Breadcrumb */}
            <Link
              href="/glossary"
              className="focus-visible-ring inline-flex items-center gap-2 rounded text-xs font-semibold uppercase tracking-[1.2px] text-gray-500 transition hover:text-gray-800 reveal-on-scroll"
            >
              <svg
                className="h-3 w-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
              Back to Glossary
            </Link>

            {/* Term Header */}
            <div className="reveal-on-scroll stagger-1 mt-12 space-y-6">
              <h1 className="font-serif text-4xl font-medium leading-[1.1] tracking-[-1.5px] text-gray-900 sm:text-5xl md:text-[60px]">
                {term.term}
              </h1>

              {/* Category Pills */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Type pill - orange */}
                <span className="rounded-full border border-[rgba(254,104,57,0.2)] bg-[rgba(254,104,57,0.1)] px-[13px] py-[5px] text-xs font-bold uppercase tracking-[0.6px] text-[#C2410C]">
                  {term.type}
                </span>
                {/* Domain pill - gray */}
                <span className="rounded-full border border-black/10 bg-black/[0.05] px-[13px] py-[5px] text-xs font-semibold tracking-[0.3px] text-gray-600">
                  {term.domain}
                </span>
                {/* Sensitivity pill - green for general, rose otherwise */}
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-[13px] py-[5px] text-xs font-semibold tracking-[0.3px] ${
                    term.sensitivityLevel === "General"
                      ? "border-[rgba(16,185,129,0.25)] bg-[rgba(16,185,129,0.1)] text-[#047857]"
                      : "border-[rgba(225,29,72,0.25)] bg-[rgba(225,29,72,0.08)] text-[#BE123C]"
                  }`}
                >
                  {term.sensitivityLevel === "General" ? (
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  ) : (
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" x2="12" y1="8" y2="12" />
                      <line x1="12" x2="12.01" y1="16" y2="16" />
                    </svg>
                  )}
                  {term.sensitivityLevel === "General" ? "General Sensitivity" : "Sensitive Topic"}
                </span>
              </div>
            </div>

            {/* Core Definition */}
            <div className="reveal-on-scroll stagger-2 mt-12">
              <p className="font-serif text-2xl leading-[1.4] text-gray-900/90 sm:text-[30px]">
                {term.definition}
              </p>
            </div>

            {/* Two Column Layout */}
            <div className="mt-12 flex flex-col gap-12 lg:flex-row">
              {/* Main Content Column */}
              <div className="flex-1 space-y-16">
                {/* What This Really Means Section */}
                {term.extendedNotes && (
                  <div className="reveal-on-scroll stagger-3 space-y-6">
                    <div className="flex items-center gap-3">
                      <svg
                        className="h-5 w-5"
                        viewBox="0 0 20 20"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden
                      >
                        <path
                          d="M3.33398 6.6665C3.33398 4.30984 3.33398 3.13067 4.06648 2.399C4.79815 1.6665 5.97732 1.6665 8.33398 1.6665H11.6673C14.024 1.6665 15.2032 1.6665 15.9348 2.399C16.6673 3.13067 16.6673 4.30984 16.6673 6.6665V13.3332C16.6673 15.6898 16.6673 16.869 15.9348 17.6007C15.2032 18.3332 14.024 18.3332 11.6673 18.3332H8.33398C5.97732 18.3332 4.79815 18.3332 4.06648 17.6007C3.33398 16.869 3.33398 15.6898 3.33398 13.3332V6.6665"
                          stroke="#FE6839"
                          strokeWidth="1.25"
                        />
                        <path
                          d="M16.5823 13.333H6.58232C5.80732 13.333 5.41982 13.333 5.10148 13.418C4.23871 13.6494 3.56493 14.3235 3.33398 15.1863"
                          stroke="#FE6839"
                          strokeWidth="1.25"
                        />
                        <path
                          d="M6.66602 5.83301H13.3327M6.66602 8.74967H10.8327M16.2493 15.833H6.66602"
                          stroke="#FE6839"
                          strokeWidth="1.25"
                          strokeLinecap="round"
                        />
                      </svg>
                      <h2 className="font-serif text-xl font-medium text-gray-900">
                        What This Really Means
                      </h2>
                    </div>
                    <div className="space-y-4 text-base leading-6 text-gray-600">
                      {term.extendedNotes.split(/(?<=\.)(?=\s+[A-Z])/).map((paragraph, i) => (
                        <p key={i}>{paragraph.trim()}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Examples Section */}
                {term.examples.length > 0 && (
                  <div className="reveal-on-scroll stagger-4 space-y-6">
                    <h2 className="font-serif text-xl font-medium text-gray-900">Examples</h2>
                    <div className="space-y-4">
                      {term.examples.map((example, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-4 rounded-xl border border-black/[0.04] bg-black/[0.04] p-[17px]"
                        >
                          <div className="shrink-0 pt-1">
                            <svg
                              className="h-4 w-4"
                              viewBox="0 0 16 16"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                              aria-hidden
                            >
                              <path
                                d="M6.10281 3.6055C6.94747 2.09083 7.36947 1.3335 8.00081 1.3335C8.63214 1.3335 9.05414 2.09083 9.89881 3.6055L10.1175 3.9975C10.3575 4.42816 10.4775 4.6435 10.6641 4.7855C10.8508 4.9275 11.0841 4.98016 11.5508 5.0855L11.9748 5.1815C13.6148 5.55283 14.4341 5.73816 14.6295 6.3655C14.8241 6.99216 14.2655 7.64616 13.1475 8.9535L12.8581 9.2915C12.5408 9.66283 12.3815 9.84883 12.3101 10.0782C12.2388 10.3082 12.2628 10.5562 12.3108 11.0515L12.3548 11.5028C12.5235 13.2475 12.6081 14.1195 12.0975 14.5068C11.5868 14.8942 10.8188 14.5408 9.28414 13.8342L8.88614 13.6515C8.45014 13.4502 8.23214 13.3502 8.00081 13.3502C7.76947 13.3502 7.55147 13.4502 7.11547 13.6515L6.71814 13.8342C5.18281 14.5408 4.41481 14.8942 3.90481 14.5075C3.39347 14.1195 3.47814 13.2475 3.64681 11.5028L3.69081 11.0522C3.73881 10.5562 3.76281 10.3082 3.69081 10.0788C3.62014 9.84883 3.46081 9.66283 3.14347 9.29216L2.85414 8.9535C1.73614 7.64683 1.17747 6.99283 1.37214 6.3655C1.56681 5.73816 2.38747 5.55216 4.02747 5.1815L4.45147 5.0855C4.91747 4.98016 5.15014 4.9275 5.33747 4.7855C5.52481 4.6435 5.64414 4.42816 5.88414 3.9975L6.10281 3.6055"
                                stroke="#FE6839"
                              />
                            </svg>
                          </div>
                          <p className="text-base font-light leading-6 text-gray-600">{example}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Common Misunderstandings Section */}
                {term.misinterpretations.length > 0 && (
                  <div className="reveal-on-scroll stagger-5 space-y-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <svg
                          className="h-5 w-5 text-[#BE123C]"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" x2="12" y1="8" y2="12" />
                          <line x1="12" x2="12.01" y1="16" y2="16" />
                        </svg>
                        <h2 className="font-serif text-xl font-medium text-[#BE123C]">
                          Common Misunderstandings
                        </h2>
                      </div>
                      <p className="text-[13px] font-medium text-[#6b6678]">
                        Tap each myth to reveal the reality
                      </p>
                    </div>
                    <div className="space-y-4 rounded-2xl bg-[rgba(167,139,250,0.1)] p-6 sm:p-8">
                      {term.misinterpretations.map((misinterpretation, i) => (
                        <MythRealityCard
                          key={i}
                          myth={misinterpretation}
                          reality={term.reality?.[i] || ""}
                          index={i}
                          defaultRevealed={i === 0}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar */}
              <div className="reveal-on-scroll stagger-4 space-y-8 lg:w-[267px]">
                {/* Related Terms */}
                {relatedTermsWithLinks.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="font-serif text-sm font-semibold text-gray-900">
                      Related Terms
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {relatedTermsWithLinks.map((related, i) =>
                        related.slug ? (
                          <Link
                            key={i}
                            href={`/glossary/${related.slug}`}
                            className="focus-visible-ring rounded-lg border border-black/[0.05] bg-black/[0.05] px-[13px] py-[9px] text-xs text-gray-600 transition hover:bg-black/[0.08] hover:text-gray-900"
                          >
                            {related.name}
                          </Link>
                        ) : (
                          <span
                            key={i}
                            className="rounded-lg border border-black/[0.05] bg-black/[0.05] px-[13px] py-[9px] text-xs text-gray-600"
                          >
                            {related.name}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {term.tags.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="font-serif text-sm font-semibold text-gray-900">Tags</h3>
                    <div className="flex flex-wrap gap-x-2 gap-y-2">
                      {term.tags.map((tag, i) => (
                        <span key={i} className="text-xs text-[#C2410C]">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Inside LoveIQ Card */}
                <div className="space-y-4 rounded-2xl border border-black/10 bg-[rgba(167,139,250,0.1)] p-6">
                  <h3 className="font-serif text-sm font-semibold uppercase tracking-[1.4px] text-[#6D28D9]">
                    Inside LoveIQ
                  </h3>
                  <p className="text-sm font-light leading-[1.625] text-gray-600">
                    We identify patterns related to {term.term} by analyzing responses in our
                    assessment modules, helping you understand your unique relationship dynamics.
                  </p>
                  <div className="space-y-2">
                    <div className="h-1 overflow-hidden rounded-full bg-black/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#fe6839] via-[#a78bfa] to-[#e9d5ff]"
                        style={{ width: "66%" }}
                      />
                    </div>
                    <p className="text-xs text-gray-500">Sample visualization of a gap metric.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Quote */}
            <div className="reveal-on-scroll mt-16 space-y-8 border-t border-black/10 pt-10 text-center">
              <p className="font-serif text-lg italic text-gray-500">
                &ldquo;You don&apos;t need to label yourself. These terms help describe patterns —
                not define you.&rdquo;
              </p>
              <Link
                href="/glossary"
                className="focus-visible-ring inline-block rounded text-sm font-bold text-gray-900 underline transition hover:text-gray-600"
              >
                Return to Glossary Index
              </Link>
            </div>
          </div>
        </div>
      </section>

      <WFooterSection />
    </main>
  );
};

export default GlossaryTermPage;
