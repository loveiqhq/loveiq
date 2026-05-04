"use client";

import type { FC } from "react";
import { trackStartSurvey } from "@/lib/analytics";

const S14CTA: FC = () => {
  return (
    <section className="section-shell relative overflow-hidden bg-gradient-to-br from-[#1a0d25] via-[#0f0a18] to-[#2a1640] px-4 text-text-primary">
      {/* Animated floating gradient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-[5%] left-[5%] h-[250px] w-[250px] md:h-[500px] md:w-[500px] md:top-[10%] md:left-[15%] rounded-full bg-[rgba(242,109,79,0.25)] blur-[30px] md:blur-[40px] animate-float1" />
        <div className="absolute top-[15%] right-[0%] h-[200px] w-[200px] md:h-[400px] md:w-[400px] md:top-[20%] md:right-[10%] rounded-full bg-[rgba(124,88,255,0.28)] blur-[25px] md:blur-[35px] animate-float2" />
        <div className="absolute bottom-[5%] left-[20%] h-[220px] w-[220px] md:h-[450px] md:w-[450px] md:bottom-[10%] md:left-[40%] rounded-full bg-[rgba(111,63,255,0.24)] blur-[28px] md:blur-[38px] animate-float3" />
        <div className="absolute top-[40%] left-[0%] h-[150px] w-[150px] md:h-[300px] md:w-[300px] md:top-[50%] md:left-[5%] rounded-full bg-[rgba(254,104,57,0.2)] blur-[20px] md:blur-[30px] animate-float4" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-noise opacity-12" />
      <div className="content-shell relative flex max-w-5xl flex-col items-center gap-8 text-center">
        <div className="space-y-8">
          <h2 className="font-serif text-[48px] leading-[1.05] font-semibold sm:text-[60px] md:text-[72px] md:leading-[1.05]">
            Ready to understand{" "}
            <span className="relative inline-block -top-1 align-baseline italic text-[#FE6839]">
              and grow?
              <div className="pointer-events-none mt-[2px]">
                <svg
                  viewBox="0 0 320 16"
                  fill="none"
                  preserveAspectRatio="none"
                  className="h-[14px] w-full"
                >
                  <path
                    d="M6 6 C 110 18, 210 18, 314 6"
                    stroke="#FE6839"
                    strokeWidth="6"
                    strokeLinecap="round"
                    opacity="0.7"
                  />
                </svg>
              </div>
            </span>
          </h2>
          <p className="text-lg leading-relaxed text-white/85">
            Join us to build stronger relationships, communicate with real clarity, and step into
            confident, authentic sexuality.
          </p>
        </div>

        <div className="flex flex-col items-center gap-6">
          <a
            href="/survey"
            aria-label="Start test now - take the first step"
            className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-brand px-8 py-3 text-base font-semibold text-white shadow-pill transition hover:translate-y-[-2px] focus-visible-ring"
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
              Start test now
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
          </a>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75 sm:text-xs">
            <svg
              aria-hidden
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <span>Takes 15 minutes</span>
            <span className="h-1.5 w-1.5 rounded-full bg-white/60" aria-hidden />
            <span>No account required</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default S14CTA;
