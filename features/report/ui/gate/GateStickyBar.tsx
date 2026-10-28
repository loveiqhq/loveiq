"use client";

import Image from "next/image";
import { useEffect, useRef, type FC } from "react";
import { GATE_COPY } from "./gateContent";
import type { GateCtaPlace, InitialUnlockCheckoutState } from "./useInitialUnlockCheckout";

/**
 * 1650:2667: the guarantee and the button, pinned to the bottom (the frame's "sticky CTA").
 * There from the first paint (sync 23.10, Marcus and Fatih: "the call to action should be
 * sticky immediately"), as pay to start's bar is: it used to wait until the card's own
 * button had scrolled away. It steps up over the cookie banner (--liq-consent-h) and clears
 * the home indicator. A failed click says why in a line above its row.
 */
export const GateStickyBar: FC<{
  guaranteeDays: number;
  onUnlock: (place: GateCtaPlace) => void;
  priceCents: number;
  state: InitialUnlockCheckoutState;
}> = ({ guaranteeDays, onUnlock, priceCents, state }) => {
  const busy = state.status === "redirecting";
  const failed = state.status === "error" && state.place === "sticky" ? state.message : null;
  const barRef = useRef<HTMLDivElement>(null);

  // The room the page keeps under its last line, and the scroll padding that keeps a
  // focused button clear (initial-unlock-gate.css), read this bar's real height: more than
  // the frame's 56px on a narrow phone, and an error line on top.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--iug-sticky-h", `${bar.offsetHeight}px`);
    publish();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    observer?.observe(bar);
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--iug-sticky-h");
    };
  }, []);

  return (
    <div ref={barRef} className="iug-sticky" data-testid="iug-sticky">
      {failed ? (
        <p role="alert" className="iug-sticky__error">
          {failed}
        </p>
      ) : null}
      <div className="iug-sticky__row">
        <div className="iug-sticky__guarantee">
          <span className="iug-sticky__shield" aria-hidden="true">
            <Image
              className="iug-sticky__shield-frame"
              src="/report/gate/sticky-shield-frame.svg"
              alt=""
              width={20.08}
              height={20.08}
              unoptimized
            />
            <Image
              className="iug-sticky__shield-mark"
              src="/report/gate/sticky-shield.svg"
              alt=""
              width={10.01}
              height={10.93}
              unoptimized
            />
          </span>
          <span className="iug-sticky__text">
            <span className="iug-sticky__days">{GATE_COPY.sticky.guarantee(guaranteeDays)}</span>
            <span className="iug-sticky__line">{GATE_COPY.sticky.guaranteeLine}</span>
          </span>
        </div>
        <button
          type="button"
          className="iug-sticky__cta"
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={() => onUnlock("sticky")}
        >
          {GATE_COPY.sticky.cta(priceCents)}
          <span aria-hidden="true">{" →"}</span>
        </button>
      </div>
    </div>
  );
};
