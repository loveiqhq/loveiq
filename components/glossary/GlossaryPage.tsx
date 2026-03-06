"use client";

import type { FC } from "react";
import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import GlossaryNavSection from "./GlossaryNavSection";
import FooterSection from "@/components/landing/FooterSection";
import { trackStartSurvey } from "@/lib/analytics";
import type { GlossaryTerm } from "@/data/glossary-data";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const filterCategories = [
  { id: "all", label: "All Terms" },
  { id: "pattern", label: "Pattern & Dynamic" },
  { id: "desire", label: "Desire & Arousal" },
  { id: "sensitive", label: "Sensitive Topics" },
  { id: "frameworks", label: "Frameworks" },
];

const GlossaryPage: FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [allTerms, setAllTerms] = useState<GlossaryTerm[]>([]);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") ?? "");
  const [activeFilter, setActiveFilter] = useState("all");
  const [activeLetter, setActiveLetter] = useState("A");

  // Lazy-load the full glossary data (688KB) only when this page is visited
  useEffect(() => {
    import("@/data/glossary-data").then((mod) => setAllTerms(mod.glossaryTerms));
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    const params = new URLSearchParams();
    if (value) params.set("q", value);
    router.replace(params.size > 0 ? `${pathname}?${params.toString()}` : pathname, {
      scroll: false,
    });
  };

  // Re-run observer when filters/search change to observe newly rendered elements
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

    // Small delay to let React render new elements after filter change
    const timeoutId = setTimeout(() => {
      document.querySelectorAll(".reveal-on-scroll:not(.is-visible)").forEach((element) => {
        observer.observe(element);
      });
    }, 50);

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [activeFilter, searchQuery]);

  // Group terms by first letter
  const termsByLetter = useMemo(() => {
    const grouped: Record<string, GlossaryTerm[]> = {};

    for (const term of allTerms) {
      const firstLetter = term.term.charAt(0).toUpperCase();
      if (!grouped[firstLetter]) {
        grouped[firstLetter] = [];
      }
      grouped[firstLetter].push(term);
    }

    // Sort each group alphabetically
    for (const letter of Object.keys(grouped)) {
      grouped[letter].sort((a, b) => a.term.localeCompare(b.term));
    }

    return grouped;
  }, [allTerms]);

  const scrollToLetter = (letter: string) => {
    setActiveLetter(letter);
    const element = document.getElementById(`section-${letter}`);
    if (element) {
      const offset = 200;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;
      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  const hasTermsForLetter = (letter: string) => {
    return termsByLetter[letter] && termsByLetter[letter].length > 0;
  };

  const filteredTerms = useMemo(() => {
    const result: Record<string, GlossaryTerm[]> = {};

    for (const [letter, terms] of Object.entries(termsByLetter)) {
      const filtered = terms.filter((term) => {
        const matchesSearch =
          term.term.toLowerCase().includes(searchQuery.toLowerCase()) ||
          term.definition.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = activeFilter === "all" || term.category === activeFilter;
        return matchesSearch && matchesFilter;
      });

      if (filtered.length > 0) {
        result[letter] = filtered;
      }
    }

    return result;
  }, [termsByLetter, searchQuery, activeFilter]);

  // Check if any letter has terms for current filter
  const hasTermsForLetterFiltered = (letter: string) => {
    return filteredTerms[letter] && filteredTerms[letter].length > 0;
  };

  const renderTermWithArrow = (term: string) => {
    const words = term.trim().split(/\s+/);
    const leadingWords = words.slice(0, -1).join(" ");
    const lastWord = words[words.length - 1] ?? "";

    return (
      <>
        {leadingWords ? `${leadingWords} ` : ""}
        <span className="inline-flex items-center whitespace-nowrap">
          {lastWord}
          <svg
            className="ml-2 inline-block h-4 w-4 align-middle text-[#fe6839] opacity-0 transition-opacity group-hover:opacity-100"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </span>
      </>
    );
  };

  return (
    <main className="relative bg-[#0A0510] text-white min-h-screen">
      <GlossaryNavSection />

      {/* Hero Section */}
      <section className="relative pt-32 pb-8 sm:pt-40 sm:pb-12">
        {/* Purple background orb */}
        <div
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full"
          style={{
            width: "600px",
            height: "600px",
            top: "80px",
            background: "radial-gradient(circle, #2E014780 50%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
        <div className="content-shell">
          <div className="mx-auto max-w-[768px] text-center relative z-10">
            <h1 className="font-serif text-4xl sm:text-5xl md:text-[61px] font-normal tracking-[-1.5px] leading-[1.1] reveal-on-scroll">
              The LoveIQ{" "}
              <span className="bg-gradient-to-r from-[#fe6839] via-[#a78bfa] to-[#e9d5ff] bg-clip-text text-transparent">
                Glossary
              </span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-[#9ca3af] leading-7 reveal-on-scroll stagger-1">
              Your guide to the terminology of self-understanding. Decode the language of
              <br className="hidden sm:block" />
              intimacy, psychology, and personal growth.
            </p>
          </div>
        </div>
      </section>

      {/* Search and Filters */}
      <section className="relative py-6">
        <div className="content-shell">
          <div className="mx-auto max-w-[768px]">
            {/* Search Input */}
            <div className="relative reveal-on-scroll stagger-2">
              <div className="absolute left-5 top-1/2 -translate-y-1/2">
                <svg
                  className="h-[18px] w-[18px] text-white/30"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search a term or concept (e.g. 'Arousal', 'Boundaries')"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full rounded-full border border-white/10 bg-white/[0.03] py-5 pl-[49px] pr-6 text-base text-white placeholder:text-white/30 hover:bg-white/[0.05] hover:border-white/50 focus:border-2 focus:border-[rgba(254,104,57,0.6)] focus:bg-white/[0.03] focus:outline-none focus:ring-0 transition"
              />
            </div>

            {/* Filter Pills */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 reveal-on-scroll stagger-3">
              <span className="pr-2 py-2 text-xs font-semibold uppercase tracking-[1.2px] text-white/30">
                Filter By:
              </span>
              {filterCategories.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setActiveFilter(filter.id)}
                  className={`rounded-full px-[13px] py-2 text-xs transition ${
                    activeFilter === filter.id
                      ? "border border-[#fe6839] bg-[rgba(254,104,57,0.1)] text-[#fe6839]"
                      : "border border-white/10 bg-white/5 text-white/60 hover:border-white/50 hover:text-white/80 hover:font-medium"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Alphabetical Navigation */}
      <section className="relative py-4 sm:py-8">
        <div className="content-shell">
          <div className="px-0 sm:px-12 reveal-on-scroll stagger-4">
            <div className="flex items-center justify-center gap-1 rounded-full border border-white/5 bg-[rgba(10,5,16,0.6)] p-2 shadow-[0_8px_32px_rgba(0,0,0,0.36)] backdrop-blur-[20px] overflow-x-auto scrollbar-hide">
              {alphabet.map((letter) => (
                <button
                  key={letter}
                  onClick={() => scrollToLetter(letter)}
                  disabled={!hasTermsForLetterFiltered(letter)}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[24px] text-[10px] font-bold transition-all duration-200 ${
                    activeLetter === letter && hasTermsForLetterFiltered(letter)
                      ? "bg-[#a78bfa] text-[#120b1c]"
                      : hasTermsForLetterFiltered(letter)
                        ? "text-white/30 hover:text-white/60 hover:shadow-[0_0_15px_0_rgba(167,139,250,0.32)]"
                        : "cursor-not-allowed text-white/10"
                  }`}
                >
                  {letter}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Glossary Grid */}
      <section className="relative py-8 sm:py-16">
        <div className="content-shell">
          <div className="grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(filteredTerms)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([letter, terms]) => (
                <div key={letter} id={`section-${letter}`} className="reveal-on-scroll">
                  {/* Letter Header */}
                  <div className="border-b border-white/5 pb-4 mb-8 backdrop-blur-[2px]">
                    <span className="font-serif text-5xl text-white/20">{letter}</span>
                  </div>

                  {/* Terms List */}
                  <div className="flex flex-col gap-4">
                    {terms.map((item, idx) => (
                      <Link
                        key={`${item.slug}-${idx}`}
                        href={`/glossary/${item.slug}`}
                        className="group flex items-center gap-2"
                      >
                        <span className="font-serif text-xl leading-7 text-white transition-colors group-hover:text-[#fe6839]">
                          {renderTermWithArrow(item.term)}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
          </div>

          {/* No results message */}
          {Object.keys(filteredTerms).length === 0 && (
            <div className="text-center py-16">
              <p className="text-white/50 text-lg">
                No terms found matching your search or filter criteria.
              </p>
              <button
                onClick={() => {
                  handleSearchChange("");
                  setActiveFilter("all");
                }}
                className="mt-4 text-[#fe6839] hover:underline"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-16 sm:py-24">
        <div className="content-shell">
          <div
            className="relative overflow-hidden rounded-[24px] border border-white/10 px-6 py-16 sm:px-12 sm:py-20 reveal-on-scroll"
            style={{ background: "linear-gradient(135deg, #1A0F26 0%, #0A0510 100%)" }}
          >
            {/* Background gradient orbs */}
            <div
              className="pointer-events-none absolute rounded-full animate-float1"
              style={{
                width: "256px",
                height: "256px",
                left: "-128px",
                bottom: "-116.5px",
                background: "rgba(254, 104, 57, 0.10)",
                filter: "blur(40px)",
              }}
            />
            <div
              className="pointer-events-none absolute rounded-full animate-float2"
              style={{
                width: "256px",
                height: "256px",
                right: "-79px",
                top: "-107.5px",
                background: "rgba(254, 104, 57, 0.10)",
                filter: "blur(40px)",
              }}
            />

            <div className="relative z-10 mx-auto max-w-2xl text-center">
              <h2 className="font-serif text-3xl sm:text-4xl text-white mb-4">
                Want deeper insight?
              </h2>
              <p className="text-[#9ca3af] text-base sm:text-lg mb-8">
                Your assessment results connect these concepts directly to your personal
                <br className="hidden sm:block" />
                patterns and relationship dynamics.
              </p>
              <Link
                href="/waitlist"
                className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-brand px-6 py-3 text-sm font-semibold text-white shadow-pill transition hover:translate-y-[-2px] focus-visible-ring"
                onClick={() => trackStartSurvey("footer")}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-white opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                />
                <div
                  aria-hidden
                  className="absolute inset-0 translate-y-full bg-white/20 transition-transform duration-300 group-hover:translate-y-0"
                />
                <span className="pointer-events-none absolute inset-0 rounded-full bg-white/10 opacity-0 transition duration-300 group-hover:opacity-100" />
                <span className="pointer-events-none absolute inset-[-12%] rounded-full border border-white/15 mix-blend-screen opacity-70" />
                <span className="relative z-10 transition-colors duration-500 group-hover:text-black">
                  Start survey now
                </span>
                <svg
                  aria-hidden
                  className="relative z-10 h-5 w-5 transition-colors duration-500 group-hover:text-black"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
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

      <FooterSection />
    </main>
  );
};

export default GlossaryPage;
