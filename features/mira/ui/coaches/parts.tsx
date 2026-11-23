"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { Coach, CoachId } from "@features/mira/content/coaches";
import { SignInAgain } from "../account/SignedOut";
import { notify, stopNotifying } from "./data";
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
      className="flex shrink-0 select-none items-center justify-center rounded-full font-serif font-semibold text-[#fff] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
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
 * Each coach's requests go one at a time, in the order asked, whichever button sent them: on a
 * slow network a Stop never overtakes the Notify it takes back (round-3 R3-HAB-6).
 */
const inLine = new Map<CoachId, Promise<unknown>>();
/** Each coach's taps still waiting their turn, oldest first; `gone`: sent as the page went. */
type Tap = { on: boolean; gone?: true };
const waiting = new Map<CoachId, Tap[]>();
function inTurn(coach: CoachId, on: boolean): Promise<string | null> {
  const tap: Tap = { on };
  waiting.set(coach, [...(waiting.get(coach) ?? []), tap]);
  const send = () => {
    waiting.set(
      coach,
      (waiting.get(coach) ?? []).filter((t) => t !== tap)
    );
    if (tap.gone) return Promise.resolve(null);
    return on ? notify(coach) : stopNotifying(coach);
  };
  const run = (inLine.get(coach) ?? Promise.resolve()).then(send);
  inLine.set(
    coach,
    run.catch(() => null)
  );
  return run;
}

/**
 * A tap still waiting for its coach's earlier request when the page goes (a reload, a closed tab)
 * was never sent: a Stop the screen showed was lost and the request stayed stored (round-4
 * R4-HABITS-4). Each coach's last waiting tap goes now, kept alive past the page; the earlier
 * ones are its past, and none of them is sent again should the page come back.
 * ponytail: a Stop sent here may still meet its Notify mid-way on the server; the server dropping
 * a Notify older than a later Stop would close that too.
 */
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    for (const [coach, taps] of waiting) {
      const last = taps.at(-1);
      if (!last) continue;
      for (const t of taps) t.gone = true;
      void (last.on ? notify(coach, true) : stopNotifying(coach, true));
    }
    waiting.clear();
  });
}

/**
 * "Notify me" on a coming-soon coach, and its "Stop" once asked. Each shows at once and is put
 * back if the request fails; the coach's button stays focusable either way, and Stop hands the
 * keyboard back to it, so a keyboard never loses its place. `done` null: not known yet (the
 * roster's read is on its way), so a quiet placeholder, never a guessed "Notify me" (CHK-F6).
 */
export function NotifyButton({
  coach,
  done,
  onChange,
}: {
  coach: Coach;
  done: boolean | null;
  onChange: (id: CoachId, on: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  // Announced only after the person's own tap, not for a request made on an earlier visit.
  const [said, setSaid] = useState("");
  const main = useRef<HTMLButtonElement | null>(null);
  const taps = useRef(0);
  if (done === null) {
    return (
      <span
        aria-hidden="true"
        className="inline-block h-11 w-[132px] rounded-full bg-ap-ground motion-safe:animate-pulse"
      />
    );
  }
  async function change(on: boolean) {
    if (on === done) return;
    setError(null);
    if (!on) main.current?.focus(); // Stop goes away; the keyboard stays with this coach
    onChange(coach.id, on);
    const tap = ++taps.current;
    const failed = await inTurn(coach.id, on);
    // A later tap has the last word: only its outcome is shown and said, once the server answered.
    if (tap !== taps.current) return;
    if (failed) {
      onChange(coach.id, !on);
      setError(failed);
    } else {
      setSaid(
        on
          ? `Done. We’ll let you know when ${coach.name} is ready.`
          : `Stopped. We won’t contact you about ${coach.name}.`
      );
    }
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      {/* Never wraps: past the room it has, the label wraps inside its button, and Stop keeps its
          place beside it (round-3 R3-HAB-11). */}
      <span className="inline-flex items-center gap-x-1">
        <button
          ref={main}
          type="button"
          onClick={() => void change(true)}
          aria-disabled={done || undefined}
          // The whole name in one label: each card's button says whom it is for.
          aria-label={
            done
              ? `We’ll let you know when ${coach.name} is ready`
              : `Notify me when ${coach.name} is ready`
          }
          className={
            done
              ? `inline-flex min-h-[44px] min-w-0 cursor-default items-center gap-2 rounded-full px-1 text-left text-[14px] font-semibold text-ap-good-ink ${FOCUS}`
              : QUIET_PILL
          }
        >
          {done ? <CheckIcon /> : <BellIcon />}
          {done ? "We’ll let you know" : "Notify me"}
        </button>
        {done ? (
          // One unit: the dot never ends a line without its Stop.
          <span className="inline-flex shrink-0 items-center gap-x-1 whitespace-nowrap">
            <span aria-hidden="true" className="text-ap-muted">
              ·
            </span>
            <button
              type="button"
              onClick={() => void change(false)}
              aria-label={`Stop notifying me about ${coach.name}`}
              className={`inline-flex min-h-[44px] items-center px-1 text-[14px] font-semibold text-ap-muted underline underline-offset-4 hover:text-ap-ink ${FOCUS}`}
            >
              Stop
            </button>
          </span>
        ) : null}
      </span>
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
      {error ? (
        <span role="alert" className="text-[13px] text-ap-bad-ink">
          {error}
          <SignInAgain error={error} />
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
