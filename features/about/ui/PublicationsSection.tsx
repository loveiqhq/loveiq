"use client";

import type { FC } from "react";
import Link from "next/link";

const ArrowIcon: FC = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#6b7280"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M7 17 17 7" />
    <path d="M7 7h10v10" />
  </svg>
);

const publications = [
  {
    title: "Intimacy and sexual well-being in couples coping with sexual interest/arousal disorder",
    meta: "2025 • Oxford University",
    stagger: "",
    href: "https://pdfs.semanticscholar.org/de01/cf8611d105cb1839b265d021fbfc6075f162.pdf",
  },
  {
    title:
      "Associations of Intimacy, Partner Responsiveness, and Attachment-Related Emotional Needs With Sexual Desire",
    meta: "2021 • Frontiers in Psychology",
    stagger: "stagger-1",
    href: "https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2021.665967/full",
  },
  {
    title:
      "Maintaining Sexual Desire in Long-Term Relationships: A Systematic Review and Conceptual Model",
    meta: "2018 • Journal of Sex Research",
    stagger: "stagger-2",
    href: "https://bookshelftocouch.com/wp-content/uploads/2019/12/Maintaining-sexual-desire-in-long-term-Mark_Lasslo_2018.pdf",
  },
];

const PublicationsSection: FC = () => {
  return (
    <section id="publications" className="border-t border-white/5 bg-[#0A0510] px-6 py-16 md:py-24">
      <div className="mx-auto max-w-4xl">
        <div className="reveal-on-scroll mb-12 flex items-center justify-center gap-4">
          <div className="hidden h-px flex-1 bg-white/10 sm:block" aria-hidden />
          <h2 className="text-center font-serif text-2xl font-normal text-white sm:whitespace-nowrap">
            Latest Science &amp; Publications
          </h2>
          <div className="hidden h-px flex-1 bg-white/10 sm:block" aria-hidden />
        </div>

        <div className="flex flex-col gap-6">
          {publications.map((pub) => (
            <Link
              key={pub.title}
              href={pub.href}
              className={`reveal-on-scroll ${pub.stagger} group relative block`}
              target="_blank"
            >
              <div className="relative overflow-hidden rounded-xl border border-white/5 bg-[#120B1C] p-6 transition-all duration-500 ease-out hover:-translate-y-1 hover:border-[#a855f7]/50 hover:shadow-[0_0_30px_-5px_rgba(168,85,247,0.15)]">
                <div className="pointer-events-none absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-[#a855f7]/0 via-[#a855f7]/5 to-[#a855f7]/0 transition-transform duration-1000 ease-in-out group-hover:translate-x-[100%]" />
                <div className="relative z-10 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="mb-2 font-sans text-lg font-semibold tracking-tight text-white transition-colors duration-300 group-hover:text-[#a855f7]">
                      {pub.title}
                    </h3>
                    <p className="font-sans text-xs font-medium text-gray-500 transition-colors group-hover:text-gray-400">
                      {pub.meta}
                    </p>
                  </div>
                  <div className="shrink-0 text-gray-500 transition-colors duration-300 group-hover:text-[#a855f7]">
                    <ArrowIcon />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PublicationsSection;
