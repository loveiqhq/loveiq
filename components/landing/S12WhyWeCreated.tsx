import type { FC } from "react";

const S12WhyWeCreated: FC = () => {
  return (
    <section
      className="section-shell relative overflow-hidden bg-[#0A0510] px-4 text-text-primary"
      aria-labelledby="why-heading"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute right-[-120px] top-1/2 h-[380px] w-[380px] -translate-y-1/2 rounded-full bg-[#fe6839]/10 blur-[90px]" />
        <div className="absolute left-[-80px] top-1/2 h-[420px] w-[420px] -translate-y-1/2 rounded-full bg-[#541475]/10 blur-[100px]" />
      </div>

      <div className="content-shell relative flex flex-col items-center gap-12 animate-on-scroll">
        <div className="max-w-5xl space-y-4 text-center">
          <h2 id="why-heading" className="font-serif text-[48px] leading-tight text-white">
            Why we created{" "}
            <span className="bg-gradient-to-r from-[#fe6839] to-[#a78bfa] bg-clip-text text-transparent">
              LoveIQ?
            </span>
          </h2>
          <p className="mx-auto max-w-[940px] font-medium text-[20px] leading-[28px] text-center text-[#d1d5db]">
            <span className="hidden sm:inline">
              Positive sexual well-being is highly linked to lower stress, anxiety, and depression,
              better cardiovascular health, and higher relationship satisfaction. Therefore we want
              to make sexuality something we can explore with curiosity, confidence, and care — not
              shame or confusion.
            </span>
            <span className="sm:hidden">
              <span className="block">Positive sexual well-being is highly</span>
              <span className="block">linked to lower stress, anxiety, and</span>
              <span className="block">depression, better cardiovascular</span>
              <span className="block">health, and higher relationship</span>
              <span className="block">satisfaction.</span>
              <span className="block h-[28px]" />
              <span className="block">Therefore we want to make sexuality</span>
              <span className="block">something we can explore with</span>
              <span className="block">curiosity, confidence, and care — not</span>
              <span className="block">shame or confusion.</span>
            </span>
          </p>
        </div>

        <div className="grid w-full gap-6 md:grid-cols-3 animate-on-scroll">
          {/* Card 1 - Women/Men bars - Purple hover */}
          <div className="group relative overflow-hidden rounded-[40px] border border-white/10 bg-[#150A22] p-3 shadow-[0_10px_44px_-3px_rgba(167,139,250,0.1),0_4px_6px_-5px_#A78BFA] transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_10px_44px_-3px_rgba(167,139,250,0.25),0_4px_6px_-5px_#A78BFA]">
            <div
              className="pointer-events-none absolute inset-[-1px] rounded-[40px] bg-gradient-to-b from-[#A78BFA]/30 to-transparent opacity-0 blur-[4px] transition-opacity duration-500 group-hover:opacity-100"
              aria-hidden
            />
            <div className="relative flex flex-col">
              {/* Inner black box */}
              <div className="relative flex h-[200px] flex-col rounded-[24px] border border-white/5 bg-[#0A0510] px-5 pt-4 pb-5">
                {/* Dots inside inner box */}
                <div className="mb-4 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[rgba(84,20,117,0.4)]" />
                  <span className="h-2 w-2 rounded-full bg-white/20" />
                  <span className="h-2 w-2 rounded-full bg-white/20" />
                </div>

                <div className="flex flex-1 flex-col items-center justify-center gap-4">
                  <div className="flex w-full max-w-[220px] items-center justify-between text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
                    <span>Women</span>
                    <span>Men</span>
                  </div>

                  <div className="relative flex w-full max-w-[220px] flex-col gap-4">
                    <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
                      <div className="absolute inset-y-0 left-0 w-[42%] rounded-full bg-[#a78bfa] shadow-[0_0_10px_rgba(139,92,246,0.3)]" />
                      <div className="absolute inset-y-0 right-0 w-[54%] rounded-full bg-[#fe6839]" />
                    </div>
                    <div className="relative">
                      <span className="absolute -top-12 left-[42%] -translate-x-1/2 rounded-md bg-[#541475] px-2 py-1 text-[10px] font-bold text-white opacity-0 shadow-lg transition-all duration-300 group-hover:-translate-y-1 group-hover:opacity-100">
                        42%
                        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 block h-2 w-2 rotate-45 bg-[#541475]" />
                      </span>
                      <span className="absolute -top-2 right-[28%] translate-x-1/2 rounded-md border border-white/10 bg-[#1e102e] px-2 py-1 text-[10px] font-bold text-[#a78bfa] opacity-0 shadow-lg transition-all duration-300 delay-75 group-hover:translate-y-0 group-hover:opacity-100">
                        54%
                        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 block h-2 w-2 rotate-45 border-l border-t border-white/10 bg-[#2a1838]" />
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-white/70">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-colors duration-300 group-hover:bg-[#541475]/20">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <circle cx="7" cy="5.5" r="3.5" stroke="#F3F4F6" strokeWidth="1.2" />
                        <line
                          x1="7"
                          y1="9"
                          x2="7"
                          y2="13"
                          stroke="#F3F4F6"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                        />
                        <line
                          x1="5"
                          y1="11"
                          x2="9"
                          y2="11"
                          stroke="#F3F4F6"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-colors duration-300 group-hover:bg-[#8b5cf6]/20">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <circle cx="5.5" cy="8.5" r="3.5" stroke="#F3F4F6" strokeWidth="1.2" />
                        <line
                          x1="8.5"
                          y1="5.5"
                          x2="13"
                          y2="1"
                          stroke="#F3F4F6"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                        />
                        <polyline
                          points="9,1 13,1 13,5"
                          stroke="#F3F4F6"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Text below inner box */}
              <div className="mt-5 space-y-2 px-4 pb-4 text-center">
                <p className="text-xl font-semibold text-white">42% - 54%</p>
                <p className="text-sm leading-relaxed text-text-secondary">
                  of women and men in long-term relationships report sexual dissatisfaction.
                </p>
              </div>
            </div>
          </div>

          {/* Card 2 - Satisfaction circle - Orange hover */}
          <div className="group relative overflow-hidden rounded-[40px] border border-white/10 bg-[#150A22] p-3 shadow-[0_10px_44px_-3px_rgba(167,139,250,0.1),0_4px_6px_-5px_#A78BFA] transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_10px_44px_-3px_rgba(254,104,57,0.25),0_4px_6px_-5px_#fe6839]">
            <div
              className="pointer-events-none absolute inset-[-1px] rounded-[40px] bg-gradient-to-b from-[#fe6839]/30 to-transparent opacity-0 blur-[4px] transition-opacity duration-500 group-hover:opacity-100"
              aria-hidden
            />
            <div className="relative flex flex-col">
              {/* Inner black box */}
              <div className="relative flex h-[200px] flex-col rounded-[24px] border border-white/5 bg-[#0A0510] px-5 pt-4 pb-5">
                {/* Dots inside inner box */}
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#8b5cf6]" />
                  <span className="h-2 w-2 rounded-full bg-white/20" />
                  <span className="h-2 w-2 rounded-full bg-white/20" />
                </div>

                <div className="flex flex-1 items-center justify-center">
                  <div className="relative flex h-28 w-28 items-center justify-center">
                    <svg
                      className="h-full w-full -rotate-90 transition-transform duration-700 group-hover:scale-105"
                      viewBox="0 0 120 120"
                      fill="none"
                    >
                      <defs>
                        <linearGradient id="gaugeArc" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#fe8458" />
                          <stop offset="100%" stopColor="#fe6839" />
                        </linearGradient>
                      </defs>
                      <circle cx="60" cy="60" r="48" stroke="#2a2432" strokeWidth="8" />
                      <circle
                        cx="60"
                        cy="60"
                        r="48"
                        stroke="url(#gaugeArc)"
                        strokeWidth="8"
                        strokeDasharray="301.59"
                        strokeDashoffset="241"
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-[10px] rounded-full border border-[#26212f] bg-[#0f0a18]" />
                    <div className="absolute inset-0 flex items-center justify-center text-center">
                      <div className="leading-tight">
                        <p className="text-xl font-semibold text-white">20%</p>
                        <p className="text-[8px] uppercase tracking-[0.15em] text-white/55">
                          Satisfaction
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-[10px] border border-white/10 bg-[#1e102e]/90 px-2.5 py-1.5 text-[10px] font-semibold text-white shadow-[0_16px_30px_rgba(0,0,0,0.25)] transition-all duration-500 translate-y-3 opacity-0 group-hover:translate-y-0 group-hover:opacity-100">
                  <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-[#fe6839]" />
                  <span>Live Data</span>
                </div>
              </div>

              {/* Text below inner box */}
              <div className="mt-5 space-y-2 px-4 pb-4 text-center">
                <p className="text-xl font-semibold text-white">Only 20%</p>
                <p className="text-sm leading-relaxed text-text-secondary">
                  of adults say they&apos;re satisfied with their sex life.
                </p>
              </div>
            </div>
          </div>

          {/* Card 3 - Fulfillment gap - Purple hover */}
          <div className="group relative overflow-hidden rounded-[40px] border border-white/10 bg-[#150A22] p-3 shadow-[0_10px_44px_-3px_rgba(167,139,250,0.1),0_4px_6px_-5px_#A78BFA] transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_10px_44px_-3px_rgba(167,139,250,0.25),0_4px_6px_-5px_#A78BFA]">
            <div
              className="pointer-events-none absolute inset-[-1px] rounded-[40px] bg-gradient-to-b from-[#A78BFA]/30 to-transparent opacity-0 blur-[4px] transition-opacity duration-500 group-hover:opacity-100"
              aria-hidden
            />
            <div className="relative flex flex-col">
              {/* Inner black box */}
              <div className="relative flex h-[200px] flex-col rounded-[24px] border border-white/5 bg-[#0A0510] px-5 pt-4 pb-5">
                {/* Dots inside inner box */}
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#2e0147]" />
                  <span className="h-2 w-2 rounded-full bg-white/20" />
                  <span className="h-2 w-2 rounded-full bg-white/20" />
                </div>

                <div className="flex flex-1 flex-col items-center justify-center gap-4 pt-2">
                  {/* Message-circle-heart app icon */}
                  <div
                    className="flex h-16 w-16 items-center justify-center rounded-[16px] border border-white/5 shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-4px_rgba(0,0,0,0.1)] transition-transform duration-500 group-hover:scale-105"
                    style={{
                      backgroundImage:
                        "linear-gradient(135deg, rgb(46,1,71) 0%, rgb(84,20,117) 100%)",
                    }}
                  >
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 32 32"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M28 15c0 6.627-5.373 12-12 12a11.94 11.94 0 01-5.5-1.333L4 28l2.333-6.5A11.94 11.94 0 014 16C4 9.373 9.373 4 16 4s12 5.373 12 11z"
                        stroke="white"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M16 14.5c0-1.105.895-2 2-2s2 .895 2 2c0 2-2 3.5-4 4.5-2-1-4-2.5-4-4.5a2 2 0 012-2c.828 0 1.572.503 2 1.5z"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>

                  {/* Bar chart widget */}
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="inline-flex h-[51px] items-end gap-[6px] rounded-[8px] border border-white/5 bg-white/5 px-[17px] py-[9px]">
                      <div className="h-3 w-1.5 rounded-t-[2px] bg-[#2e0147]" />
                      <div className="h-5 w-1.5 rounded-t-[2px] bg-[rgba(46,1,71,0.8)]" />
                      <div className="h-2 w-1.5 rounded-t-[2px] bg-[rgba(46,1,71,0.6)]" />
                      <div className="h-4 w-1.5 rounded-t-[2px] bg-[rgba(46,1,71,0.4)]" />
                      <div className="h-8 w-1.5 rounded-t-[2px] bg-[rgba(239,68,68,0.8)]" />
                    </div>
                    <p className="text-[10px] font-semibold text-[#f97316] opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                      Fulfillment Gap Detected
                    </p>
                  </div>
                </div>
              </div>

              {/* Text below inner box */}
              <div className="mt-5 space-y-2 px-4 pb-4 text-center">
                <p className="text-xl font-semibold text-white">&lt; 50%</p>
                <p className="text-sm leading-relaxed text-text-secondary">
                  Nearly two-thirds say their sex life shapes their happiness — yet less than half
                  feel fulfilled.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default S12WhyWeCreated;
