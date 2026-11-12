"use client";

import { useEffect, useRef } from "react";
import { setReportSubmissionContext, trackInitialGateViewed } from "@features/analytics/client";
import ScrollAnimator from "@features/landing/ui/ScrollAnimator";
import { isGateReveal } from "@features/report/logic/gateReveal";
import type { InitialUnlockGatePayload } from "@features/report/logic/initialUnlockGate";
import { GateChapterMap } from "./GateChapterMap";
import { GateHero } from "./GateHero";
import { GateReveal } from "./GateReveal";
import { GATE_REVEAL_COPY } from "./gateRevealContent";
import { GatePayments, GatePriceCard } from "./GatePriceCard";
import { GateStickyBar } from "./GateStickyBar";
import { GateReviews, GateWhyUnlock } from "./GateWhyUnlock";
import { useInitialUnlockCheckout } from "./useInitialUnlockCheckout";
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
  const { start, state } = useInitialUnlockCheckout({
    priceCents: gate.priceCents,
    reportSessionId,
    reportToken,
    preview,
  });

  // The submission is bound while the gate is on screen, and let go when it goes: "Not ready
  // to unlock yet" leaves for the landing page in the same tab, whose signals are not this
  // report's. It is bound first, or the viewed event below is not persisted.
  useEffect(() => {
    setReportSubmissionContext(gate.submissionId);
    return () => setReportSubmissionContext(null);
  }, [gate.submissionId]);

  // Seen once per page.
  const viewedRef = useRef(false);
  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    trackInitialGateViewed({ submission_id: gate.submissionId });
  }, [gate.submissionId]);

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

  // The shell is the page's ground (the status pages' wash on a desktop); the frame is the column.
  return (
    <div className="iug-shell">
      <main ref={mainRef} className="iug-page" tabIndex={-1}>
        <ScrollAnimator />
        <GateHero headline={!reveal} />
        {reveal ? <GateReveal reveal={reveal} onLocked={toPricing} /> : null}
        <section
          ref={pricingRef}
          className={`iug-pricing${reveal ? " iug-pricing--reveal" : ""}`}
          aria-label="Your Core Archetype"
        >
          <GatePriceCard
            gate={gate}
            onUnlock={start}
            state={state}
            title={reveal ? GATE_REVEAL_COPY.cardTitle : undefined}
            description={reveal ? null : undefined}
          />
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
          onUnlock={start}
          priceCents={gate.priceCents}
          state={state}
        />
      </main>
    </div>
  );
}
