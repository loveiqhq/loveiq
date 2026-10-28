"use client";

import { useEffect } from "react";
import type { InitialUnlockGatePayload } from "@features/report/logic/initialUnlockGate";
import { useInitialUnlockCheckout } from "../useInitialUnlockCheckout";
import PaygateExitPage, { type ExitCtaPlace } from "./PaygateExitPage";

export interface PreUnlockExitProps {
  gate: InitialUnlockGatePayload;
  reportToken: string | null;
  reportSessionId: string | null;
  /** The header's arrow: back to the EUR 1.99 page, which stays mounted under this one. */
  onBack: () => void;
  /** "Maybe later": the landing page, as "Not ready to unlock yet" led until 28.10. */
  onLeave: () => void;
}

/**
 * Where the EUR 1.99 gate's "Not ready to unlock yet" leads (Marcus's Main board, 28.10), in
 * place of the landing page it led to before. The gate stays mounted, hidden, under it: it
 * keeps the reader's submission bound for the events, and Back finds it as it was. Its two
 * buttons are the gate's, through the same checkout, recorded as pressed on the exit page.
 */
export default function PreUnlockExit({
  gate,
  reportToken,
  reportSessionId,
  onBack,
  onLeave,
}: PreUnlockExitProps) {
  const { start, state } = useInitialUnlockCheckout({
    priceCents: gate.priceCents,
    reportSessionId,
    reportToken,
  });

  // The link sat at the top of the gate; the exit page opens at its own top too, and going back
  // finds the gate where the reader left it ("Maybe later" leaves the report: not there).
  useEffect(() => {
    const gateY = window.scrollY;
    const path = window.location.pathname;
    window.scrollTo({ top: 0, behavior: "instant" });
    return () => {
      if (window.location.pathname === path) window.scrollTo({ top: gateY, behavior: "instant" });
    };
  }, []);

  const errorPlace: ExitCtaPlace | null =
    state.place === "exit_card" ? "card" : state.place === "exit_sticky" ? "sticky" : null;

  return (
    <PaygateExitPage
      stage="pre"
      offer={{ priceCents: gate.priceCents }}
      creditCents={gate.creditCents}
      guaranteeDays={gate.guaranteeDays}
      seed={String(gate.submissionId ?? "preview")}
      checkout={{
        busy: state.status === "redirecting",
        error: state.status === "error" ? state.message : null,
        errorPlace,
      }}
      onUnlock={(place) => void start(place === "card" ? "exit_card" : "exit_sticky")}
      onBack={onBack}
      onLeave={onLeave}
      leaveHref="/"
    />
  );
}
