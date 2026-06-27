"use client";

import type { FC } from "react";
import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import WNavSection from "@features/landing/ui/white/WNavSection";
import WFooterSection from "@features/landing/ui/white/WFooterSection";
import { trackStartSurvey } from "@features/analytics/client";
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
  }, [activeFilter, searchQuery, allTerms]);

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

    // Sort each group alphabetically. `letter` is taken from Object.keys(grouped).
    for (const letter of Object.keys(grouped)) {
      grouped[letter]!.sort((a, b) => a.term.localeCompare(b.term));
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

  return (
    <main className="relative min-h-screen bg-white text-gray-900">
      <WNavSection />

      {/* Hero Section */}
      <section className="relative pt-32 pb-8 sm:pt-40 sm:pb-12">
        <div className="content-shell">
          <div className="relative z-10 mx-auto max-w-[768px] text-center">
            <h1 className="reveal-on-scroll font-serif text-4xl font-normal leading-[1.1] tracking-[-1.5px] text-gray-900 sm:text-5xl md:text-[61px]">
              The LoveIQ{" "}
              <span className="bg-gradient-to-r from-[#d05976] via-[#c167cf] to-[#8887f6] bg-clip-text text-transparent">
                Glossary
              </span>
            </h1>
            <p className="reveal-on-scroll stagger-1 mt-6 text-lg leading-7 text-gray-500 sm:text-xl">
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
            <div className="reveal-on-scroll stagger-2 relative">
              {/* Icon — top-aligned on mobile (first text line), centered on desktop */}
              <div className="absolute left-5 top-[25px] sm:top-1/2 sm:-translate-y-1/2">
                <svg
                  className="h-[18px] w-[18px] text-gray-600"
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

              {/* Mobile: textarea so placeholder wraps to 2 lines */}
              <textarea
                rows={2}
                aria-label="Search glossary terms"
                placeholder="Search a term or concept (e.g. 'Arousal', 'Boundaries')"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value.replace(/\n/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
                }}
                className="w-full resize-none rounded-3xl border border-black/[0.08] bg-[#f4f4f6] py-[22px] pl-[50px] pr-[25px] text-base text-gray-900 transition placeholder:text-gray-600 hover:border-black/20 focus:border-2 focus:border-[rgba(254,104,57,0.6)] focus:bg-white focus:outline-none focus:ring-0 sm:hidden"
              />

              {/* Desktop: single-line input */}
              <input
                type="text"
                aria-label="Search glossary terms"
                placeholder="Search a term or concept (e.g. 'Arousal', 'Boundaries')"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="hidden w-full rounded-full border border-black/[0.08] bg-[#f4f4f6] pb-[19px] pl-[49px] pr-[25px] pt-[20px] text-base text-gray-900 transition placeholder:text-gray-600 hover:border-black/20 focus:border-2 focus:border-[rgba(254,104,57,0.6)] focus:bg-white focus:outline-none focus:ring-0 sm:block"
              />
            </div>

            {/* Filter Pills */}
            <div className="reveal-on-scroll stagger-3 mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="py-2 pr-2 text-xs font-semibold uppercase tracking-[1.2px] text-gray-500">
                Filter By:
              </span>
              {filterCategories.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setActiveFilter(filter.id)}
                  aria-pressed={activeFilter === filter.id}
                  className={`focus-visible-ring rounded-full px-[13px] py-2 text-xs transition ${
                    activeFilter === filter.id
                      ? "border border-[#fe6839] bg-[rgba(254,104,57,0.1)] font-semibold text-[#C2410C]"
                      : "border border-black/[0.08] bg-black/[0.03] text-gray-600 hover:border-black/20 hover:text-gray-900"
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
          <div className="reveal-on-scroll stagger-4 px-0 sm:px-12">
            <div className="scrollbar-hide flex items-center gap-1 overflow-x-auto rounded-full border border-black/[0.06] bg-white p-2 shadow-[0_8px_32px_rgba(0,0,0,0.06)] sm:justify-center">
              {alphabet.map((letter) => (
                <button
                  key={letter}
                  onClick={() => scrollToLetter(letter)}
                  disabled={!hasTermsForLetterFiltered(letter)}
                  aria-label={`Jump to terms starting with ${letter}`}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[24px] text-[10px] font-bold transition-all duration-200 ${
                    activeLetter === letter && hasTermsForLetterFiltered(letter)
                      ? "bg-[#a78bfa] text-[#1a1330]"
                      : hasTermsForLetterFiltered(letter)
                        ? "text-gray-500 hover:text-gray-800 hover:shadow-[0_0_15px_0_rgba(167,139,250,0.32)]"
                        : "cursor-not-allowed text-gray-300"
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
                  <div className="mb-8 border-b border-black/[0.08] pb-4">
                    <span className="font-serif text-5xl text-gray-300">{letter}</span>
                  </div>

                  {/* Terms List */}
                  <div className="flex flex-col gap-4">
                    {terms.map((item, idx) => (
                      <Link
                        key={`${item.slug}-${idx}`}
                        href={`/glossary/${item.slug}`}
                        className="group focus-visible-ring block rounded"
                      >
                        <span className="font-serif text-xl leading-7 text-gray-900 transition-colors group-hover:text-[#C2410C] group-focus:text-[#C2410C]">
                          {item.term}
                        </span>
                        <span className="flex max-h-0 items-center gap-1 overflow-hidden text-[10px] font-bold uppercase tracking-[1px] text-[#C2410C] opacity-0 transition-all duration-300 group-hover:mt-1 group-hover:max-h-5 group-hover:opacity-100 group-focus:mt-1 group-focus:max-h-5 group-focus:opacity-100">
                          View details
                          <svg
                            className="h-3 w-3"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden
                          >
                            <path d="M5 12h14" />
                            <path d="m12 5 7 7-7 7" />
                          </svg>
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
          </div>

          {/* No results message */}
          {Object.keys(filteredTerms).length === 0 && (
            <div className="py-16 text-center">
              <p className="text-lg text-gray-500">
                No terms found matching your search or filter criteria.
              </p>
              <button
                onClick={() => {
                  handleSearchChange("");
                  setActiveFilter("all");
                }}
                className="focus-visible-ring mt-4 rounded font-semibold text-[#C2410C] hover:underline"
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
          <div className="reveal-on-scroll mx-auto max-w-2xl text-center">
            <h2 className="font-serif text-3xl leading-[1.15] tracking-[-1px] text-gray-900 sm:text-[42px]">
              Ready to understand{" "}
              <span className="bg-gradient-to-r from-[#fe6839] to-[#c36ddf] bg-clip-text text-transparent">
                and grow?
              </span>
            </h2>
            <p className="mx-auto mt-5 max-w-md text-base leading-7 text-gray-500 sm:text-lg">
              Join us to build stronger relationships, communicate with real clarity, and step into
              confident, authentic sexuality.
            </p>
            <div className="mt-8">
              <Link
                href="/survey"
                className="focus-visible-ring group inline-flex items-center justify-center gap-2 rounded-full bg-black px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-gray-800"
                onClick={() => trackStartSurvey("footer")}
              >
                <span>Start test now</span>
                <svg
                  aria-hidden
                  className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5"
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
            <p className="mt-6 text-sm text-gray-500">
              Anonymous by default · 15 minutes · No account required
            </p>
          </div>
        </div>
      </section>

      <WFooterSection />
    </main>
  );
};

export default GlossaryPage;
