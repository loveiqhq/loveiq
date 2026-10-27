"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, type FC, type MouseEvent } from "react";
import { trackInitialGateBack } from "@features/analytics/client";
import { GATE_COPY, GATE_NOT_READY_HREF } from "./gateContent";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * 1609:11160, 1612:2670: the way out, then the moment the gate is built on. Mark, on the
 * frame: a progress bar fills first, then makes way for "Your Core Archetype was
 * determined", which pulses with the headline (1610:2667, 1604:2387, one 2.5 s loop).
 * Under reduced motion there is no bar and nothing pulses.
 *
 * The way out is not "Back" (sync 26.10, Marcus: "there is no such thing as back"): it says
 * the reader is not ready, and leads to GATE_NOT_READY_HREF for every reader, wherever they
 * came from. Its word is its name (persona walks 24.10: a bare arrow said nothing). Not
 * prefetched: most readers never take it. Its analytics event keeps its first name.
 */
export const GateHero: FC = () => {
  const [reducedMotion] = useState(prefersReducedMotion);
  const left = useRef(false);
  const leave = (e: MouseEvent<HTMLAnchorElement>) => {
    // Once, and not for a new tab (cmd/ctrl/shift or a middle click): that reader stays here.
    if (left.current || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    left.current = true;
    trackInitialGateBack({ to: GATE_NOT_READY_HREF });
  };

  return (
    <>
      <header className="iug-header">
        <Link
          href={GATE_NOT_READY_HREF}
          prefetch={false}
          className="iug-header__back"
          onClick={leave}
        >
          <Image src="/report/gate/back.svg" alt="" width={12} height={12} unoptimized />
          <span className="iug-header__back-label">{GATE_COPY.notReady}</span>
        </Link>
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
