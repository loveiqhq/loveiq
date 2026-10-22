"use client";

import Image from "next/image";
import { forwardRef } from "react";
import type { InitialUnlockGatePayload } from "@features/report/logic/initialUnlockGate";
import { PAYMENT_MARKS } from "../paymentMarks";
import { GATE_COPY, euros } from "./gateContent";
import type { GateCtaPlace, InitialUnlockCheckoutState } from "./useInitialUnlockCheckout";

interface GatePriceCardProps {
  gate: InitialUnlockGatePayload;
  onUnlock: (place: GateCtaPlace) => void;
  state: InitialUnlockCheckoutState;
}

/**
 * 1604:2388: the one plan on the gate. It is the pricing modal's highlighted card
 * (paygate.css `rpg-card--hero`, the same frame family), so it draws with the same classes;
 * initial-unlock-gate.css carries where 1604:2388 differs. The price and the button never
 * animate; the four lines below them come in one after the other (Mark, on the frame).
 * The ref is the button's, which the sticky bar watches.
 */
export const GatePriceCard = forwardRef<HTMLButtonElement, GatePriceCardProps>(
  function GatePriceCard({ gate, onUnlock, state }, ctaRef) {
    const busy = state.status === "redirecting";
    const failed = state.status === "error" && state.place === "card" ? state.message : null;
    return (
      <article className="rpg-card rpg-card--hero iug-card">
        <span className="rpg-card__badge iug-card__badge">{GATE_COPY.card.badge}</span>

        <div className="rpg-card__head">
          <h2 className="rpg-card__title iug-card__title">
            <span className="rpg-card__lead">{GATE_COPY.card.title}</span>
          </h2>
          <p className="rpg-card__desc">{GATE_COPY.card.description}</p>
        </div>

        <p className="rpg-card__price">
          <span className="rpg-card__amount">{euros(gate.priceCents)}</span>{" "}
          <span className="rpg-card__suffix iug-card__suffix">{GATE_COPY.card.priceSuffix}</span>
        </p>

        <button
          ref={ctaRef}
          type="button"
          className="rpg-card__cta rpg-card__cta--filled"
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={() => onUnlock("card")}
        >
          <span>
            {GATE_COPY.card.cta}
            <span aria-hidden="true">{"  →"}</span>
          </span>
        </button>
        <p role="status" className="iug-sr-only">
          {busy && state.place === "card" ? GATE_COPY.checkout.starting : ""}
        </p>
        {failed ? (
          <p role="alert" className="iug-card__error">
            {failed}
          </p>
        ) : null}

        <div className="rpg-card__details">
          <p className="rpg-card__guarantee iug-card__guarantee">
            <Image
              src="/report/paygate/shield.svg"
              alt=""
              width={15}
              height={15}
              unoptimized
              aria-hidden="true"
            />
            {GATE_COPY.card.guarantee(gate.guaranteeDays)}
          </p>
          <ul className="rpg-card__features">
            {GATE_COPY.card.features(gate.creditCents).map((feature, index) => (
              <li
                key={feature}
                className="rpg-card__feature iug-card__feature"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <Image
                  src="/report/paygate/check.svg"
                  alt=""
                  width={16}
                  height={16}
                  unoptimized
                  aria-hidden="true"
                />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </article>
    );
  }
);

/** 1604:2426: the pricing modal's row of payment marks (paymentMarks.ts), as drawn. */
export const GatePayments = () => (
  <div className="iug-payments">
    <p className="rpg__payments-label">{GATE_COPY.paymentsLabel}</p>
    <div className="rpg__payments-row" aria-label="Accepted payment methods">
      {PAYMENT_MARKS.map(({ logo, label }) => (
        <span key={logo} className={`rpg__mark rpg__mark--${logo}`} role="img" aria-label={label} />
      ))}
    </div>
  </div>
);
