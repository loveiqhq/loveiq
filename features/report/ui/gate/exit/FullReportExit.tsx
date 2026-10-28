"use client";

import { useEffect } from "react";
import {
  INITIAL_UNLOCK_CREDIT_CENTS,
  type InitialUnlockSource,
} from "@features/report/logic/initialUnlock";
import {
  INITIAL_UNLOCK_GUARANTEE_DAYS,
  INITIAL_UNLOCK_PRICE_CENTS,
} from "@features/report/logic/initialUnlockGate";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";
import { trackPaygateExitCta } from "@features/analytics/client";
import { lockBodyScroll, unlockBodyScroll } from "@shared/ui/body-scroll-lock";
import PaygateExitPage from "./PaygateExitPage";

export interface FullReportExitProps {
  /** The reader's own full-report quote, the EUR 10 already off (creditKind "initial"). */
  quote: ReportPriceQuoteSnapshot;
  unlockSource: InitialUnlockSource | null;
  /** On the way to Stripe: both buttons wait. Failures show in the report's own hand-off. */
  busy: boolean;
  onUnlock: () => void;
  /** The arrow and "Back to my open chapters": the report, where the reader left it. */
  onBack: () => void;
  /** The report under the layer (its `<main>`), kept out of reach and of a screen reader. */
  behindId?: string;
  /** The reader's submission, or "preview": it seeds the reasons' order. */
  seed: string;
}

/**
 * Where the plan picker's "Not ready to unlock yet" leads a EUR 1.99 holder (Marcus's
 * FullUnlock board, 28.10): a layer over the report, which stays mounted under it, so the way
 * back lands on the chapter and the scroll position the reader left. The report's own
 * binding of the submission carries the events.
 */
export default function FullReportExit({
  quote,
  unlockSource,
  busy,
  onUnlock,
  onBack,
  behindId = "main-content",
  seed,
}: FullReportExitProps) {
  // The body holds still under the layer, through the one shared lock the picker uses too.
  useEffect(() => {
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, []);

  // The report under it is inert while the layer is up; the page in it takes the focus.
  useEffect(() => {
    const behind = document.getElementById(behindId);
    behind?.setAttribute("inert", "");
    return () => behind?.removeAttribute("inert");
  }, [behindId]);

  const creditCents = quote.upgradeCreditCents ?? INITIAL_UNLOCK_CREDIT_CENTS;

  return (
    // `data-lenis-prevent`: the page's smooth scroll would take the wheel off this scroller, as
    // it would off the plan picker's (which carries the same attribute).
    <div
      className="pge-layer"
      role="dialog"
      aria-modal="true"
      aria-label="Your Full Report"
      data-lenis-prevent=""
    >
      <PaygateExitPage
        stage="full"
        offer={{
          priceCents: quote.chargedPriceCents,
          strikeCents: quote.chargedPriceCents + creditCents,
        }}
        creditCents={creditCents}
        guaranteeDays={INITIAL_UNLOCK_GUARANTEE_DAYS}
        initialPriceCents={INITIAL_UNLOCK_PRICE_CENTS}
        unlockSource={unlockSource}
        seed={seed}
        checkout={{ busy, error: null, errorPlace: null }}
        onUnlock={(place) => {
          // The full report's checkout records no place of its own (begin_checkout's fields
          // are fixed), so the exit page records the press.
          trackPaygateExitCta({ stage: "full", place });
          onUnlock();
        }}
        onBack={onBack}
        onLeave={onBack}
      />
    </div>
  );
}
