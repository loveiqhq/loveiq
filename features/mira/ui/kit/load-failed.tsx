"use client";

import { useId } from "react";
import { FOCUS_RING } from ".";

/**
 * A read that failed on a Home card (round-3 SET-11): every card says it one way, "<what> didn't
 * load.", with the same Try again as Home's chats card, and never in red: nothing the person did
 * is wrong. Not for a lost sign-in (account/SignedOut) or the under-18 stop (AdultsOnly), which
 * have nothing to try again. Each Try again is described by its line, as Home shows several.
 */
export function LoadFailed({
  what,
  onRetry,
  className = "",
}: {
  /** "Your journal". */
  what: string;
  onRetry: () => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <p id={id} role="alert" className="text-[15px] text-ap-body">
        {what} didn&apos;t load.
      </p>
      <button
        type="button"
        onClick={onRetry}
        aria-describedby={id}
        className={`min-h-[44px] rounded-full border border-ap-line px-4 text-[14px] font-semibold ${FOCUS_RING}`}
      >
        Try again
      </button>
    </div>
  );
}
