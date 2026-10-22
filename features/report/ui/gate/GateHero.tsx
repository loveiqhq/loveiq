"use client";

import Image from "next/image";
import { useState, type FC } from "react";
import { trackInitialGateBack } from "@features/analytics/client";
import { GATE_COPY } from "./gateContent";

/**
 * Whether the reader came here from our survey's last screen: the only page the back arrow
 * returns to. From an email, a bookmark or a reload there is nowhere of ours to go back to,
 * so there is no arrow (the gate itself never closes).
 */
function cameFromSurvey(): boolean {
  if (typeof document === "undefined" || !document.referrer) return false;
  try {
    const from = new URL(document.referrer);
    return from.origin === window.location.origin && from.pathname.startsWith("/survey");
  } catch {
    return false;
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * 1609:11160, 1612:2670: the back arrow, then the moment the gate is built on. Mark, on the
 * frame: a progress bar fills first, then makes way for "Your Core Archetype was
 * determined", which pulses with the headline (1610:2667, 1604:2387, one 2.5 s loop).
 * Under reduced motion there is no bar and nothing pulses.
 */
export const GateHero: FC = () => {
  const [canGoBack] = useState(cameFromSurvey);
  const [reducedMotion] = useState(prefersReducedMotion);

  return (
    <>
      <header className="iug-header">
        {canGoBack ? (
          <button
            type="button"
            className="iug-header__back"
            aria-label={GATE_COPY.back}
            onClick={() => {
              trackInitialGateBack();
              window.history.back();
            }}
          >
            <Image src="/report/gate/back.svg" alt="" width={12} height={12} unoptimized />
          </button>
        ) : null}
      </header>

      <div className={`iug-hero${reducedMotion ? "" : " iug-hero--motion"}`}>
        <div className="iug-hero__status">
          {reducedMotion ? null : (
            <span className="iug-progress" data-testid="iug-progress" aria-hidden="true">
              <span className="iug-progress__fill" />
            </span>
          )}
          <p className="iug-badge">
            <Image
              className="iug-badge__check"
              src="/report/gate/success-check.svg"
              alt=""
              width={15}
              height={11.5}
              unoptimized
            />
            {GATE_COPY.badge}
          </p>
        </div>
        <h1 className="iug-hero__title">
          <span className="iug-hero__lead">{GATE_COPY.headline.lead}</span>{" "}
          <em className="iug-hero__emph">{GATE_COPY.headline.emph}</em>
        </h1>
      </div>
    </>
  );
};
