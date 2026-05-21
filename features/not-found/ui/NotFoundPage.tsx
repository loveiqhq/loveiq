import type { FC } from "react";
import Link from "next/link";
import NavSection from "@features/landing/ui/NavSection";
import FooterSection from "@features/landing/ui/FooterSection";

const NotFoundPage: FC = () => {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-page text-text-primary">
      {/* Floating ambient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="animate-float1 absolute -left-[10%] top-[5%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,rgba(242,109,79,0.18)_0%,transparent_70%)]" />
        <div className="animate-float2 absolute -right-[15%] top-[20%] h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(156,125,255,0.18)_0%,transparent_70%)]" />
        <div className="animate-float3 absolute bottom-[10%] left-[30%] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,rgba(111,63,255,0.12)_0%,transparent_70%)]" />
      </div>

      <NavSection />

      <main
        id="main-content"
        className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-24 text-center"
      >
        {/* Giant gradient 404 */}
        <div
          className="animate-fade-in-up font-serif text-[120px] font-semibold italic leading-none sm:text-[160px] lg:text-[200px]"
          style={{
            background: "linear-gradient(120deg, #ff6a3a 0%, #cf5afb 50%, #7d88ff 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
          aria-label="404"
        >
          404
        </div>

        {/* Headline */}
        <h1 className="animate-fade-in-up delay-1 mt-6 max-w-xl font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          This page took a detour
        </h1>

        {/* Subtext */}
        <p className="animate-fade-in-up delay-2 mt-4 max-w-lg text-base leading-relaxed text-text-secondary sm:text-lg">
          The page you&rsquo;re looking for doesn&rsquo;t exist. But your journey of
          self-understanding is right on track.
        </p>

        {/* CTAs */}
        <div className="animate-fade-in-up delay-3 mt-10 flex flex-col items-center gap-4 sm:flex-row">
          {/* Primary: gradient pill */}
          <Link
            href="/"
            className="group relative inline-flex h-[54px] min-w-[200px] items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-brand px-8 text-[15px] font-semibold text-white shadow-pill transition hover:-translate-y-[2px] focus-visible-ring"
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
              Back to home
            </span>
          </Link>

          {/* Secondary: outline pill */}
          <Link
            href="/glossary"
            className="inline-flex h-[54px] min-w-[180px] items-center justify-center rounded-full border border-white/30 bg-white/0 px-6 text-sm font-semibold text-white transition hover:-translate-y-[2px] focus-visible-ring"
          >
            Explore the Glossary
          </Link>
        </div>
      </main>

      <FooterSection />
    </div>
  );
};

export default NotFoundPage;
