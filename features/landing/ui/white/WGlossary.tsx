import type { FC } from "react";
import Link from "next/link";

// A few representative terms; the full set lives at /glossary.
const sampleTerms = [
  {
    term: "Responsive desire",
    definition:
      "Sexual interest that emerges in response to context, intimacy, or stimulation — rather than appearing on its own.",
  },
  {
    term: "Spontaneous desire",
    definition: "Sexual interest that arises seemingly out of nowhere, without an obvious trigger.",
  },
  {
    term: "Desire discrepancy",
    definition:
      "A mismatch between partners in how much, how often, or in what way they want intimacy.",
  },
];

const WGlossary: FC = () => {
  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="content-shell grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-16">
        <div className="animate-on-scroll flex flex-col gap-5">
          <h2 className="font-serif text-3xl font-medium text-[#161021] sm:text-[40px]">
            LoveIQ gives you language.
          </h2>
          <p className="text-[17px] leading-relaxed text-[#6b6678]">
            Naming what you feel is the first step to understanding it. Our glossary turns the
            science of intimacy into plain, usable words.
          </p>
          <Link
            href="/glossary"
            className="focus-visible-ring inline-flex w-fit items-center gap-2 rounded-xl border border-black/15 px-5 py-3 text-sm font-semibold text-[#161021] transition hover:bg-black/[0.04]"
          >
            <span>Browse full glossary</span>
            <svg
              aria-hidden
              className="h-4 w-4 text-accent-orange"
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

        <div className="animate-on-scroll flex flex-col gap-3">
          {sampleTerms.map((t) => (
            <div
              key={t.term}
              className="rounded-2xl border border-black/[0.08] bg-[#f5f6f8] px-6 py-5"
            >
              <h3 className="font-serif text-lg font-bold text-[#161021]">{t.term}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-[#6b6678]">{t.definition}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WGlossary;
