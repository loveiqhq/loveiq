"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";

/**
 * Parts every Mira stream shares (round-2 audit, 22 Nov 2026), so one thing looks and behaves one
 * way on every page. Dates are in ./dates (server-safe).
 */

/** A focus ring in Mira's purple, in both themes (an outline needs no offset colour). */
export const FOCUS_RING =
  "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ap-purple";

/** Decision 9: the one refusal for every `403 { minor: true }`. */
export const ADULTS_ONLY = "Mira is only for adults.";

/**
 * What a card or page shows an account stopped as under 18, in place of its content: calm body
 * text, never an error, a "didn't load" or a "Try again" (the refusal is permanent).
 */
export function AdultsOnly({ className = "" }: { className?: string }) {
  return <p className={`text-[15px] leading-relaxed text-ap-body ${className}`}>{ADULTS_ONLY}</p>;
}

/**
 * Asking before a delete (UX-9), the same on every page: the question, then the red action and
 * "Keep it". It opens with focus on "Keep it", the safe choice, inside a group the question names,
 * so a screen reader hears the question first. While `busy` the action is aria-disabled (it keeps
 * focus) and ignores taps; `error` is said as an alert. The caller closes it on `onKeep`.
 */
export function ConfirmDelete({
  question,
  action = "Delete",
  busy = false,
  error,
  onConfirm,
  onKeep,
}: {
  question: string;
  action?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onKeep: () => void;
}) {
  const id = useId();
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => keep.current?.focus(), []);
  return (
    <div
      role="group"
      aria-labelledby={id}
      className="rounded-2xl border border-ap-bad p-4 text-[14px] motion-safe:animate-mira-in"
    >
      <p id={id} className="text-ap-ink">
        {question}
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          aria-disabled={busy || undefined}
          onClick={() => (busy ? undefined : onConfirm())}
          className={`min-h-[44px] rounded-full bg-ap-bad px-5 font-semibold text-white aria-disabled:cursor-wait aria-disabled:opacity-60 ${FOCUS_RING}`}
        >
          {action}
        </button>
        <button
          ref={keep}
          type="button"
          onClick={onKeep}
          className={`min-h-[44px] rounded-full border border-ap-line px-5 font-semibold ${FOCUS_RING}`}
        >
          Keep it
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-[13px] text-ap-bad-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A Home card's way to its page (UX-10): "See all →" in the card's header, one wording, colour
 * and size everywhere. `what` completes the name for a screen reader ("See all goals").
 */
export function SectionLink({ href, what }: { href: string; what: string }) {
  return (
    <Link
      href={href}
      className={`-mr-2 inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-[14px] font-semibold text-ap-link underline-offset-4 hover:underline ${FOCUS_RING}`}
    >
      See all <span className="sr-only">{what}</span>
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </Link>
  );
}
