"use client";

import { createContext, useContext, useEffect, useState, type FC, type ReactNode } from "react";
import { REPORT_PAYWALL_COUNTDOWN_MS } from "@features/survey/ui/hooks/surveySession";

export type CountdownValue = { mm: string; ss: string; expired: boolean };

/**
 * Single source of truth for the report paywall's 3-minute urgency countdown.
 * One interval per mounted modal feeds BOTH the big digit tiles (in the pricing
 * card) and the small "Expires" pill (in the sticky bar), so they never drift
 * apart. Recomputes from the absolute `deadline` each tick (drift-free) and
 * stops once it reaches 0 — the offer/price stays valid; the timer is pure
 * urgency UI.
 *
 * `deadline` is an epoch-ms value resolved once per report session (persisted
 * in sessionStorage by the caller, armed on reaching the first paywalled chapter)
 * so it survives view switches and reopening.
 * `active` gates the interval — pass the modal's `open` so the timer never
 * ticks (or leaks) while the modal is closed.
 */
export function usePaywallCountdown(
  deadline: number | null,
  active: boolean
): { mm: string; ss: string; expired: boolean } {
  const [remainingMs, setRemainingMs] = useState<number | null>(() =>
    deadline == null ? null : Math.max(0, deadline - Date.now())
  );

  useEffect(() => {
    if (!active || deadline == null) {
      return;
    }

    const sync = () => Math.max(0, deadline - Date.now());
    // eslint-disable-next-line react-hooks/set-state-in-effect -- immediate sync to wall-clock on open / deadline change; the interval takes over after
    setRemainingMs(sync());

    const id = setInterval(() => {
      const next = sync();
      setRemainingMs(next);
      if (next <= 0) {
        clearInterval(id);
      }
    }, 1_000);

    return () => clearInterval(id);
  }, [active, deadline]);

  const totalSeconds = Math.max(0, Math.floor((remainingMs ?? 0) / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return {
    mm: String(minutes).padStart(2, "0"),
    ss: String(seconds).padStart(2, "0"),
    expired: remainingMs != null && remainingMs <= 0,
  };
}

/**
 * Shared countdown so a report with many locked chapter cards runs ONE interval
 * (not one per card). The provider ticks a single `usePaywallCountdown`; cards
 * read the formatted value via {@link usePaywallCountdownValue}. All consumers
 * therefore display identical, perfectly-synced MM:SS.
 */
const PaywallCountdownContext = createContext<CountdownValue | null>(null);

export const PaywallCountdownProvider: FC<{
  /**
   * Resolved epoch-ms deadline; falls back to a fresh window when null — i.e.
   * before the clock is armed (it arms on reaching the first paywalled chapter),
   * which is above every countdown surface in the report, so no reader sees the
   * fallback tick and then re-anchor.
   */
  deadline: number | null;
  /** Gate the single interval (pass false when no countdown UI is on the page). */
  active: boolean;
  children: ReactNode;
}> = ({ deadline, active, children }) => {
  const [fallbackDeadline] = useState(() =>
    typeof window === "undefined" ? null : Date.now() + REPORT_PAYWALL_COUNTDOWN_MS
  );
  const value = usePaywallCountdown(deadline ?? fallbackDeadline, active);
  return (
    <PaywallCountdownContext.Provider value={value}>{children}</PaywallCountdownContext.Provider>
  );
};

/**
 * Returns the shared countdown value when rendered under a
 * {@link PaywallCountdownProvider} (no own interval). When there is no provider
 * (e.g. a standalone unit test), falls back to a local ticker driven by
 * `fallbackDeadline` so the component still works in isolation.
 */
export function usePaywallCountdownValue(fallbackDeadline: number | null): CountdownValue {
  const shared = useContext(PaywallCountdownContext);
  // Only ticks when there is NO provider — otherwise inactive (no interval).
  const local = usePaywallCountdown(fallbackDeadline, shared == null);
  return shared ?? local;
}

function ClockIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M8 4.6V8l2.4 1.6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The big flip-clock-style digit tiles shown inside the pricing card.
 * Purely presentational — receives the already-formatted MM:SS so it always
 * matches the pill. Marked aria-hidden; the adjacent "expires soon" copy and
 * the timer pill's aria-label carry the meaning for assistive tech.
 */
export const PaywallCountdownTiles: FC<{ mm: string; ss: string }> = ({ mm, ss }) => {
  const digits = [mm[0], mm[1], ss[0], ss[1]];
  return (
    <div className="rpm-cd-tiles" aria-hidden="true">
      <div className="rpm-cd-tiles__group">
        <span className="rpm-cd-tiles__tile">{digits[0]}</span>
        <span className="rpm-cd-tiles__tile">{digits[1]}</span>
      </div>
      <span className="rpm-cd-tiles__colon">:</span>
      <div className="rpm-cd-tiles__group">
        <span className="rpm-cd-tiles__tile">{digits[2]}</span>
        <span className="rpm-cd-tiles__tile">{digits[3]}</span>
      </div>
    </div>
  );
};

/**
 * One digit group. Rendered with `key={value}` by the parent so React remounts
 * it whenever the value changes — that remount is what replays the CSS "tick"
 * keyframe each second (gated behind `prefers-reduced-motion`).
 */
const CountdownDigit: FC<{ value: string }> = ({ value }) => (
  <span className="rpm-cd-digits__num" aria-hidden="true">
    {value}
  </span>
);

/**
 * Big serif MM:SS readout shown inside the locked premium chapter card
 * (Figma 7954-35930). Distinct from the modal's flip-tile {@link PaywallCountdownTiles}:
 * the card shows large Lora digits with a muted colon. Each digit is keyed by its
 * value so its CSS keyframe replays on every change (a subtle "tick"). Purely
 * presentational — fed the already-formatted MM:SS so the card stays in lock-step
 * with the modal and every other card (all derive from the same absolute deadline).
 */
export const PaywallCountdownDigits: FC<{ mm: string; ss: string }> = ({ mm, ss }) => {
  return (
    <div className="rpm-cd-digits" role="timer" aria-label={`Offer expires in ${mm}:${ss}`}>
      <CountdownDigit key={`m-${mm}`} value={mm} />
      <span className="rpm-cd-digits__colon" aria-hidden="true">
        :
      </span>
      <CountdownDigit key={`s-${ss}`} value={ss} />
    </div>
  );
};

/**
 * The compact "Expires MM:SS" pill shown in the sticky bottom bar.
 */
export const PaywallCountdownPill: FC<{ mm: string; ss: string }> = ({ mm, ss }) => {
  return (
    <span className="rpm-cd-pill" role="timer" aria-label={`Offer expires in ${mm}:${ss}`}>
      <ClockIcon />
      <span className="rpm-cd-pill__label" aria-hidden="true">
        Expires
      </span>
      <span className="rpm-cd-pill__time" aria-hidden="true">
        {mm}:{ss}
      </span>
    </span>
  );
};
