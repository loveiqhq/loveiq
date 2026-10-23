"use client";

import { useEffect, useRef, useState } from "react";
import { setReportSubmissionContext, trackInitialGateViewed } from "@features/analytics/client";
import ScrollAnimator from "@features/landing/ui/ScrollAnimator";
import type { InitialUnlockGatePayload } from "@features/report/logic/initialUnlockGate";
import { GateChapterMap } from "./GateChapterMap";
import { GateHero } from "./GateHero";
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
}: InitialUnlockGateProps) {
  const { start, state } = useInitialUnlockCheckout({
    priceCents: gate.priceCents,
    reportSessionId,
    reportToken,
  });

  // The sticky bar stands in for the card's button only while that button is out of view.
  const ctaRef = useRef<HTMLButtonElement | null>(null);
  const [stickyVisible, setStickyVisible] = useState(false);
  useEffect(() => {
    const cta = ctaRef.current;
    if (!cta || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setStickyVisible(!entry.isIntersecting);
    });
    observer.observe(cta);
    return () => observer.disconnect();
  }, []);

  // Seen once per page: the submission is bound first, or the event is not persisted.
  const viewedRef = useRef(false);
  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    setReportSubmissionContext(gate.submissionId);
    trackInitialGateViewed({ submission_id: gate.submissionId });
  }, [gate.submissionId]);

  // The shell is the page's ground (the status pages' wash on a desktop); the frame is the column.
  return (
    <div className="iug-shell">
      <main className="iug-page">
        <ScrollAnimator />
        <GateHero />
        <section className="iug-pricing" aria-label="Your Core Archetype">
          <GatePriceCard ref={ctaRef} gate={gate} onUnlock={start} state={state} />
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
          visible={stickyVisible}
        />
      </main>
    </div>
  );
}
