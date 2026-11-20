import Link from "next/link";
import type { ReactNode } from "react";

/** The Applied Psychometrics wordmark with the beta mark, as on the sign-up and home boards. */
export function Wordmark() {
  return (
    <Link
      href="/mira"
      aria-label="Applied Psychometrics, beta"
      className="relative inline-flex flex-col font-serif text-[22px] font-bold leading-[1.05] text-ap-ink no-underline"
    >
      <span>Applied</span>
      <span className="bg-gradient-to-r from-[#d05976] via-[#c167cf] to-[#8887f6] bg-clip-text text-transparent">
        Psychometrics
      </span>
      <span className="absolute right-0 top-[3px] font-sans text-[10px] font-normal tracking-[0.14em] text-ap-quiet">
        BETA
      </span>
    </Link>
  );
}

export const DISCLAIMER =
  "Mira is an AI coach by Applied Psychometrics, a supportive, educational tool for self-understanding. Mira does not provide medical advice, diagnosis, or treatment. If you're struggling, please reach out to a qualified professional.";

export function MiraFrame({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="min-h-screen bg-white font-sans text-ap-ink">
      <header className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-4 py-3 sm:px-8 sm:py-5">
        <Wordmark />
        <div className="flex items-center gap-3">{right}</div>
      </header>
      <main className="mx-auto max-w-[1180px] px-4 pb-16 sm:px-8">{children}</main>
    </div>
  );
}

export function GradientButton({
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
      className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-gradient-to-br from-[#fe6839] via-[#bf66d9] to-[#958ef6] px-6 text-[15px] font-bold text-white shadow-[0_10px_26px_-12px_rgba(191,102,217,0.75)] transition disabled:cursor-not-allowed disabled:from-ap-track disabled:via-ap-track disabled:to-ap-track disabled:text-ap-muted disabled:shadow-none"
    >
      {children}
    </button>
  );
}
