"use client";

import Image from "next/image";
import type { FC } from "react";
import { GATE_COPY } from "./gateContent";
import type { GateCtaPlace, InitialUnlockCheckoutState } from "./useInitialUnlockCheckout";

/**
 * 1650:2667: the guarantee and the button, pinned to the bottom (the frame's "sticky CTA").
 * It shows only while the card's own button is out of view, so the two never stand on top
 * of each other; hidden, it is inert. It steps up over the cookie banner (--liq-consent-h)
 * and clears the home indicator. A failed click says why in a line above its row.
 */
export const GateStickyBar: FC<{
  guaranteeDays: number;
  onUnlock: (place: GateCtaPlace) => void;
  priceCents: number;
  state: InitialUnlockCheckoutState;
  visible: boolean;
}> = ({ guaranteeDays, onUnlock, priceCents, state, visible }) => {
  const busy = state.status === "redirecting";
  const failed = state.status === "error" && state.place === "sticky" ? state.message : null;
  return (
    <div
      className="iug-sticky"
      data-testid="iug-sticky"
      data-visible={visible ? "true" : "false"}
      aria-hidden={visible ? undefined : true}
      inert={!visible}
    >
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
