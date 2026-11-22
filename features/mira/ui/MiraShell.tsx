import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The Applied Psychometrics wordmark with a quiet beta mark (Marcus, 17 Nov: "beta above
 * Psychometrics"), on every Mira page: Mark's minimal board V2 (21 Nov 2026) has it, and Eman chose
 * it for all of Mira's pages the same day (it replaced the 18 Nov "LoveIQ for now").
 */
export function Wordmark({ onHome }: { onHome?: () => void }) {
  return (
    <Link
      href="/mira"
      className="no-underline"
      // In the chat itself the logo takes you back to Mira's start, not to the same page. Only
      // there: server-rendered pages (privacy, guide) may not hand a function to a client Link.
      onClick={
        onHome
          ? (e) => {
              e.preventDefault();
              onHome();
            }
          : undefined
      }
    >
      {/*
        A logo keeps its size whatever the text size (--mira-fs, Settings › Appearance). The
        name comes from what's on screen, in reading order ("Applied Psychometrics BETA"), so a
        voice-control user can say what they see (WCAG 2.5.3): BETA follows in the markup and the
        grid lifts it beside "Applied".
      */}
      <span className="grid grid-cols-[auto_1fr] items-start font-serif text-[18px] font-bold leading-[1.05] tracking-[-0.01em] text-ap-ink [--mira-fs:1] sm:text-[22px]">
        <span className="col-start-1 row-start-1">Applied</span>{" "}
        <span className="col-span-2 col-start-1 row-start-2 bg-[linear-gradient(105deg,#d05976_20.51%,#c167cf_48.14%,#8887f6_79.16%)] bg-clip-text text-transparent">
          Psychometrics
        </span>{" "}
        <span className="col-start-2 row-start-1 ml-1 justify-self-start font-sans text-[9px] font-normal tracking-[0.14em] text-ap-muted">
          BETA
        </span>
      </span>
      <span className="sr-only">, Mira home</span>
    </Link>
  );
}

/**
 * The soft coral, orchid and lavender cloud behind Mira's welcome (board V2): it blooms in, then
 * breathes slowly. Still for anyone who asks for less motion. On the dark theme it glows a little
 * stronger (--mira-cloud, tailwind.config.js), or the deep plum would swallow it.
 */
export function MiraCloud({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute left-1/2 top-1/2 h-[460px] w-[680px] -translate-x-1/2 -translate-y-[46%] rounded-full bg-[radial-gradient(closest-side_at_28%_58%,rgba(254,104,57,calc(0.14*var(--mira-cloud,1))),rgba(254,104,57,0)_100%),radial-gradient(closest-side_at_52%_42%,rgba(191,102,217,calc(0.16*var(--mira-cloud,1))),rgba(191,102,217,0)_100%),radial-gradient(closest-side_at_74%_60%,rgba(149,142,246,calc(0.18*var(--mira-cloud,1))),rgba(149,142,246,0)_100%)] blur-[72px] motion-safe:animate-mira-cloud sm:h-[560px] sm:w-[1000px] ${className}`}
    />
  );
}

export const DISCLAIMER =
  "Mira is an AI coach by Applied Psychometrics, a supportive, educational tool for self-understanding. Mira does not provide medical advice, diagnosis, or treatment. If you're struggling, please reach out to a qualified professional.";

export function MiraFrame({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="min-h-screen bg-white font-sans text-ap-ink">
      <header className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-4 pb-2 pt-3 sm:px-8 sm:pt-6">
        <Wordmark />
        <div className="flex items-center gap-3">{right}</div>
      </header>
      <main id="main-content" className="mx-auto max-w-[1180px] px-4 pb-10 sm:px-8">
        {children}
      </main>
      <footer className="mx-auto max-w-[1180px] px-4 pb-8 sm:px-8">
        <LegalLinks />
      </footer>
    </div>
  );
}

const LEGAL_LINKS: Array<[string, string]> = [
  ["/mira/privacy", "How Mira handles your data"],
  ["/privacy-policy", "Privacy policy"],
  ["/terms-of-use", "Terms of use"],
  ["/imprint", "Imprint"],
];

/**
 * On every Mira page: the imprint must be one click away, and Google's sign-in review looks for
 * the privacy link on the app's home page. (The theme is chosen in Settings; System until then.)
 */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-x-4 border-t border-ap-line pt-3 ${className}`}
    >
      <LegalNav />
    </div>
  );
}

function LegalNav() {
  return (
    <nav
      aria-label="Legal"
      className="flex flex-wrap items-center gap-x-4 text-[12px] text-ap-muted"
    >
      <span className="inline-flex min-h-[32px] items-center">Applied Psychometrics</span>
      {LEGAL_LINKS.map(([href, label]) => (
        // No prefetch: rarely followed, and Safari reports a cancelled prefetch as an error.
        <Link
          key={href}
          href={href}
          prefetch={false}
          className="inline-flex min-h-[32px] items-center underline"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Mira's primary action: the board's ink pill (the same black as "Sign in"). Never natively
 * disabled (round-2 decision 7): that drops keyboard focus to the page while a save runs and takes
 * the button out of Tab's order. While `disabled` it is `aria-disabled`, keeps focus and its click
 * does nothing; a submit button's click is cancelled too, which also stops Enter in a field
 * (implicit submission is a click on the form's default button).
 */
export function PrimaryButton({
  children,
  disabled = false,
  onClick,
  type = "button",
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      aria-disabled={disabled || undefined}
      onClick={(e) => {
        if (disabled) e.preventDefault();
        else onClick?.();
      }}
      className={`inline-flex min-h-[48px] items-center justify-center rounded-full px-6 text-[15px] font-bold transition-[transform,background-color] ${
        disabled
          ? "cursor-not-allowed bg-ap-track text-ap-muted"
          : "bg-ap-ink text-white hover:bg-ap-ink/90 active:scale-[0.98]"
      }`}
    >
      {children}
    </button>
  );
}
