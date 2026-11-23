"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FOCUS_RING } from ".";

/**
 * A read that failed on a Home card (round-3 SET-11): every card says it one way, "<what> didn’t
 * load.", with the same Try again as Home's chats card, and never in red: nothing the person did
 * is wrong. Not for a lost sign-in (account/SignedOut) or the under-18 stop (AdultsOnly), which
 * have nothing to try again. Each Try again is described by its line, as Home shows several.
 *
 * Try again works as the chats card's does (round-3 R3-UXA-7): while its retry is under way
 * (`busy`, from useRetry) it stays, with the focus, aria-disabled, and a press does nothing; once
 * the card has loaded in its place, the focus goes to the card's heading (its section's
 * `aria-labelledby`; the page's h1 outside one), unless it is somewhere already: never the page.
 * A retry that fails again says so again (round 4): the line comes back as a new alert, as the
 * same words left in place are never read out twice.
 *
 * The pages that share the cards' hooks use it too (round 4: Goals, Journal, Assessments, the
 * checks, Settings' sections, a voice session, Home's chats), so a failed read is said one way
 * across Mira, never with the route's own words.
 */
export function LoadFailed({
  what,
  onRetry,
  busy = false,
  className = "",
}: {
  /** "Your journal". */
  what: string;
  onRetry: () => void;
  busy?: boolean;
  className?: string;
}) {
  const id = useId();
  // Each retry that ends with this still here failed again: its line is a new alert.
  const [said, setSaid] = useState({ busy, times: 0 });
  if (said.busy !== busy) setSaid({ busy, times: said.times + (busy ? 0 : 1) });
  // Set by a press: the heading that takes the focus once this goes.
  const pressed = useRef<{ heading: string | null } | null>(null);
  useEffect(
    () => () => {
      const after = pressed.current;
      if (!after) return;
      requestAnimationFrame(() => {
        const now = document.activeElement;
        if (now && now !== document.body) return;
        (after.heading
          ? document.getElementById(after.heading)
          : document.querySelector<HTMLElement>("main h1")
        )?.focus();
      });
    },
    []
  );
  return (
    <div aria-busy={busy || undefined} className={`flex flex-wrap items-center gap-3 ${className}`}>
      <p key={said.times} id={id} role="alert" className="text-[15px] text-ap-body">
        {what} didn’t load.
      </p>
      <button
        type="button"
        aria-disabled={busy || undefined}
        aria-describedby={id}
        onClick={(e) => {
          if (busy) return;
          const card = e.currentTarget.closest("section[aria-labelledby]");
          pressed.current = { heading: card?.getAttribute("aria-labelledby") ?? null };
          onRetry();
        }}
        className={`min-h-[44px] rounded-full border border-ap-line px-4 text-[14px] font-semibold aria-disabled:cursor-wait aria-disabled:opacity-60 ${FOCUS_RING}`}
      >
        Try again
      </button>
    </div>
  );
}

/**
 * Try again for a card that shows LoadFailed: from the press until the retry answers, the card
 * goes on showing LoadFailed, `busy`, in place of its loading placeholder, so Try again keeps the
 * focus. `loading`: the card's read is under way, as its own retry makes it. Spread the result on
 * LoadFailed.
 */
export function useRetry(loading: boolean, retry: () => void) {
  // ponytail: never reset, as a card reads again only through Try again; reset it once a card
  // reloads on its own, or that load would show LoadFailed.
  const [pressed, setPressed] = useState(false);
  return {
    busy: pressed && loading,
    onRetry: () => {
      setPressed(true);
      retry();
    },
  };
}
