"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  setReportSubmissionContext,
  trackExperimentExposure,
  trackInitialGateCta,
  trackInitialGateViewed,
} from "@features/analytics/client";
import ScrollAnimator from "@features/landing/ui/ScrollAnimator";
import { GATE_REVEAL_EXPERIMENT, isGateRevealArm } from "@shared/experiments/gateRevealArm";
import { GATE_PRICE_EXPERIMENT, isGatePriceArm } from "@shared/experiments/gatePriceArm";
import { CHOOSE_PRICE_DEFAULT } from "@features/report/logic/choosePrice";
import { isGateReveal } from "@features/report/logic/gateReveal";
import type { InitialUnlockGatePayload } from "@features/report/logic/initialUnlockGate";
import { shieldTaps } from "./exit/exitHistory";
import { GateChapterMap } from "./GateChapterMap";
import {
  choiceCents,
  choiceStickyCta,
  GateChoosePriceCard,
  GateWhyChoose,
  GateZeroConfirm,
  isFreeChoice,
  type PriceChoice,
} from "./GateChoosePrice";
import { GATE_CHOOSE_COPY, GATE_PICK_PRICE_EVENT } from "./gateChoosePriceContent";
import { GateHero } from "./GateHero";
import { GateReveal } from "./GateReveal";
import { GATE_REVEAL_COPY } from "./gateRevealContent";
import { GatePayments, GatePriceCard } from "./GatePriceCard";
import { GateStickyBar } from "./GateStickyBar";
import { GateReviews, GateWhyUnlock } from "./GateWhyUnlock";
import { useInitialUnlockCheckout, type GateCtaPlace } from "./useInitialUnlockCheckout";
import "../paygate.css";
import "./initial-unlock-gate.css";

export interface InitialUnlockGateProps {
  gate: InitialUnlockGatePayload;
  reportToken: string | null;
  reportSessionId: string | null;
  /** `?preview=1`: nothing to buy, so its buttons open the report's preview after the EUR 1.99. */
  preview?: boolean;
}

/**
 * The EUR 1.99 pre-unlock gate (Notion "RFD > Pre-Unlock", Figma Report-3.0 1604:2374, its
 * sticky bar 1650:2667), drawn by ReportPage in place of the report for a reader it stops.
 * A page of its own, never a pop-up over the report: there is no report behind it, so
 * nothing of the report's (its pop-ups, offers, tour or sticky bar) can open over it, and
 * there is nothing to close. Everything below the card flies in as it is scrolled to, as on
 * the landing (ScrollAnimator); the price and the buttons never move.
 */
export default function InitialUnlockGate({
  gate,
  reportToken,
  reportSessionId,
  preview = false,
}: InitialUnlockGateProps) {
  // The page takes the focus as it opens, unless something holds it: it may have just replaced
  // the report the guided tour ran over (tour first), whose bubble had it, and a screen reader
  // then hears the page change rather than nothing.
  const mainRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body) mainRef.current?.focus({ preventScroll: true });
  }, []);
  // The price test (shared/experiments/gatePriceArm.ts): its "Choose your price" half picks the
  // price on Marcus's card (GateChoosePrice.tsx), EUR 6.99 picked as the page opens; today's
  // page's half meets the gate as it always was.
  const priceArm = isGatePriceArm(gate.priceArm) ? gate.priceArm : null;
  const choosing = priceArm === "choose";
  const [choice, setChoice] = useState<PriceChoice>({
    option: CHOOSE_PRICE_DEFAULT,
    amountText: "",
  });
  const chosenCents = choosing ? choiceCents(choice) : null;
  const checkoutChoice = useMemo(
    () => (choosing && chosenCents !== null ? { option: choice.option, cents: chosenCents } : null),
    [choosing, choice.option, chosenCents]
  );
  const { start, state } = useInitialUnlockCheckout({
    priceCents: gate.priceCents,
    reportSessionId,
    reportToken,
    preview,
    choice: checkoutChoice,
  });
  const amountRef = useRef<HTMLInputElement | null>(null);

  // The "Are you sure?" sheet (GateZeroConfirm, Marcus's hotfix of 27 Nov): open from the button
  // that asked for the result with an own amount of EUR 0, which takes the focus back when it
  // closes.
  const [zeroFrom, setZeroFrom] = useState<GateCtaPlace | null>(null);
  const refocus = useRef<GateCtaPlace | null>(null);
  const closeZero = useCallback(() => {
    refocus.current = zeroFrom;
    setZeroFrom(null);
  }, [zeroFrom]);
  useEffect(() => {
    const place = refocus.current;
    if (zeroFrom !== null || !place) return;
    refocus.current = null;
    mainRef.current
      ?.querySelector<HTMLElement>(place === "sticky" ? ".iug-sticky__cta" : ".iug-choose__cta")
      ?.focus({ preventScroll: true });
  }, [zeroFrom]);

  // The submission is bound while the gate is on screen, and let go when it goes: "Not ready
  // to unlock yet" leaves for the landing page in the same tab, whose signals are not this
  // report's. It is bound first, or the viewed event below is not persisted.
  useEffect(() => {
    setReportSubmissionContext(gate.submissionId);
    return () => setReportSubmissionContext(null);
  }, [gate.submissionId]);

  // Seen once per page. While Mark's 50/50 runs (shared/experiments/gateRevealArm.ts), the
  // reader's half is counted here too, in both halves, so its readout compares readers who
  // reached the gate (the pay pop-up's pattern, popupArm.ts).
  const viewedRef = useRef(false);
  const revealArm = isGateRevealArm(gate.revealArm) ? gate.revealArm : null;
  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    trackInitialGateViewed({ submission_id: gate.submissionId });
    // The price test replaced the 50/50 and has its own name, so its exposure never joins the
    // reveal's (one or the other, never both).
    if (priceArm) {
      trackExperimentExposure({
        experiment: GATE_PRICE_EXPERIMENT,
        variant: priceArm,
        surface: "gate",
      });
    } else if (revealArm) {
      trackExperimentExposure({
        experiment: GATE_REVEAL_EXPERIMENT,
        variant: revealArm,
        surface: "gate",
      });
    }
  }, [gate.submissionId, priceArm, revealArm]);

  // Mark's redesigned page (logic/gateReveal.ts), when its switch sent the archetype along.
  const reveal = isGateReveal(gate.reveal) ? gate.reveal : null;
  const pricingRef = useRef<HTMLElement | null>(null);
  // A locked aspect card's lock: down to the plan that opens it, its button focused.
  const toPricing = () => {
    const section = pricingRef.current;
    if (!section) return;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    section.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    section.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  };

  // The picker in view with its pick focused: an own amount that can't be charged yet, or the
  // exit page's "Choose your price" (GATE_PICK_PRICE_EVENT). It reads only the page itself.
  const toPicker = useCallback((focusAmount: boolean) => {
    const section = pricingRef.current;
    if (!section) return;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    section.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    const target = focusAmount
      ? amountRef.current
      : section.querySelector<HTMLInputElement>('input[type="radio"]:checked');
    target?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (!choosing) return;
    const onPick = () => toPicker(false);
    window.addEventListener(GATE_PICK_PRICE_EVENT, onPick);
    return () => window.removeEventListener(GATE_PICK_PRICE_EVENT, onPick);
  }, [choosing, toPicker]);

  // Both buttons: an own amount of EUR 0 asks "Are you sure?" first, and one that can't be
  // charged sends the reader to its field instead.
  const unlock = (place: GateCtaPlace) => {
    if (choosing && isFreeChoice(choice)) {
      // Counted as any Unlock press is (AP's "pressed Unlock"), and shielded: a double tap's
      // second tap would land on the sheet's buttons, which open under the finger.
      trackInitialGateCta({ place });
      shieldTaps();
      setZeroFrom(place);
      return;
    }
    if (choosing && chosenCents === null) {
      toPicker(true);
      return;
    }
    void start(place);
  };

  // The shell is the page's ground (the status pages' wash on a desktop); the frame is the column.
  return (
    <div className="iug-shell">
      <main ref={mainRef} className="iug-page" tabIndex={-1} inert={zeroFrom !== null}>
        <ScrollAnimator />
        <GateHero headline={!reveal} lead={choosing ? GATE_CHOOSE_COPY.headlineLead : undefined} />
        {reveal ? <GateReveal reveal={reveal} onLocked={toPricing} /> : null}
        <section
          ref={pricingRef}
          className={`iug-pricing${reveal ? " iug-pricing--reveal" : ""}`}
          aria-label="Your Core Archetype"
        >
          {choosing ? (
            <>
              <GateChoosePriceCard
                gate={gate}
                choice={choice}
                onChoice={setChoice}
                onUnlock={unlock}
                state={state}
                amountRef={amountRef}
              />
              <GateWhyChoose />
            </>
          ) : (
            <GatePriceCard
              gate={gate}
              onUnlock={start}
              state={state}
              title={reveal ? GATE_REVEAL_COPY.cardTitle : undefined}
              description={reveal ? null : undefined}
            />
          )}
        </section>
        <GatePayments />
        <div className="iug-divider" aria-hidden="true" />
        <div className="iug-sections">
          <GateChapterMap />
          <GateWhyUnlock />
        </div>
        <div className="iug-divider" aria-hidden="true" />
        <GateReviews />
        <GateStickyBar
          guaranteeDays={gate.guaranteeDays}
          onUnlock={choosing ? unlock : start}
          priceCents={gate.priceCents}
          state={state}
          ctaLabel={choosing ? choiceStickyCta(choice) : undefined}
        />
      </main>
      {choosing && zeroFrom !== null ? (
        <GateZeroConfirm
          state={state}
          onChoose={(pick) => void start(zeroFrom, pick)}
          onClose={closeZero}
        />
      ) : null}
    </div>
  );
}
