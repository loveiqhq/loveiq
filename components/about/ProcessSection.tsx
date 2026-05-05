"use client";

import type { FC } from "react";

// Icon components for the steps
const MicroscopeIcon: FC<{ className?: string }> = ({ className = "w-8 h-8" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#a78bfa"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 18h8" />
    <path d="M3 22h18" />
    <path d="M14 22a7 7 0 1 0 0-14h-1" />
    <path d="M9 14h2" />
    <path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" />
    <path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
  </svg>
);

const TransformIcon: FC<{ className?: string }> = ({ className = "w-8 h-8" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#a78bfa"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M16.466 7.5C15.643 4.237 13.952 2 12 2 9.239 2 7 6.477 7 12s2.239 10 5 10c.342 0 .677-.069 1-.2" />
    <path d="m15.194 13.707 3.814 1.86-1.86 3.814" />
    <path d="M19 15.57c-1.804.885-4.274 1.43-7 1.43-5.523 0-10-2.239-10-5s4.477-5 10-5c4.838 0 8.873 1.718 9.8 4" />
  </svg>
);

const FileCheckIcon: FC<{ className?: string }> = ({ className = "w-8 h-8" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#a78bfa"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="m9 15 2 2 4-4" />
  </svg>
);

const ChartIcon: FC<{ className?: string }> = ({ className = "w-8 h-8" }) => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M4 4V25.3333C4 26.0406 4.28095 26.7189 4.78105 27.219C5.28115 27.719 5.95942 28 6.66667 28H28"
      stroke="#A78BFA"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M24 6.66663H21.3333C20.597 6.66663 20 7.26358 20 7.99996V21.3333C20 22.0697 20.597 22.6666 21.3333 22.6666H24C24.7364 22.6666 25.3333 22.0697 25.3333 21.3333V7.99996C25.3333 7.26358 24.7364 6.66663 24 6.66663Z"
      stroke="#A78BFA"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M13.3335 10.6666H10.6668C9.93045 10.6666 9.3335 11.2636 9.3335 12V21.3333C9.3335 22.0697 9.93045 22.6666 10.6668 22.6666H13.3335C14.0699 22.6666 14.6668 22.0697 14.6668 21.3333V12C14.6668 11.2636 14.0699 10.6666 13.3335 10.6666Z"
      stroke="#A78BFA"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const FootprintsIcon: FC<{ className?: string }> = ({ className = "w-8 h-8" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#a78bfa"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z" />
    <path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z" />
    <path d="M16 17h4" />
    <path d="M4 13h4" />
  </svg>
);

// Small icons for the orbital diagram
const SmallMicroscopeIcon: FC = () => (
  <svg
    className="h-[18px] w-[18px]"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#a78bfa"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 18h8" />
    <path d="M3 22h18" />
    <path d="M14 22a7 7 0 1 0 0-14h-1" />
    <path d="M9 14h2" />
    <path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" />
  </svg>
);

const SmallTransformIcon: FC = () => (
  <svg
    className="h-[18px] w-[18px]"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#fe6839"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M16.466 7.5C15.643 4.237 13.952 2 12 2 9.239 2 7 6.477 7 12s2.239 10 5 10" />
    <path d="m15.194 13.707 3.814 1.86-1.86 3.814" />
    <path d="M19 15.57c-1.804.885-4.274 1.43-7 1.43-5.523 0-10-2.239-10-5s4.477-5 10-5c4.838 0 8.873 1.718 9.8 4" />
  </svg>
);

const SmallFileCheckIcon: FC = () => (
  <svg
    className="h-[18px] w-[18px]"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#a78bfa"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="m9 15 2 2 4-4" />
  </svg>
);

const SmallChartIcon: FC = () => (
  <svg
    className="h-[18px] w-[18px]"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#a78bfa"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M7 16V8" />
    <path d="M12 16v-5" />
    <path d="M17 16v-8" />
  </svg>
);

const SmallFootprintsIcon: FC = () => (
  <svg
    className="h-[18px] w-[18px]"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#a78bfa"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 11 3.8 11 8c0 2.5-1.03 3.5-1 5.62V16"></path>
    <path d="M14 20v-2.38c0-2.12 1.03-3.12 1-5.62 0-4.2 1.63-6 3.5-6 3.01 0 4.47 3.28 4.5 6 .03 2.5-1 3.5-1 5.62V20"></path>
    <path d="M16 20h2"></path>
    <path d="M6 16h2"></path>
  </svg>
);

const SmallSettingsIcon: FC = () => (
  <svg
    className="h-[18px] w-[18px]"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#fe6839"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

// Orbital diagram component with spinning animations
const OrbitalDiagram: FC = () => {
  const innerOrbitItems = [
    {
      key: "research",
      label: "Research",
      angle: -90,
      icon: <SmallMicroscopeIcon />,
      tooltipClass:
        "pointer-events-none absolute -top-10 z-[999] translate-y-2 select-none whitespace-nowrap rounded-full border border-[#a855f7]/30 bg-[#16121D]/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white opacity-0 shadow-[0_4px_15px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all duration-300 group-hover/icon:translate-y-0 group-hover/icon:opacity-100",
      ringClass:
        "flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[#a855f7]/30 bg-[#16121D] shadow-[0_0_15px_rgba(168,85,247,0.15)] transition-all duration-500 hover:scale-110 hover:border-[#a855f7]/50 hover:shadow-[0_0_25px_rgba(168,85,247,0.3)]",
    },
    {
      key: "actions",
      label: "Actions",
      angle: 30,
      icon: <SmallFootprintsIcon />,
      tooltipClass:
        "pointer-events-none absolute -top-10 z-[999] translate-y-2 select-none whitespace-nowrap rounded-full border border-[#a855f7]/30 bg-[#16121D]/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white opacity-0 shadow-[0_4px_15px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all duration-300 group-hover/icon:translate-y-0 group-hover/icon:opacity-100",
      ringClass:
        "flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[#a855f7]/30 bg-[#16121D] shadow-[0_0_15px_rgba(168,85,247,0.15)] transition-all duration-500 hover:scale-110 hover:border-[#a855f7]/50 hover:shadow-[0_0_25px_rgba(168,85,247,0.3)]",
    },
    {
      key: "settings",
      label: "Settings",
      angle: 150,
      icon: <SmallSettingsIcon />,
      tooltipClass:
        "pointer-events-none absolute -top-10 z-[999] translate-y-2 select-none whitespace-nowrap rounded-full border border-[#FE6839]/30 bg-[#16121D]/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#FE6839] opacity-0 shadow-[0_4px_15px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all duration-300 group-hover/icon:translate-y-0 group-hover/icon:opacity-100",
      ringClass:
        "flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[#FE6839]/30 bg-[#16121D] shadow-[0_0_15px_rgba(254,104,57,0.15)] transition-all duration-500 hover:scale-110 hover:border-[#FE6839]/50 hover:shadow-[0_0_25px_rgba(254,104,57,0.3)]",
    },
  ];

  return (
    <div className="relative mx-auto h-[400px] w-[568px] max-w-full">
      {/* Gradient blur background with pulse */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full blur-[100px]"
        style={{
          backgroundImage:
            "linear-gradient(45deg, rgba(46, 1, 71, 0.3) 0%, rgba(254, 104, 57, 0.15) 100%)",
        }}
      />

      {/* Main circular container */}
      <div className="absolute left-1/2 top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2">
        {/* === OUTER ORBIT SYSTEM (Clockwise at 120s) === */}
        <div className="absolute inset-0 z-20 flex animate-[spin_120s_linear_infinite] items-center justify-center">
          {/* Outer dashed circle */}
          <div className="relative h-[90%] w-[90%] rounded-full border border-dashed border-white/10">
            {/* Research Pill (Top Left) */}
            <div className="absolute left-[18%] top-[18%] -translate-x-1/2 -translate-y-1/2">
              <div className="animate-[spin_120s_linear_infinite_reverse]">
                <div className="group cursor-pointer rounded-full border border-white/10 bg-[#0A0510]/90 px-5 py-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all hover:border-white/20">
                  <span className="text-sm font-medium tracking-wide text-gray-200 transition-colors group-hover:text-white">
                    Research
                  </span>
                </div>
              </div>
            </div>

            {/* Transform Icon (Top Right) - Orange */}
            <div className="absolute right-[22%] top-[12%] -translate-y-1/2 translate-x-1/2">
              <div className="animate-[spin_120s_linear_infinite_reverse]">
                <div className="group flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-[#FE6839]/30 bg-[#16121D] shadow-[0_0_15px_rgba(254,104,57,0.15)] transition-transform duration-500 hover:scale-110">
                  <SmallTransformIcon />
                </div>
              </div>
            </div>

            {/* Insights Pill (Right) */}
            <div className="absolute -right-[2%] top-1/2 -translate-y-1/2 translate-x-1/2">
              <div className="animate-[spin_120s_linear_infinite_reverse]">
                <div className="group cursor-pointer rounded-full border border-white/10 bg-[#0A0510]/90 px-5 py-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all hover:border-white/20">
                  <span className="text-sm font-medium tracking-wide text-gray-200 transition-colors group-hover:text-white">
                    Insights
                  </span>
                </div>
              </div>
            </div>

            {/* Chart Icon (Bottom Right) - Purple */}
            <div className="absolute bottom-[15%] right-[15%] translate-x-1/2 translate-y-1/2">
              <div className="animate-[spin_120s_linear_infinite_reverse]">
                <div className="group flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-[#a855f7]/30 bg-[#16121D] shadow-[0_0_15px_rgba(168,85,247,0.15)] transition-transform duration-500 hover:scale-110">
                  <SmallChartIcon />
                </div>
              </div>
            </div>

            {/* Knowledge Pill (Bottom Left) */}
            <div className="absolute bottom-[10%] left-[25%] -translate-x-1/2 translate-y-1/2">
              <div className="animate-[spin_120s_linear_infinite_reverse]">
                <div className="group cursor-pointer rounded-full border border-white/10 bg-[#0A0510]/90 px-5 py-2.5 shadow-[0_4px_20px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all hover:border-white/20">
                  <span className="text-sm font-medium tracking-wide text-gray-200 transition-colors group-hover:text-white">
                    Knowledge
                  </span>
                </div>
              </div>
            </div>

            {/* FileCheck Icon (Left) - Purple */}
            <div className="absolute -left-[2%] top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="animate-[spin_120s_linear_infinite_reverse]">
                <div className="group flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-[#a855f7]/30 bg-[#16121D] shadow-[0_0_15px_rgba(168,85,247,0.15)] transition-transform duration-500 hover:scale-110">
                  <SmallFileCheckIcon />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* === INNER ORBIT SYSTEM (Counter-Clockwise at 90s, pauses on hover) === */}
        <div className="group/orbit pointer-events-auto absolute inset-0 z-0 flex items-center justify-center hover:[animation-play-state:paused] group-hover/orbit:[animation-play-state:paused] animate-inner-orbit">
          {/* Inner dashed circle */}
          <div className="relative h-[200px] w-[200px] rounded-full border border-dashed border-white/10 opacity-50 transition-all duration-500 group-hover/orbit:border-white/20 group-hover/orbit:opacity-100 md:h-[220px] md:w-[220px]">
            {innerOrbitItems.map((item) => (
              <div
                key={item.key}
                className="pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              >
                <div style={{ transform: `rotate(${item.angle}deg) translateX(110px)` }}>
                  <div className="group-hover/orbit:[animation-play-state:paused] hover:[animation-play-state:paused] animate-inner-orbit-icon">
                    <div
                      className="group/icon relative flex flex-col items-center"
                      style={{ transform: `rotate(${-item.angle}deg)` }}
                    >
                      {/* Tooltip */}
                      <div className={item.tooltipClass}>{item.label}</div>
                      <div className={item.ringClass}>{item.icon}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* === CENTER CORE (Static with hover effect) === */}
        <div className="group absolute left-1/2 top-1/2 z-30 flex h-[128px] w-[128px] -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-gradient-to-b from-[#1a1025] to-[#0a0510] shadow-[0_0_60px_rgba(46,1,71,0.5)] transition-all duration-500 hover:border-[#a855f7]/30 hover:shadow-[0_0_80px_rgba(168,85,247,0.3)]">
          {/* Pulse ring on hover */}
          <div className="absolute inset-0 rounded-full border-2 border-[#a855f7]/0 transition-all duration-500 group-hover:scale-110 group-hover:border-[#a855f7]/20 group-hover:opacity-0" />

          <div className="relative flex items-center justify-center">
            {/* Brain/Insights icon */}
            <svg
              width="36"
              height="36"
              viewBox="0 0 36 36"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="transition-transform duration-500 group-hover:scale-110"
            >
              <path
                d="M22.5 3H9C7.34425 3 6 4.34425 6 6V30C6 31.6557 7.34425 33 9 33H27C28.6557 33 30 31.6557 30 30V10.5L22.5 3"
                stroke="#A78BFA"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M21 3V9C21 10.6557 22.3443 12 24 12H30"
                stroke="#A78BFA"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M15 13.5H12"
                stroke="#A78BFA"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M24 19.5H12"
                stroke="#A78BFA"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M24 25.5H12"
                stroke="#A78BFA"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {/* Small badge */}
            <div className="absolute -bottom-2 -right-2 flex h-[26px] w-[26px] items-center justify-center rounded-full border border-[#a78bfa] bg-[#1a1025] transition-all duration-500 group-hover:scale-110 group-hover:shadow-[0_0_15px_rgba(168,85,247,0.4)]">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12.6668 9.33333C13.6602 8.36 14.6668 7.19333 14.6668 5.66667C14.6668 3.64298 13.0239 2 11.0002 2C9.82683 2 9.00016 2.33333 8.00016 3.33333C7.00016 2.33333 6.1735 2 5.00016 2C2.97512 2 1.3335 3.64162 1.3335 5.66667C1.3335 7.2 2.3335 8.36667 3.3335 9.33333L8.00016 14L12.6668 9.33333Z"
                  fill="#A78BFA"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ProcessSection: FC = () => {
  const steps = [
    {
      title: "Research",
      description:
        "We constantly process latest scientific research paper, books and practical wisdom.",
      icon: <MicroscopeIcon />,
    },
    {
      title: "Transformation",
      description:
        "We turn knowledge into simplified frameworks tailored to human needs and designed to be implemented easily.",
      icon: <TransformIcon />,
    },
    {
      title: "Tests",
      description:
        "We developed guided tests across different disciplines designed for people to learn and reflect efficiently.",
      icon: <FileCheckIcon />,
    },
    {
      title: "Reports",
      description:
        "Fueled by our test inputs we transform personal insights into highly informative reports that help us better understand ourselves.",
      icon: <ChartIcon />,
    },
    {
      title: "Guided action steps",
      description:
        "Our tools & services help people take specific actions to change their lives to the better.",
      icon: <FootprintsIcon />,
    },
  ];

  return (
    <section id="process" className="border-t border-white/5 bg-[#0A0510] px-6 py-16 md:py-24">
      <div className="content-shell flex flex-col gap-16 lg:flex-row lg:items-start lg:gap-24">
        {/* Left side - Heading + Orbital */}
        <div className="flex flex-col gap-14 lg:w-[568px]">
          {/* Heading */}
          <div className="space-y-10 px-2.5">
            <h2 className="reveal-on-scroll font-serif text-3xl font-normal leading-[1] tracking-tight text-white md:text-5xl">
              How We Work
            </h2>
            <p className="reveal-on-scroll stagger-1 max-w-[512px] text-lg font-light leading-relaxed text-[#9CA3AF] md:text-xl">
              We work like a coach that never stops learning by continuously consuming new research,
              books, and practical expertise to transform that knowledge into easy-to-understand,
              actionable, and personalized insights for our users.
            </p>
          </div>

          {/* Orbital diagram */}
          <div className="reveal-on-scroll stagger-2">
            <OrbitalDiagram />
          </div>
        </div>

        {/* Right side - Steps */}
        <div className="flex flex-col gap-10 lg:flex-1 lg:gap-12">
          {steps.map((step, index) => (
            <div
              key={step.title}
              className={`reveal-on-scroll stagger-${Math.min(index + 1, 4)} group flex cursor-default gap-6 md:gap-8`}
            >
              {/* Icon */}
              <div className="relative flex-shrink-0 pt-1">
                <div className="relative z-10 flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/5 bg-[#1A1025] transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover:scale-105 group-hover:border-[#a855f7]/30 group-hover:bg-[#2E0147] group-hover:shadow-[0_0_35px_-10px_rgba(168,85,247,0.4)] md:h-16 md:w-16">
                  <div className="absolute inset-0 bg-gradient-to-tr from-[#a855f7]/20 via-transparent to-transparent opacity-0 transition-opacity duration-1000 group-hover:opacity-100" />
                  <div className="relative z-10 transition-colors duration-700 group-hover:text-white [&_svg]:h-6 [&_svg]:w-6 md:[&_svg]:h-7 md:[&_svg]:w-7">
                    {step.icon}
                  </div>
                </div>
              </div>
              {/* Content */}
              <div className="space-y-2 pt-2 transition-transform duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover:translate-x-3">
                <h3 className="font-serif text-xl font-medium tracking-tight text-white transition-colors duration-700 group-hover:text-[#a855f7] md:text-3xl">
                  {step.title}
                </h3>
                <p className="text-base font-light leading-relaxed text-gray-400 transition-colors duration-700 group-hover:text-gray-300 md:text-lg">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProcessSection;
