"use client";

import { useEffect } from "react";
import Link from "next/link";
import { LoveIQMark, LoveIQWordmark } from "@shared/ui/branding/LoveIQBrand";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-page text-text-primary">
      {/* Floating ambient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="animate-float1 absolute -left-[10%] top-[10%] h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(242,109,79,0.14)_0%,transparent_70%)]" />
        <div className="animate-float2 absolute -right-[15%] bottom-[10%] h-[450px] w-[450px] rounded-full bg-[radial-gradient(circle,rgba(156,125,255,0.14)_0%,transparent_70%)]" />
      </div>

      <header className="relative z-10 flex items-center px-6 py-6 sm:px-10">
        <Link href="/" className="focus-visible-ring inline-flex items-center gap-2 rounded-md">
          <LoveIQMark className="h-7 w-8 shrink-0" width={32} height={28} />
          <LoveIQWordmark className="text-xl" />
        </Link>
      </header>

      <main
        id="main-content"
        className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-16 text-center"
      >
        {/* Status badge */}
        <div className="animate-fade-in-up inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold tracking-widest text-text-muted uppercase">
          System Error
        </div>

        {/* Headline */}
        <h1 className="animate-fade-in-up delay-1 mt-6 max-w-lg font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Something went wrong
        </h1>

        {/* Subtext */}
        <p className="animate-fade-in-up delay-2 mt-4 max-w-md text-base leading-relaxed text-text-secondary">
          An unexpected error occurred on our end. Try again, or head back to the homepage.
        </p>

        {/* CTAs */}
        <div className="animate-fade-in-up delay-3 mt-10 flex flex-col items-center gap-4 sm:flex-row">
          {/* Primary: Try again */}
          <button
            type="button"
            onClick={reset}
            className="group relative inline-flex h-[54px] min-w-[200px] cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-brand px-8 text-[15px] font-semibold text-white shadow-pill transition hover:-translate-y-[2px] focus-visible-ring"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-white opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            />
            <div
              aria-hidden
              className="absolute inset-0 translate-y-full bg-white/20 transition-transform duration-300 group-hover:translate-y-0"
            />
            <span className="relative z-10 transition-colors duration-500 group-hover:text-black">
              Try again
            </span>
          </button>

          {/* Secondary: Go home */}
          <Link
            href="/"
            className="inline-flex h-[54px] min-w-[180px] items-center justify-center rounded-full border border-white/30 bg-white/0 px-6 text-sm font-semibold text-white transition hover:-translate-y-[2px] focus-visible-ring"
          >
            Go home
          </Link>
        </div>

        {/* Support line */}
        <p className="animate-fade-in-up delay-4 mt-8 text-sm text-text-muted">
          Persistent issues?{" "}
          <a
            href="mailto:hello@loveiq.org"
            className="text-text-secondary underline underline-offset-2 hover:text-text-primary transition-colors focus-visible-ring rounded"
          >
            Contact us
          </a>
        </p>
      </main>
    </div>
  );
}
