"use client";

import type { FC } from "react";

// Illustration for Educational Assessments - Survey card matching Figma design
const SurveyIllustration: FC = () => (
  <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-3xl border border-white/5 bg-[#0A0510] transition-colors group-hover:border-white/10">
    {/* Ambient Glow */}
    <div className="absolute left-0 top-0 h-full w-full bg-gradient-to-br from-[#2E0147]/40 via-[#0A0510] to-[#0A0510]" />
    <div className="absolute -left-10 -top-10 h-32 w-32 rounded-full bg-[#FE6839]/10 blur-2xl" />

    {/* Main Card UI */}
    <div className="relative z-10 w-[80%]">
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#1a1025] p-5 shadow-2xl transition-all duration-500 ease-out group-hover:-translate-y-2 group-hover:border-[#FE6839]/20 group-hover:shadow-[0_20px_40px_-12px_rgba(254,104,57,0.25)]">
        {/* Gradient sheen (from Figma) */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
        {/* Shine sweep on hover */}
        <div className="pointer-events-none absolute inset-0 h-full w-[200%] -translate-x-[150%] skew-x-12 bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-1000 ease-in-out group-hover:translate-x-[100%]" />

        {/* Top row: orange progress pill + white indicator */}
        <div className="mb-4 flex items-center justify-between">
          <div className="h-2 w-16 rounded-full bg-[#FE6839]" />
          <div className="h-2 w-8 rounded-full bg-white/10" />
        </div>

        {/* Question text lines */}
        <div className="mb-5 space-y-2 pb-1">
          <div className="h-2 w-3/4 rounded-full bg-white/20" />
          <div className="h-2 w-1/2 rounded-full bg-white/10" />
        </div>

        {/* Options */}
        <div className="space-y-2">
          <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/5 p-2.5 transition-colors duration-300 group-hover:bg-white/[0.07]">
            <div className="h-3 w-3 shrink-0 rounded-full border border-white/30" />
            <div className="h-1.5 w-full rounded-full bg-white/20" />
          </div>

          <div className="relative flex items-center gap-3 overflow-hidden rounded-lg border border-[#FE6839]/30 bg-[#FE6839]/10 p-2.5">
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-[#FE6839]/0 via-[#FE6839]/10 to-[#FE6839]/0 transition-transform duration-1000 group-hover:translate-x-full" />
            <div className="relative flex h-3 w-3 shrink-0 items-center justify-center rounded-full border-2 border-[#FE6839] shadow-[0_0_8px_rgba(254,104,57,0.4)]">
              <div className="h-1.5 w-1.5 rounded-full bg-[#FE6839]" />
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/30" />
          </div>
        </div>
      </div>
    </div>
  </div>
);

// Illustration for Practical Reports - Chart UI with animations
const ReportsIllustration: FC = () => (
  <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-3xl border border-white/5 bg-[#0A0510] transition-colors group-hover:border-white/10">
    {/* Ambient Glow */}
    <div className="absolute right-0 top-0 h-full w-full bg-gradient-to-bl from-[#FE6839]/10 via-[#0A0510] to-[#0A0510]" />

    {/* Main Card UI */}
    <div className="relative w-[80%] transform overflow-hidden rounded-xl border border-white/10 bg-[#1a1025] p-5 shadow-2xl transition-transform duration-500 group-hover:-translate-y-1">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3 border-b border-white/5 pb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FE6839]/20 text-[#FE6839]">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
            <line x1="3" x2="21" y1="9" y2="9" />
            <path d="m9 16 2 2 4-4" />
          </svg>
        </div>
        <div>
          <div className="mb-1 h-2 w-16 rounded-full bg-white/30" />
          <div className="h-1.5 w-10 rounded-full bg-white/10" />
        </div>
      </div>

      {/* Animated Bar Chart */}
      <div className="flex h-16 items-end justify-between gap-2 px-1">
        <div className="h-[40%] w-full rounded-sm bg-white/5 transition-all duration-700 ease-out group-hover:h-[50%]" />
        <div className="h-[60%] w-full rounded-sm bg-white/10 transition-all delay-75 duration-700 ease-out group-hover:h-[75%]" />
        <div className="h-[80%] w-full rounded-sm bg-gradient-to-t from-[#FE6839] to-[#fe8c68] shadow-[0_0_15px_rgba(254,104,57,0.3)] transition-all delay-150 duration-700 ease-out group-hover:h-[95%]" />
        <div className="h-[50%] w-full rounded-sm bg-white/5 transition-all delay-100 duration-700 ease-out group-hover:h-[45%]" />
      </div>
    </div>
  </div>
);

// Illustration for Guided Growth - Video Player UI with animations
const GrowthIllustration: FC = () => (
  <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-3xl border border-white/5 bg-[#0A0510] transition-colors group-hover:border-white/10">
    {/* Ambient Glow */}
    <div className="absolute bottom-0 left-1/2 h-full w-full -translate-x-1/2 bg-gradient-to-t from-[#2E0147]/60 to-transparent" />

    {/* Main Card UI */}
    <div className="w-[80%] transform overflow-hidden rounded-xl border border-white/10 bg-[#1a1025] shadow-2xl transition-transform duration-500 group-hover:-translate-y-1">
      {/* Video Preview Area */}
      <div className="relative flex aspect-video items-center justify-center bg-[#050208] transition-colors group-hover:bg-[#0A0510]">
        {/* Play Button with animation */}
        <div className="z-10 flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur-sm transition-all duration-300 group-hover:scale-110 group-hover:border-[#FE6839] group-hover:bg-[#FE6839] group-hover:text-white">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </div>

        {/* Fake Waveform */}
        <div className="absolute bottom-0 left-0 right-0 flex h-12 items-end justify-center gap-1 pb-3 opacity-30">
          <div className="h-4 w-1 rounded-full bg-white" />
          <div className="h-6 w-1 rounded-full bg-white" />
          <div className="h-3 w-1 rounded-full bg-white" />
          <div className="h-8 w-1 rounded-full bg-white" />
          <div className="h-5 w-1 rounded-full bg-white" />
        </div>
      </div>

      {/* Details */}
      <div className="border-t border-white/5 p-3">
        <div className="mb-2 h-2 w-3/4 rounded-full bg-white/20" />
        <div className="flex gap-2">
          <div className="h-1.5 w-8 rounded-full bg-[#FE6839]/50" />
          <div className="h-1.5 w-12 rounded-full bg-white/10" />
        </div>
      </div>
    </div>
  </div>
);

const SolutionSection: FC = () => {
  const solutions = [
    {
      title: "Educational Assessments",
      description: "Educational and guided tests for psychometric assessments.",
      illustration: <SurveyIllustration />,
      stagger: "",
    },
    {
      title: "Practical Reports",
      description: "Science first and practical reports on psychometric conditions (non medical).",
      illustration: <ReportsIllustration />,
      stagger: "stagger-1",
    },
    {
      title: "Guided Growth",
      description:
        "Tools, services, workshops and coaching to take insights into life changing actions.",
      illustration: <GrowthIllustration />,
      stagger: "stagger-2",
    },
  ];

  return (
    <section id="solution" className="border-t border-white/5 bg-[#0A0510] px-6 py-16 md:py-24">
      <div className="content-shell">
        {/* Header - Left aligned */}
        <div className="reveal-on-scroll mb-20 space-y-6 px-0 sm:px-14">
          <h2 className="font-serif text-3xl font-normal leading-[1] tracking-tight text-white md:text-5xl">
            Our Solution
          </h2>
          <p className="max-w-[672px] text-lg font-light leading-[1.4] text-[#9CA3AF]">
            We build tools that transform self-understanding into concrete actions — from how we
            communicate and set boundaries, to how we build trust, navigate desire, and show up in
            relationships.
          </p>
        </div>

        {/* Cards */}
        <div className="grid gap-8 md:grid-cols-3">
          {solutions.map((item) => (
            <div
              key={item.title}
              className={`reveal-on-scroll ${item.stagger} group flex w-full flex-col gap-8 rounded-[2rem] border border-white/5 bg-[#120B1C] p-3 transition-all duration-300 hover:border-[#FE6839]/30`}
            >
              {/* Illustration area */}
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[1.5rem]">
                {item.illustration}
              </div>

              {/* Content */}
              <div className="space-y-3 px-3 pb-6">
                <h3 className="font-serif text-2xl font-normal leading-[1.33] text-white">
                  {item.title}
                </h3>
                <p className="pr-4 text-sm font-light leading-relaxed text-gray-400">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default SolutionSection;
