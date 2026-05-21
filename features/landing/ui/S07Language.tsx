import Link from "next/link";
import type { FC } from "react";

const S07Language: FC = () => {
  return (
    <section className="relative overflow-hidden bg-[#0A0510] px-4 pb-24 pt-14 text-white">
      <div className="relative mx-auto max-w-6xl">
        <div className="relative pt-16 pb-8">
          {/* Ambient glow */}
          <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-[500px] w-[600px] rounded-full bg-[rgba(46,1,71,0.2)] blur-[60px] mix-blend-screen" />

          {/* Section Header */}
          <div className="relative z-10 mb-28 flex flex-col items-center gap-8 text-center">
            <h2 className="font-serif text-4xl leading-tight tracking-[-0.025em] text-white sm:text-5xl md:text-[60px]">
              LoveIQ Gives You <span className="italic text-[#fe6839]">Language.</span>
            </h2>
            <p className="max-w-[944px] text-lg leading-7 text-[#d1d5db] sm:text-xl">
              Stop guessing. Get clarity, vocabulary, and a deeper understanding of
              <br className="hidden sm:block" /> the terms that define your connection. We decode
              the complex
              <br className="hidden sm:block" /> science of intimacy.
            </p>
          </div>

          {/* Glossary Interface Mockup */}
          <div className="relative mx-auto max-w-[1232px]">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[rgba(15,8,21,0.8)] shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_25px_50px_-12px_rgba(0,0,0,0.25)] backdrop-blur-[12px]">
              {/* Top gloss line */}
              <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

              <div className="flex min-h-[480px] flex-col lg:h-[550px] lg:flex-row">
                {/* Sidebar Navigation - Hidden on mobile */}
                <div className="hidden w-[340px] border-r border-white/5 bg-[rgba(10,5,16,0.5)] lg:block">
                  {/* Search Header */}
                  <div className="border-b border-white/5 bg-[rgba(10,5,16,0.2)] px-5 py-5 backdrop-blur-sm">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search terminology..."
                        className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-xs font-medium text-white/60 placeholder-[#6b7280] shadow-[inset_0_2px_4px_1px_rgba(0,0,0,0.2)] outline-none focus:border-white/20"
                        readOnly
                      />
                      <svg
                        className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7280]"
                        viewBox="0 0 18 18"
                        fill="none"
                      >
                        <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
                        <path
                          d="M12 12L16 16"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                    <div className="mt-3 flex items-center justify-between px-1">
                      <span className="text-[10px] font-bold uppercase tracking-[1px] text-[#6b7280]">
                        Recent Terms
                      </span>
                      <span className="text-[10px] font-medium text-[#fe6839]">Filter</span>
                    </div>
                  </div>

                  {/* Term List */}
                  <div className="space-y-1 p-3">
                    {/* Active Item */}
                    <div className="relative flex items-center justify-between overflow-hidden rounded-xl border border-[rgba(254,104,57,0.2)] bg-[rgba(254,104,57,0.1)] px-4 py-3 shadow-[0_0_15px_0_rgba(254,104,57,0.1)]">
                      <div className="absolute bottom-0 left-0 top-0 w-[2px] bg-[#fe6839]" />
                      <div className="space-y-0.5">
                        <p className="font-serif text-sm font-bold text-white">Responsive Desire</p>
                        <p className="text-[10px] font-medium tracking-[0.25px] text-[#fe6839]">
                          Physiology
                        </p>
                      </div>
                      <svg className="h-4 w-4 text-[#fe6839]" viewBox="0 0 16 16" fill="none">
                        <path
                          d="M6 12L10 8L6 4"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>

                    {/* Inactive Items */}
                    {[
                      { term: "Attachment Theory", category: "Psychology" },
                      { term: "The 5 Love Languages", category: "Expression" },
                      { term: "Compersion", category: "Ethics" },
                      { term: "Limerence", category: "Neuroscience" },
                      { term: "Erotic Intelligence", category: "Sexology" },
                    ].map((item, index) => (
                      <div
                        key={item.term}
                        className={`rounded-xl px-4 py-3 ${index >= 4 ? "opacity-40" : ""}`}
                      >
                        <div className="space-y-0.5">
                          <p className="font-serif text-sm font-medium text-[#9ca3af]">
                            {item.term}
                          </p>
                          <p className="text-[10px] font-medium tracking-[0.25px] text-[#4b5563]">
                            {item.category}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Definition Content Area */}
                <div
                  className="relative flex-1"
                  style={{
                    background: "linear-gradient(141deg, rgb(22, 13, 33) 0%, rgb(10, 5, 16) 100%)",
                  }}
                >
                  {/* Subtle radial glow */}
                  <div className="pointer-events-none absolute left-0 top-0 h-[200px] w-[200px] rounded-full bg-[rgba(46,1,71,0.2)] blur-[60px]" />

                  <div className="relative p-5 sm:p-6 lg:p-10">
                    {/* Back to Glossary */}
                    <div className="mb-4 flex items-center gap-2">
                      <svg className="h-3.5 w-3.5 text-[#6b7280]" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M9 11L5 7L9 3"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span className="text-[10px] font-bold uppercase tracking-[1px] text-[#6b7280]">
                        Back to Glossary
                      </span>
                    </div>

                    <div className="flex gap-10">
                      {/* Main Content Column */}
                      <div className="flex-1 space-y-4">
                        {/* Heading */}
                        <h3 className="font-serif text-2xl leading-[1.1] tracking-[-0.025em] text-white sm:text-3xl lg:text-[42px]">
                          Importance of
                          <br className="hidden sm:block" /> Sexuality
                        </h3>

                        {/* Pills */}
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex rounded-full border border-[rgba(254,104,57,0.35)] bg-[rgba(254,104,57,0.18)] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.5px] text-[#fe6839] shadow-[0_10px_24px_rgba(0,0,0,0.35)] [filter:blur(2.2px)] sm:px-3 sm:text-[10px]">
                            Trait &amp; Disposition
                          </span>
                          <span className="hidden rounded-full border border-white/15 bg-[rgba(255,255,255,0.12)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.5px] text-[#c9ced8] shadow-[0_10px_24px_rgba(0,0,0,0.35)] [filter:blur(2.2px)] sm:inline-flex">
                            Relationship Dynamics &amp; Intimacy
                          </span>
                          <span className="flex items-center gap-1.5 rounded-full border border-[rgba(236,72,153,0.3)] bg-[rgba(236,72,153,0.1)] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.5px] text-[#f472b6] sm:px-3 sm:text-[10px]">
                            <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                              <path
                                d="M6 1V11M1 6H11"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                              />
                            </svg>
                            Sensitive Topic
                          </span>
                        </div>

                        {/* Definition */}
                        <p className="font-serif text-base leading-7 text-[#e5e7eb] sm:text-lg lg:text-xl">
                          How central sex and sexual connection are to a person&apos;s overall
                          relationship satisfaction and sense of wellbeing.
                        </p>

                        {/* What This Really Means */}
                        <div className="space-y-3 pt-2">
                          <div className="flex items-center gap-2">
                            <svg className="h-4 w-4 text-[#fe6839]" viewBox="0 0 18 18" fill="none">
                              <path
                                d="M9 1.5V16.5M9 1.5L5 5.5M9 1.5L13 5.5"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            <span className="font-serif text-base font-bold text-white">
                              What This Really Means
                            </span>
                          </div>
                          <div className="space-y-3 text-sm leading-[1.55] text-[#9ca3af]">
                            <p>
                              For some people, sexual connection is a primary bonding channel; for
                              others, it is secondary to emotional intimacy, companionship, or
                              shared goals.
                            </p>
                            <p className="hidden sm:block">
                              Importance can shift with health, aging, parenting, and life stress,
                              and it is also shaped by culture and values.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Sidebar Column */}
                      <div className="hidden w-[180px] flex-shrink-0 space-y-6 lg:block">
                        {/* Related Terms */}
                        <div className="space-y-3">
                          <span className="font-serif text-sm font-bold text-white">
                            Related Terms
                          </span>
                          <div className="flex flex-col gap-2">
                            {[
                              "Relationship Satisfaction",
                              "Sexual Needs",
                              "Sexual Frequency Expectations",
                              "Affection Gap",
                              "Emotional Intimacy",
                            ].map((term) => (
                              <span
                                key={term}
                                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-[#9ca3af]"
                              >
                                {term}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Tags */}
                        <div className="space-y-3">
                          <span className="font-serif text-sm font-bold text-white">Tags</span>
                          <div className="flex flex-wrap gap-x-2 gap-y-1.5">
                            {[
                              "#importance-of-sex",
                              "#sexual-priorities",
                              "#relationship-satisfaction",
                              "#libido-compatibility",
                              "#intimacy-needs",
                              "#life-stages",
                            ].map((tag) => (
                              <span
                                key={tag}
                                className="text-[10px] font-medium tracking-[0.25px] text-[#fe6839]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Inside LoveIQ Box */}
                        <div className="relative overflow-hidden rounded-xl border border-[#2e0147] bg-[#1a0f24] p-4">
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[rgba(46,1,71,0.2)] to-transparent" />
                          <div className="relative space-y-2">
                            <span className="font-serif text-xs font-bold uppercase tracking-[0.7px] text-[#a78bfa]">
                              Inside LoveIQ
                            </span>
                            <p className="text-[11px] leading-[1.5] text-[#9ca3af]">
                              We identify patterns related to Importance of Sexuality by analyzing
                              responses in our assessment modules.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Top blur overlay - subtle blur for upper portion */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-[250px] rounded-t-3xl"
              style={{
                background:
                  "linear-gradient(180deg, rgba(167, 139, 250, 0.03) 0%, rgba(167, 139, 250, 0.02) 50%, rgba(167, 139, 250, 0.00) 100%)",
                backdropFilter: "blur(1.5px)",
                WebkitBackdropFilter: "blur(1.5px)",
              }}
            />

            {/* Bottom blur overlay - original Figma specs */}
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[380px]"
              style={{
                borderRadius: "58px 58px 24px 24px",
                background:
                  "linear-gradient(180deg, rgba(167, 139, 250, 0.00) 0.11%, rgba(167, 139, 250, 0.00) 24.82%, rgba(167, 139, 250, 0.01) 36.43%, rgba(167, 139, 250, 0.02) 51.68%, rgba(167, 139, 250, 0.03) 84.06%, rgba(167, 139, 250, 0.12) 99.89%)",
                filter: "blur(2px)",
                backdropFilter: "blur(2.55px)",
                WebkitBackdropFilter: "blur(2.55px)",
              }}
            />
          </div>

          {/* Bottom Link Button */}
          <div className="mt-16 flex justify-center">
            <Link
              href="/glossary"
              className="group inline-flex items-center gap-2 rounded-full border border-[#fe6839] px-8 py-4 text-base font-bold text-[#fe6839] transition-colors hover:bg-[#fe6839]/10"
            >
              Browse full glossary
              <svg
                className="h-4 w-4 transition-transform group-hover:translate-x-1"
                viewBox="0 0 16 16"
                fill="none"
              >
                <path
                  d="M3 8H13M13 8L9 4M13 8L9 12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </div>

          {/* Bottom ambient glow */}
          <div className="pointer-events-none absolute bottom-0 left-1/3 right-1/4 h-[300px] rounded-full bg-[rgba(254,104,57,0.05)] blur-[60px] mix-blend-screen" />
        </div>
      </div>
    </section>
  );
};

export default S07Language;
