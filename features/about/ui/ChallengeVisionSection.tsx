"use client";

import type { FC } from "react";

const IconContainer: FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
    {children}
  </div>
);

const ZapIcon: FC = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M3.99999 13.9999C3.81076 14.0006 3.62522 13.9475 3.46495 13.8469C3.30467 13.7463 3.17623 13.6023 3.09454 13.4316C3.01286 13.2609 2.98129 13.0705 3.00349 12.8826C3.0257 12.6946 3.10077 12.5169 3.21999 12.3699L13.12 2.16992C13.1943 2.0842 13.2955 2.02628 13.407 2.00565C13.5185 1.98503 13.6337 2.00293 13.7337 2.05642C13.8337 2.10991 13.9126 2.19582 13.9573 2.30003C14.0021 2.40424 14.0101 2.52057 13.98 2.62992L12.06 8.64992C12.0034 8.80144 11.9844 8.96444 12.0046 9.12493C12.0248 9.28541 12.0837 9.4386 12.1761 9.57135C12.2685 9.70409 12.3918 9.81243 12.5353 9.88708C12.6788 9.96172 12.8382 10.0004 13 9.99992H20C20.1892 9.99927 20.3748 10.0523 20.535 10.1529C20.6953 10.2535 20.8238 10.3976 20.9054 10.5683C20.9871 10.739 21.0187 10.9293 20.9965 11.1173C20.9743 11.3052 20.8992 11.483 20.78 11.6299L10.88 21.8299C10.8057 21.9156 10.7045 21.9736 10.593 21.9942C10.4815 22.0148 10.3663 21.9969 10.2663 21.9434C10.1663 21.8899 10.0874 21.804 10.0427 21.6998C9.99791 21.5956 9.98991 21.4793 10.02 21.3699L11.94 15.3499C11.9966 15.1984 12.0156 15.0354 11.9954 14.8749C11.9752 14.7144 11.9163 14.5612 11.8239 14.4285C11.7315 14.2957 11.6082 14.1874 11.4647 14.1128C11.3212 14.0381 11.1617 13.9994 11 13.9999H3.99999Z"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const GoalIcon: FC = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 13V2L20 6L12 10"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M20.5612 10.2219C21.0933 11.862 21.1431 13.6205 20.7046 15.2881C20.2661 16.9558 19.3578 18.4623 18.0877 19.6286C16.8177 20.7948 15.2393 21.5717 13.5404 21.8667C11.8415 22.1617 10.0936 21.9625 8.50473 21.2928C6.91581 20.623 5.55272 19.5109 4.57766 18.0888C3.60259 16.6666 3.05658 14.9943 3.00458 13.2708C2.95259 11.5473 3.3968 9.8451 4.28437 8.36677C5.17194 6.88844 6.46551 5.6962 8.01117 4.93188"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M8.00238 9.75C7.50129 10.417 7.17506 11.1988 7.05343 12.0242C6.93179 12.8496 7.01862 13.6922 7.30599 14.4754C7.59336 15.2587 8.07214 15.9575 8.69871 16.5084C9.32529 17.0592 10.0797 17.4445 10.8933 17.6292C11.7069 17.8138 12.5538 17.792 13.3567 17.5656C14.1597 17.3392 14.8933 16.9155 15.4906 16.3331C16.0879 15.7507 16.53 15.028 16.7766 14.231C17.0232 13.434 17.0664 12.588 16.9024 11.77"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const EyeIcon: FC = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M2.06202 12.3481C1.97868 12.1236 1.97868 11.8766 2.06202 11.6521C2.87372 9.68397 4.25153 8.00116 6.02079 6.81701C7.79004 5.63287 9.87106 5.00073 12 5.00073C14.129 5.00073 16.21 5.63287 17.9792 6.81701C19.7485 8.00116 21.1263 9.68397 21.938 11.6521C22.0214 11.8766 22.0214 12.1236 21.938 12.3481C21.1263 14.3163 19.7485 15.9991 17.9792 17.1832C16.21 18.3674 14.129 18.9995 12 18.9995C9.87106 18.9995 7.79004 18.3674 6.02079 17.1832C4.25153 15.9991 2.87372 14.3163 2.06202 12.3481Z"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ChallengeVisionSection: FC = () => {
  return (
    <section id="challenge-vision" className="relative bg-[#0A0510] px-6 py-16 md:py-24">
      <div className="content-shell relative z-10">
        {/* Top row: Challenge + Mission */}
        <div className="grid gap-6 lg:grid-cols-[1.65fr_1fr]">
          {/* The Challenge Card */}
          <div
            className="reveal-on-scroll group relative overflow-hidden rounded-[32px] border border-white/10 p-12"
            style={{
              backgroundImage:
                "linear-gradient(155deg, rgba(31, 16, 41, 1) 0%, rgba(10, 5, 16, 1) 100%)",
            }}
          >
            {/* Hover glow effect */}
            <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 bg-[#FE6839] opacity-5 blur-[80px] transition-opacity duration-700 group-hover:opacity-10" />
            <div className="flex flex-col gap-6">
              <IconContainer>
                <ZapIcon />
              </IconContainer>
              <h3 className="font-serif text-[32px] font-normal leading-[1.125] text-white">
                The Challenge
              </h3>
              <p className="max-w-[629px] text-base leading-[1.8] text-[#9CA3AF]">
                <span className="text-white">
                  Most people navigate personal growth guided by instinct, guesswork, or outdated
                  knowledge.{" "}
                </span>
                Yet personal growth is the most influential force in our lives, shaping our
                happiness, mental health, general health, confidence, and sense of belonging.
              </p>
            </div>
          </div>

          {/* Our Mission Card */}
          <div
            className="reveal-on-scroll stagger-1 relative overflow-hidden rounded-[32px] border border-white/10 p-12"
            style={{
              backgroundImage:
                "linear-gradient(143deg, rgba(31, 16, 41, 1) 0%, rgba(10, 5, 16, 1) 100%)",
            }}
          >
            <div className="flex flex-col gap-6">
              <IconContainer>
                <GoalIcon />
              </IconContainer>
              <h3 className="font-serif text-[32px] font-normal leading-[1] text-white">
                Our Mission
              </h3>
              <p className="text-base leading-[1.8] text-[#9CA3AF]">
                We exist to{" "}
                <span className="text-white">
                  help people understand their emotional patterns and grow
                </span>
                , so we can build healthier relationships, communicate more honestly, and live with
                greater confidence, connection, and fulfillment.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom row: Our Vision */}
        <div
          className="reveal-on-scroll stagger-2 mt-6 overflow-hidden rounded-[32px] border border-white/10 p-12"
          style={{
            backgroundImage:
              "linear-gradient(163deg, rgba(31, 16, 41, 1) 0%, rgba(10, 5, 16, 1) 100%)",
          }}
        >
          <div className="flex flex-col items-center gap-12 lg:flex-row">
            {/* Left content */}
            <div className="flex flex-1 flex-col gap-6">
              <IconContainer>
                <EyeIcon />
              </IconContainer>
              <h3 className="font-serif text-[32px] font-medium leading-[1] text-white">
                Our Vision
              </h3>
              <p className="max-w-[540px] text-base leading-[1.8] text-[#9CA3AF]">
                <span className="text-white">
                  Our vision is to become the world&apos;s most trusted platform for human
                  self-understanding &amp; personal growth.
                </span>{" "}
                Starting with sexuality and expanding to the full emotional and psychological human
                experience. Because self-understanding &amp; growth is one of the highest-leverage
                drivers of human happiness, relationship quality, and mental health. Things truly
                needed in our world today.
              </p>
            </div>

            {/* Animated Vision Visual */}
            <div className="group relative flex h-64 min-h-[250px] w-full items-center justify-center overflow-hidden rounded-2xl border border-white/5 bg-[#0A0510] md:h-full lg:w-[543px]">
              {/* Animation Keyframes */}
              <style jsx>{`
                @keyframes mist-cycle {
                  0% {
                    opacity: 0;
                    transform: scale(0.9) translateY(4px);
                    filter: blur(8px);
                  }
                  15% {
                    opacity: 1;
                    transform: scale(1) translateY(0);
                    filter: blur(0px);
                  }
                  35% {
                    opacity: 1;
                    transform: scale(1) translateY(0);
                    filter: blur(0px);
                  }
                  50% {
                    opacity: 0;
                    transform: scale(1.05) translateY(-4px);
                    filter: blur(6px);
                  }
                  100% {
                    opacity: 0;
                  }
                }
                @keyframes pulse-core {
                  0%,
                  100% {
                    transform: scale(1);
                    opacity: 0.3;
                  }
                  50% {
                    transform: scale(1.2);
                    opacity: 0.5;
                  }
                }
                @keyframes rotate-slow {
                  0% {
                    transform: rotate(0deg);
                  }
                  100% {
                    transform: rotate(360deg);
                  }
                }
              `}</style>

              {/* Ambient Background */}
              <div className="absolute inset-0 bg-gradient-to-b from-[#2E0147]/10 via-[#0A0510] to-[#0A0510]" />
              <div className="absolute h-48 w-48 animate-[pulse-core_6s_ease-in-out_infinite] rounded-full bg-[#FE6839] opacity-10 blur-[90px]" />

              {/* Orbit Ring */}
              <div className="absolute h-[180px] w-[180px] animate-[rotate-slow_30s_linear_infinite] rounded-full border border-dashed border-white/10 opacity-30" />

              {/* Sequence Content Container */}
              <div className="relative flex h-full w-full items-center justify-center">
                {/* Phase 1: Identity (Fingerprint) */}
                <div className="absolute flex flex-col items-center justify-center opacity-0 mix-blend-plus-lighter animate-[mist-cycle_12s_ease-in-out_infinite_0s]">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#a855f7]/30 bg-gradient-to-b from-[#a855f7]/20 to-[#a855f7]/5 text-[#e9d5ff] shadow-[0_0_30px_rgba(168,85,247,0.25)] backdrop-blur-md">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-2.6 4" />
                      <path d="M14 13.12c0-2.38 0-6.38-5-6.38-1.7 0-2.6 1.6-2.6 1.6" />
                      <path d="m2 16 6-6" />
                      <path d="M17.48 10.52c.96.93.52 2.92.52 2.92" />
                      <path d="M18 16c0-1.29-.62-2.3-2-2.3" />
                      <path d="M10 21v-1a2 2 0 0 1 2-2 2 2 0 0 1 2 2v1" />
                      <path d="M2 12h.01" />
                      <path d="M21.8 16c.2-2 .13-2.42-1.1-4.2-.27-.4-.28-1.13.1-1.3.47-.21.98-.18 1.2.2.14.24.2.4.2.6" />
                    </svg>
                  </div>
                  <div className="mt-4 text-[11px] font-mono font-semibold uppercase tracking-[0.2em] text-[#e9d5ff] opacity-90 drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]">
                    Identity
                  </div>
                </div>

                {/* Phase 2: Needs (Heart - Filled) */}
                <div className="absolute flex flex-col items-center justify-center opacity-0 mix-blend-plus-lighter animate-[mist-cycle_12s_ease-in-out_infinite_4s]">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#c084fc]/30 bg-gradient-to-b from-[#c084fc]/20 to-[#9333ea]/10 text-[#f3e8ff] shadow-[0_0_30px_rgba(192,132,252,0.25)] backdrop-blur-md">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      stroke="none"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                    </svg>
                  </div>
                  <div className="mt-4 text-[11px] font-mono font-semibold uppercase tracking-[0.2em] text-[#f3e8ff] opacity-90 drop-shadow-[0_0_10px_rgba(192,132,252,0.5)]">
                    Needs
                  </div>
                </div>

                {/* Phase 3: Patterns (Sparkles - Filled) */}
                <div className="absolute flex flex-col items-center justify-center opacity-0 mix-blend-plus-lighter animate-[mist-cycle_12s_ease-in-out_infinite_8s]">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#7c3aed]/30 bg-gradient-to-b from-[#7c3aed]/20 to-[#6d28d9]/10 text-[#ddd6fe] shadow-[0_0_30px_rgba(124,58,237,0.25)] backdrop-blur-md">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      stroke="none"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                      <path d="M5 3v4" />
                      <path d="M9 5H5" />
                      <path d="M6 17v4" />
                      <path d="M10 19H6" />
                    </svg>
                  </div>
                  <div className="mt-4 text-[11px] font-mono font-semibold uppercase tracking-[0.2em] text-[#ddd6fe] opacity-90 drop-shadow-[0_0_10px_rgba(124,58,237,0.5)]">
                    Pattern
                  </div>
                </div>
              </div>

              {/* Bottom Indicator */}
              <div className="absolute bottom-4 z-20">
                <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-[#0A0510]/60 px-3 py-1.5 backdrop-blur-md">
                  <div className="flex gap-1">
                    <div className="h-1 w-1 animate-pulse rounded-full bg-[#FE6839]" />
                    <div
                      className="h-1 w-1 animate-pulse rounded-full bg-[#a855f7]"
                      style={{ animationDelay: "0.2s" }}
                    />
                    <div
                      className="h-1 w-1 animate-pulse rounded-full bg-white"
                      style={{ animationDelay: "0.4s" }}
                    />
                  </div>
                  <span className="font-mono text-[9px] uppercase tracking-tight text-white/40">
                    Vision Index
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ChallengeVisionSection;
