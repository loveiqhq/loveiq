"use client";

import type { FC } from "react";

// Helper to create character spans with animation delays
const AnimatedText: FC<{ text: string; baseDelay: number }> = ({ text, baseDelay }) => (
  <span className="inline-flex flex-wrap justify-center gap-[0.25em]">
    {text.split(" ").map((word, wordIndex) => (
      <span key={wordIndex} className="inline-flex whitespace-nowrap">
        {word.split("").map((char, charIndex) => {
          const delay = baseDelay + wordIndex * 150 + charIndex * 50;
          return (
            <span key={charIndex} className="char-anim" style={{ animationDelay: `${delay}ms` }}>
              {char}
            </span>
          );
        })}
      </span>
    ))}
  </span>
);

const HeroSection: FC = () => {
  return (
    <section
      id="hero"
      className="relative flex min-h-screen flex-col items-center overflow-hidden bg-[#0A0510] pb-32 pt-[15vh] md:pt-[18vh]"
    >
      {/* Background Layer */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {/* Dot Matrix Pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:32px_32px] opacity-50 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_50%,#000_60%,transparent_100%)]" />
        {/* Central Breathing Glow */}
        <div
          className="absolute left-1/2 top-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-[#2E0147] blur-[120px] mix-blend-screen"
          style={{ animationDuration: "8s" }}
        />
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex w-full max-w-7xl flex-col items-center justify-center px-6 text-center">
        {/* Background Pulsing Gradient */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[500px] w-[600px] -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-[#5b21b6] blur-[120px] mix-blend-screen"
          style={{ animationDuration: "8s" }}
        />

        {/* Heading */}
        <h1 className="mb-12 flex flex-col items-center gap-2 font-serif text-4xl font-medium leading-[1.1] tracking-tight text-white sm:text-5xl md:mb-32 md:gap-4 md:text-6xl lg:text-[80px]">
          <div className="flex flex-wrap justify-center gap-[0.25em]">
            <AnimatedText text="We exist to help" baseDelay={50} />
          </div>

          <div className="mt-1 flex flex-wrap justify-center gap-[0.25em] md:mt-2">
            <AnimatedText text="people better" baseDelay={850} />
          </div>

          <div className="mt-1 flex flex-wrap justify-center gap-[0.25em] md:mt-2">
            <AnimatedText text="understand themselves." baseDelay={1500} />
          </div>
        </h1>

        {/* Subtext */}
        <p
          className="sensual-anim mx-auto max-w-4xl font-sans text-base font-light leading-relaxed text-gray-400 md:text-[20px]"
          style={{ animationDelay: "2.8s" }}
        >
          We are a{" "}
          <strong className="font-bold text-white">
            science-led psychometric research and insights platform
          </strong>{" "}
          dedicated to reducing <br className="hidden md:inline" />
          human suffering and supporting lasting happiness. We combine established scientific{" "}
          <br className="hidden md:inline" />
          disciplines, practical wisdom, and modern technology to provide tools for{" "}
          <strong className="font-bold text-white">transforming</strong>
          <br className="hidden md:inline" />{" "}
          <strong className="font-extrabold text-white">
            self-understanding into personal growth.
          </strong>
        </p>
      </div>
    </section>
  );
};

export default HeroSection;
