import type { FC } from "react";
import Link from "next/link";

/**
 * White-variant glossary section (Figma node 7828:10899): centered heading + a
 * light "Glossary Explorer" mockup (sidebar term list, term detail, related
 * terms), then a "Browse full glossary" link.
 */

const recentTerms = [
  { term: "Responsive desire", cat: "Disposition", active: true },
  { term: "Spontaneous desire", cat: "Psychology" },
  { term: "Attachment theory", cat: "Psychology" },
  { term: "Desire discrepancy", cat: "Relational" },
  { term: "Eroticism", cat: "Sociology" },
  { term: "Limerence", cat: "Psychology" },
  { term: "Secure base", cat: "Psychology" },
];

const WGlossary: FC = () => {
  return (
    <section className="bg-white py-16 lg:py-24">
      <div className="content-shell">
        <div className="animate-on-scroll mx-auto mb-12 max-w-2xl text-center">
          <div className="mb-3 flex items-center justify-center gap-2.5">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent-orange" />
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#6b6678]">
              Glossary
            </span>
          </div>
          <h2 className="font-serif text-3xl font-medium leading-tight text-[#161021] sm:text-[40px]">
            LoveIQ gives you{" "}
            <span className="bg-gradient-to-r from-[#fe6839] via-[#bf66d9] to-[#958ef6] bg-clip-text italic text-transparent">
              language.
            </span>
          </h2>
          <p className="mt-3 text-[16px] leading-relaxed text-[#69707d]">
            Stop guessing. Get clarity, vocabulary, and a deeper understanding of the terms that
            define your connection — we decode the complex science of intimacy, one word at a time.
          </p>
        </div>

        {/* Glossary Explorer mockup */}
        <div className="animate-on-scroll overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-[0_20px_50px_rgba(0,0,0,0.07)]">
          <div className="flex items-center justify-between border-b border-black/[0.06] bg-[#f5f6f8] px-5 py-3">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[#6f6c78]">
              Glossary Explorer
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-[#6f6c78]">
              7 terms indexed
            </span>
          </div>
          <div className="grid lg:grid-cols-[210px_1fr_190px]">
            {/* Sidebar */}
            <div className="hidden flex-col gap-3 border-r border-black/[0.06] p-5 lg:flex">
              <div className="flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-[12px] text-[#6f6c78]">
                <svg
                  aria-hidden
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" strokeLinecap="round" />
                </svg>
                Search terminology
              </div>
              <span className="mt-1 text-[9px] font-bold uppercase tracking-wide text-[#706d75]">
                Recent terms
              </span>
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                {recentTerms.map((t) => (
                  <li
                    key={t.term}
                    className={`flex flex-col rounded-md px-2.5 py-2 ${t.active ? "bg-[#f5f6f8]" : ""}`}
                  >
                    <span
                      className={`text-[13px] ${t.active ? "font-bold text-[#161021]" : "font-medium text-[#3f3a4d]"}`}
                    >
                      {t.term}
                    </span>
                    <span className="text-[9px] uppercase tracking-wide text-[#706d75]">
                      {t.cat}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Term detail */}
            <div className="flex flex-col gap-4 p-6 sm:p-8">
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#6f6c78]">
                ← Back to glossary
              </span>
              <h3 className="font-serif text-3xl font-medium text-[#161021]">Responsive desire</h3>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-black/[0.04] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#6b6678]">
                  Desire & arousal
                </span>
                <span className="rounded-full bg-[#bf66d9]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#9a4dbf]">
                  Disposition
                </span>
              </div>
              <p className="text-[15px] leading-relaxed text-[#3f3a4d]">
                A pattern of desire that emerges in response to emotional connection, touch, or
                context rather than appearing spontaneously.
              </p>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-orange" />
                <span className="text-[10px] font-bold uppercase tracking-wide text-[#6f6c78]">
                  What this really means
                </span>
              </div>
              <p className="text-[13.5px] leading-relaxed text-[#69707d]">
                For a great many people, wanting does not switch on by itself. It warms in response
                to context: safety, attention, touch, the sense of being chosen. Nothing is wrong;
                the order is reversed.
              </p>
              <p className="text-[13.5px] leading-relaxed text-[#69707d]">
                If you wait to feel like it before you begin, you may wait a long time. Responsive
                desire asks you to create the conditions first, and let the wanting catch up.
              </p>
              <div className="rounded-xl bg-[#f5f6f8] p-4">
                <span className="text-[10px] font-bold uppercase tracking-wide text-[#9a4dbf]">
                  Insider · clinical
                </span>
                <p className="mt-1.5 font-serif text-[13px] italic leading-relaxed text-[#69707d]">
                  In our data, partners who can name where their desire is responsive report
                  markedly fewer conflicts about frequency.
                </p>
              </div>
            </div>

            {/* Related terms */}
            <div className="hidden flex-col gap-5 border-l border-black/[0.06] p-5 lg:flex">
              <div className="flex flex-col gap-2">
                <span className="text-[9px] font-bold uppercase tracking-wide text-[#706d75]">
                  Related terms
                </span>
                {["Spontaneous desire", "Desire discrepancy"].map((t) => (
                  <span
                    key={t}
                    className="rounded-lg border border-black/[0.06] px-3 py-2 text-[12px] font-medium text-[#3f3a4d]"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[9px] font-bold uppercase tracking-wide text-[#706d75]">
                  Tags
                </span>
                <div className="flex flex-col gap-1 text-[12px] text-[#69707d]">
                  <span>desire · arousal</span>
                  <span>intimacy needs</span>
                  <span>self-knowledge</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-center">
          <Link
            href="/glossary"
            className="focus-visible-ring inline-flex items-center gap-2 rounded-full border border-black/15 px-5 py-2.5 text-sm font-semibold text-[#161021] transition hover:bg-black/[0.04]"
          >
            <span>Browse full glossary</span>
            <svg
              aria-hidden
              className="h-4 w-4 text-accent-orange-ink"
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
      </div>
    </section>
  );
};

export default WGlossary;
