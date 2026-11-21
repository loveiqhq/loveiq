"use client";

import Image from "next/image";
import { useState } from "react";
import type { Coach, CoachId } from "@features/mira/content/coaches";
import { notify } from "./data";
import { FOCUS, QUIET_PILL } from "./styles";

/** The coaches' shared pieces, in the calm chat's language (MiraShell, MiraChat). */

/** Each coming-soon coach's own turn of the brand gradient, so no two portraits are the same. */
const ANGLE: Record<CoachId, number> = {
  mira: 105,
  jonas: 105,
  elif: 140,
  ana: 175,
  theo: 210,
  lena: 245,
};

/**
 * Mira's photo; for a coming-soon coach a monogram on the brand gradient. No invented photo of
 * a coach who doesn't exist yet. Decorative: the name is always written beside it.
 */
export function CoachPortrait({ coach, size }: { coach: Coach; size: number }) {
  if (coach.live) {
    return (
      <Image
        src="/images/mira/mira.webp"
        alt=""
        width={size}
        height={size}
        unoptimized
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 select-none items-center justify-center rounded-full font-serif font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.44),
        background: `linear-gradient(${ANGLE[coach.id]}deg, #d05976 18%, #c167cf 50%, #8887f6 84%)`,
      }}
    >
      {coach.name[0]}
    </span>
  );
}

/**
 * "Notify me" on a coming-soon coach. Shows "We’ll let you know" at once and undoes it if the
 * request fails; stays focusable either way, so a keyboard never loses its place.
 */
export function NotifyButton({
  coach,
  done,
  onChange,
}: {
  coach: Coach;
  done: boolean;
  onChange: (id: CoachId, on: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  // Announced only after the person's own tap, not for a request made on an earlier visit.
  const [said, setSaid] = useState(false);
  async function ask() {
    if (done) return;
    setError(null);
    onChange(coach.id, true);
    const failed = await notify(coach.id);
    if (failed) {
      onChange(coach.id, false);
      setError(failed);
    } else setSaid(true);
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void ask()}
        aria-disabled={done || undefined}
        // The whole name in one label: each card's button says whom it is for.
        aria-label={
          done
            ? `We’ll let you know when ${coach.name} is ready`
            : `Notify me when ${coach.name} is ready`
        }
        className={
          done
            ? `inline-flex min-h-[44px] cursor-default items-center gap-2 rounded-full px-1 text-[14px] font-semibold text-ap-good-ink ${FOCUS}`
            : QUIET_PILL
        }
      >
        {done ? <CheckIcon /> : <BellIcon />}
        {done ? "We’ll let you know" : "Notify me"}
      </button>
      <span aria-live="polite" className="sr-only">
        {said && done ? `Done. We’ll let you know when ${coach.name} is ready.` : ""}
      </span>
      {error ? (
        <span role="alert" className="text-[13px] text-ap-bad-ink">
          {error}
        </span>
      ) : null}
    </span>
  );
}

const icon = {
  "aria-hidden": true,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  viewBox: "0 0 24 24",
} as const;

export function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg {...icon} width="18" height="18" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

export function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg {...icon} width="16" height="16" className={className}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function CompassIcon() {
  return (
    <svg {...icon} width="17" height="17">
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg {...icon} width="18" height="18">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg {...icon} width="16" height="16">
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9" />
      <path d="M10.3 19a1.9 1.9 0 0 0 3.4 0" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      {...icon}
      width="16"
      height="16"
      strokeWidth={2.2}
      className="motion-safe:animate-mira-pop"
    >
      <path d="M5 12.5l4.2 4.2L19 7" />
    </svg>
  );
}

/** The same spark as the chat's trained-on line. */
export function SparkIcon() {
  return (
    <svg
      {...icon}
      width="14"
      height="14"
      stroke="#bf66d9"
      strokeWidth={2}
      className="mr-1.5 inline-block align-[-2px]"
    >
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
    </svg>
  );
}
