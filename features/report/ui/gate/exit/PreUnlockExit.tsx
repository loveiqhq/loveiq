"use client";

import { useEffect } from "react";
import type { InitialUnlockGatePayload } from "@features/report/logic/initialUnlockGate";
import { useExitCloseRequest } from "../useGateBack";
import { useInitialUnlockCheckout } from "../useInitialUnlockCheckout";
import PaygateExitPage, { type ExitCtaPlace } from "./PaygateExitPage";

export interface PreUnlockExitProps {
  gate: InitialUnlockGatePayload;
  reportToken: string | null;
  reportSessionId: string | null;
  /** `?preview=1`: nothing to buy, so its buttons open the report's preview after the EUR 1.99. */
  preview?: boolean;
  /**
   * The header's arrow, and "Maybe later" too: back to the EUR 1.99 page, which stays mounted
   * under this one. Nothing on the gate's loop leads off the report (Marcus, 30.10: "we loop them
   * back to the paygate").
   */
  onBack: () => void;
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
  preview = false,
  onBack,
}: PreUnlockExitProps) {
  const { start, state } = useInitialUnlockCheckout({
    priceCents: gate.priceCents,
    reportSessionId,
    reportToken,
    preview,
  });

  // Android's back here is a close request, answered with the arrow's way back to the gate, so a
  // reader who met the gate without a tap isn't carried past it (gate/useGateBack.ts). Counted
  // as the page goes, as a phone's Back always was (`browser_back`).
  useExitCloseRequest(true, onBack);

  // The link sat at the top of the gate; the exit page opens at its own top too, and going back
  // (the arrow or "Maybe later") finds the gate where the reader left it.
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
      surveyMinutes={gate.surveyMinutes ?? null}
      seed={String(gate.submissionId ?? "preview")}
      checkout={{
        busy: state.status === "redirecting",
        error: state.status === "error" ? state.message : null,
        errorPlace,
      }}
      onUnlock={(place) => void start(place === "card" ? "exit_card" : "exit_sticky")}
      onBack={onBack}
      onLeave={onBack}
    />
  );
}
