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
      aria-label="Applied Psychometrics, Mira beta"
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
      <span className="flex flex-col font-serif text-[18px] font-bold leading-[1.05] tracking-[-0.01em] text-ap-ink sm:text-[22px]">
        <span>
          Applied{" "}
          <span className="align-top font-sans text-[9px] font-normal tracking-[0.14em] text-ap-quiet">
            BETA
          </span>
        </span>
        <span className="bg-[linear-gradient(105deg,#d05976_20.51%,#c167cf_48.14%,#8887f6_79.16%)] bg-clip-text text-transparent">
          Psychometrics
        </span>
      </span>
    </Link>
  );
}

/**
 * The soft coral, orchid and lavender cloud behind Mira's welcome (board V2): it blooms in, then
 * breathes slowly. Still for anyone who asks for less motion.
 */
export function MiraCloud({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute left-1/2 top-1/2 h-[460px] w-[680px] -translate-x-1/2 -translate-y-[46%] rounded-full bg-[radial-gradient(closest-side_at_28%_58%,rgba(254,104,57,0.14),rgba(254,104,57,0)_100%),radial-gradient(closest-side_at_52%_42%,rgba(191,102,217,0.16),rgba(191,102,217,0)_100%),radial-gradient(closest-side_at_74%_60%,rgba(149,142,246,0.18),rgba(149,142,246,0)_100%)] blur-[72px] motion-safe:animate-mira-cloud sm:h-[560px] sm:w-[1000px] ${className}`}
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
      <main className="mx-auto max-w-[1180px] px-4 pb-10 sm:px-8">{children}</main>
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
 * the privacy link on the app's home page.
 */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav
      aria-label="Legal"
      className={`flex flex-wrap items-center gap-x-4 border-t border-ap-line pt-3 text-[12px] text-ap-muted ${className}`}
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

/** Mira's primary action: the board's ink pill (the same black as "Sign in"). */
export function PrimaryButton({
  children,
  disabled,
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
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-ap-ink px-6 text-[15px] font-bold text-white transition-[transform,background-color] hover:bg-[#2b2338] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-ap-track disabled:text-ap-muted disabled:active:scale-100"
    >
      {children}
    </button>
  );
}
