"use client";

import type { FC } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import type { GlossaryTerm } from "@/data/glossary-data";
import GlossaryNavSection from "./GlossaryNavSection";
import FooterSection from "@features/landing/ui/FooterSection";

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
    <div
      className="rounded-xl overflow-hidden transition-colors duration-300 ease"
      style={{
        border: isRevealed ? "1px solid rgba(52,211,153,0.15)" : "1px solid rgba(255,255,255,0.05)",
      }}
    >
      {/* Myth row — clickable */}
      <button
        type="button"
        onClick={() => setIsRevealed(!isRevealed)}
        className="flex w-full cursor-pointer select-none items-center gap-3 p-4 bg-[rgba(244,63,94,0.08)] text-left transition-colors duration-200 ease hover:bg-[rgba(244,63,94,0.12)]"
        aria-expanded={isRevealed}
        aria-controls={cardId}
      >
        <div className="shrink-0 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(248,113,113,0.2)]">
          <svg
            className="h-3 w-3 text-[#f87171]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#f87171]">
            Myth
          </span>
          <p className="text-white/90 text-sm leading-relaxed mt-0.5">{myth}</p>
        </div>
        {/* Chevron */}
        <svg
          className="h-4 w-4 shrink-0 text-white/30 transition-transform duration-300"
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
            <div className="flex gap-3 items-start p-4 bg-[rgba(52,211,153,0.05)] border-t border-white/5">
              <div className="shrink-0 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(52,211,153,0.2)]">
                <svg
                  className="h-3 w-3 text-[#34d399]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#34d399]">
                  Reality
                </span>
                <p className="text-white/70 text-sm leading-relaxed mt-0.5">{reality}</p>
              </div>
            </div>
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
    <main className="relative bg-[#0A0510] text-white min-h-screen">
      <GlossaryNavSection />

      {/* Background blur orbs */}
      <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-[-11px] h-[831px] w-[997px] rounded-full bg-[rgba(46,1,71,0.3)] blur-[100px] animate-glossary-orb-center" />
      <div className="pointer-events-none absolute left-[calc(50%-781px)] -translate-x-1/2 top-[1300px] h-[556px] w-[667px] rounded-full bg-[rgba(46,1,71,0.5)] blur-[100px] animate-glossary-orb-left" />
      <div className="pointer-events-none absolute left-[calc(50%+750px)] -translate-x-1/2 top-[894px] h-[556px] w-[667px] rounded-full bg-[rgba(46,1,71,0.5)] blur-[100px] animate-glossary-orb-right" />

      {/* Main Content */}
      <section className="relative pt-32 pb-16 sm:pt-36">
        <div className="content-shell">
          <div className="mx-auto max-w-[896px]">
            {/* Breadcrumb */}
            <Link
              href="/glossary"
              className="inline-flex items-center gap-2 text-white/40 text-xs font-semibold uppercase tracking-[1.2px] hover:text-white/60 transition reveal-on-scroll"
            >
              <svg
                className="h-3 w-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
              Back to Glossary
            </Link>

            {/* Term Header */}
            <div className="mt-12 space-y-6 reveal-on-scroll stagger-1">
              <h1 className="font-serif text-4xl sm:text-5xl md:text-[60px] font-medium tracking-[-1.5px] leading-[1.1] text-white">
                {term.term}
              </h1>

              {/* Category Pills */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Type pill - orange */}
                <span className="rounded-full border border-[rgba(254,104,57,0.2)] bg-[rgba(254,104,57,0.1)] px-[13px] py-[5px] text-xs font-bold uppercase tracking-[0.6px] text-[#fe6839]">
                  {term.type}
                </span>
                {/* Domain pill - gray */}
                <span className="rounded-full border border-white/10 bg-white/5 px-[13px] py-[5px] text-xs font-semibold tracking-[0.3px] text-white/60">
                  {term.domain}
                </span>
                {/* Sensitivity pill - green for general, different for sensitive */}
                <span
                  className={`rounded-full border px-[13px] py-[5px] text-xs font-semibold tracking-[0.3px] inline-flex items-center gap-1.5 ${
                    term.sensitivityLevel === "General"
                      ? "border-[rgba(16,185,129,0.2)] bg-[rgba(16,185,129,0.1)] text-[#34d399]"
                      : "border-[rgba(244,63,94,0.2)] bg-[rgba(244,63,94,0.1)] text-[#fb7185]"
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
            <div className="mt-12 reveal-on-scroll stagger-2">
              <p className="font-serif text-2xl sm:text-[30px] leading-[1.4] text-white/90">
                {term.definition}
              </p>
            </div>

            {/* Two Column Layout */}
            <div className="mt-12 flex flex-col lg:flex-row gap-12">
              {/* Main Content Column */}
              <div className="flex-1 space-y-16">
                {/* What This Really Means Section */}
                {term.extendedNotes && (
                  <div className="space-y-6 reveal-on-scroll stagger-3">
                    <div className="flex items-center gap-3">
                      <svg
                        className="h-5 w-5"
                        viewBox="0 0 20 20"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
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
                      <h2 className="font-serif text-xl font-medium text-white">
                        What This Really Means
                      </h2>
                    </div>
                    <div className="text-[#9ca3af] text-base leading-6 space-y-4">
                      {term.extendedNotes.split(/(?<=\.)(?=\s+[A-Z])/).map((paragraph, i) => (
                        <p key={i}>{paragraph.trim()}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Examples Section */}
                {term.examples.length > 0 && (
                  <div className="space-y-6 reveal-on-scroll stagger-4">
                    <h2 className="font-serif text-xl font-medium text-white">Examples</h2>
                    <div className="space-y-4">
                      {term.examples.map((example, i) => (
                        <div
                          key={i}
                          className="flex gap-4 items-start p-[17px] rounded-xl bg-white/5 border border-white/5"
                        >
                          <div className="shrink-0 pt-1">
                            <svg
                              className="h-4 w-4"
                              viewBox="0 0 16 16"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                d="M6.10281 3.6055C6.94747 2.09083 7.36947 1.3335 8.00081 1.3335C8.63214 1.3335 9.05414 2.09083 9.89881 3.6055L10.1175 3.9975C10.3575 4.42816 10.4775 4.6435 10.6641 4.7855C10.8508 4.9275 11.0841 4.98016 11.5508 5.0855L11.9748 5.1815C13.6148 5.55283 14.4341 5.73816 14.6295 6.3655C14.8241 6.99216 14.2655 7.64616 13.1475 8.9535L12.8581 9.2915C12.5408 9.66283 12.3815 9.84883 12.3101 10.0782C12.2388 10.3082 12.2628 10.5562 12.3108 11.0515L12.3548 11.5028C12.5235 13.2475 12.6081 14.1195 12.0975 14.5068C11.5868 14.8942 10.8188 14.5408 9.28414 13.8342L8.88614 13.6515C8.45014 13.4502 8.23214 13.3502 8.00081 13.3502C7.76947 13.3502 7.55147 13.4502 7.11547 13.6515L6.71814 13.8342C5.18281 14.5408 4.41481 14.8942 3.90481 14.5075C3.39347 14.1195 3.47814 13.2475 3.64681 11.5028L3.69081 11.0522C3.73881 10.5562 3.76281 10.3082 3.69081 10.0788C3.62014 9.84883 3.46081 9.66283 3.14347 9.29216L2.85414 8.9535C1.73614 7.64683 1.17747 6.99283 1.37214 6.3655C1.56681 5.73816 2.38747 5.55216 4.02747 5.1815L4.45147 5.0855C4.91747 4.98016 5.15014 4.9275 5.33747 4.7855C5.52481 4.6435 5.64414 4.42816 5.88414 3.9975L6.10281 3.6055"
                                stroke="#FE6839"
                              />
                            </svg>
                          </div>
                          <p className="text-[#d1d5db] text-base font-light leading-6">{example}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Common Misunderstandings Section */}
                {term.misinterpretations.length > 0 && (
                  <div className="space-y-6 reveal-on-scroll stagger-5">
                    <div className="flex items-center gap-3">
                      <svg
                        className="h-5 w-5 text-[#fecdd3]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" x2="12" y1="8" y2="12" />
                        <line x1="12" x2="12.01" y1="16" y2="16" />
                      </svg>
                      <h2 className="font-serif text-xl font-medium text-[#fecdd3]">
                        Common Misunderstandings
                      </h2>
                    </div>
                    <p className="text-xs text-white/30 -mt-2">
                      Tap each myth to reveal the reality
                    </p>
                    <div className="space-y-4">
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
              <div className="lg:w-[267px] space-y-8 reveal-on-scroll stagger-4">
                {/* Related Terms */}
                {relatedTermsWithLinks.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="font-serif text-sm font-semibold text-white">Related Terms</h3>
                    <div className="flex flex-wrap gap-2">
                      {relatedTermsWithLinks.map((related, i) =>
                        related.slug ? (
                          <Link
                            key={i}
                            href={`/glossary/${related.slug}`}
                            className="rounded-lg bg-white/5 border border-white/5 px-[13px] py-[9px] text-xs text-[#9ca3af] hover:bg-white/10 hover:text-white transition"
                          >
                            {related.name}
                          </Link>
                        ) : (
                          <span
                            key={i}
                            className="rounded-lg bg-white/5 border border-white/5 px-[13px] py-[9px] text-xs text-[#9ca3af]"
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
                    <h3 className="font-serif text-sm font-semibold text-white">Tags</h3>
                    <div className="flex flex-wrap gap-x-2 gap-y-2">
                      {term.tags.map((tag, i) => (
                        <span key={i} className="text-xs text-[rgba(254,104,57,0.7)]">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Inside LoveIQ Card */}
                <div className="rounded-2xl border border-white/10 p-6 space-y-4 bg-gradient-to-br from-[rgba(46,1,71,0.5)] to-[#0a0510]">
                  <h3 className="font-serif text-sm font-semibold uppercase tracking-[1.4px] text-[#a78bfa]">
                    Inside LoveIQ
                  </h3>
                  <p className="text-sm font-light leading-[1.625] text-[#9ca3af]">
                    We identify patterns related to {term.term} by analyzing responses in our
                    assessment modules, helping you understand your unique relationship dynamics.
                  </p>
                  <div className="space-y-2">
                    <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#fe6839] via-[#a78bfa] to-[#e9d5ff]"
                        style={{ width: "66%" }}
                      />
                    </div>
                    <p className="text-xs text-white/30">Sample visualization of a gap metric.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Quote */}
            <div className="mt-16 pt-10 border-t border-white/10 text-center space-y-8 reveal-on-scroll">
              <p className="font-serif text-lg italic text-white/40">
                &ldquo;You don&apos;t need to label yourself. These terms help describe patterns —
                not define you.&rdquo;
              </p>
              <Link
                href="/glossary"
                className="inline-block text-sm font-bold text-white underline hover:text-white/80 transition"
              >
                Return to Glossary Index
              </Link>
            </div>
          </div>
        </div>
      </section>

      <FooterSection />
    </main>
  );
};

export default GlossaryTermPage;
