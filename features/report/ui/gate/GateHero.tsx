"use client";

import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { useRef, useState, type FC, type MouseEvent } from "react";
import { trackInitialGateBack } from "@features/analytics/client";
import { EXIT_LEAVE_PARAM } from "./exit/exitContent";
import { openExit } from "./exit/exitHistory";
import { GATE_COPY, GATE_NOT_READY_TO } from "./gateContent";

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
 * the reader is not ready, and since 28.10 opens the gate's exit page (./exit), which makes the
 * case and asks why, for every reader, wherever they came from. On this URL, as `?leave=pre`
 * on its own history entry (exit/exitHistory.ts): Back returns here. Its word is its name
 * (persona walks 24.10: a bare arrow said nothing). Its analytics event keeps its first name,
 * recorded once a gate, and not for a new tab, which opens the exit page there instead.
 */
export const GateHero: FC = () => {
  const [reducedMotion] = useState(prefersReducedMotion);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const href = (() => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("anchor");
    params.delete("unlocked");
    params.set(EXIT_LEAVE_PARAM, "pre");
    return `${pathname ?? ""}?${params.toString()}`;
  })();
  const counted = useRef(false);
  const notReady = (e: MouseEvent<HTMLAnchorElement>) => {
    // A new tab (cmd/ctrl/shift or a middle click) opens the exit page there; this one stays.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (!counted.current) {
      counted.current = true;
      trackInitialGateBack({ to: GATE_NOT_READY_TO });
    }
    openExit("pre");
  };

  return (
    <>
      <header className="iug-header">
        <a href={href} className="iug-header__back" onClick={notReady}>
          <Image src="/report/gate/back.svg" alt="" width={12} height={12} unoptimized />
          <span className="iug-header__back-label">{GATE_COPY.notReady}</span>
        </a>
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
