"use client";

import posthog from "posthog-js";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getGaMeasurementContext,
  trackBeginCheckout,
  trackInitialGateCta,
} from "@features/analytics/client";
import {
  STRIPE_CHECKOUT_DISABLED_MESSAGE,
  type StripeCheckoutSessionResponse,
} from "@features/checkout/server/stripeCheckout";
import { getCsrfToken } from "@shared/http/csrf-client";
import { GATE_COPY } from "./gateContent";

export type GateCtaPlace = "card" | "sticky";

export interface InitialUnlockCheckoutState {
  status: "idle" | "redirecting" | "error";
  message: string | null;
  /** Which button the last attempt came from, so its failure shows beside it. */
  place: GateCtaPlace | null;
}

const IDLE: InitialUnlockCheckoutState = { status: "idle", message: null, place: null };

/**
 * The gate's two buttons: one POST to /api/stripe/initial-unlock, then off to Stripe.
 *
 * - A 409 means the gate no longer stops this reader (bought, or switched off): reload, and
 *   the report opens.
 * - A failure says why in words a reader can use: a 4xx body's own, a generic line for a
 *   5xx, whose bodies are internal ("Unable to process request."), as startReportCheckout.
 * - One checkout at a time, however often a button is pressed; back from Stripe through the
 *   back-forward cache (`pageshow`, persisted) puts both buttons back.
 */
export function useInitialUnlockCheckout({
  priceCents,
  reportSessionId,
  reportToken,
}: {
  priceCents: number;
  reportSessionId: string | null;
  reportToken: string | null;
}) {
  const [state, setState] = useState<InitialUnlockCheckoutState>(IDLE);
  const inFlight = useRef(false);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      inFlight.current = false;
      setState(IDLE);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const start = useCallback(
    async (place: GateCtaPlace) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setState({ status: "redirecting", message: null, place });
      trackInitialGateCta({ place });
      trackBeginCheckout("initial", priceCents / 100, "EUR");

      const fail = (message: string) => {
        inFlight.current = false;
        setState({ status: "error", message, place });
      };

      try {
        const ga = getGaMeasurementContext();
        const response = await fetch("/api/stripe/initial-unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() },
          body: JSON.stringify({
            reportToken,
            reportSessionId: reportToken ? null : reportSessionId,
            gaClientId: ga.clientId ?? undefined,
            gaConsent: ga.consent,
            gaSessionId: ga.sessionId ?? undefined,
          }),
        });
        const json = (await response.json().catch(() => null)) as
          StripeCheckoutSessionResponse | { error?: string } | null;

        if (response.status === 409) {
          window.location.reload();
          return;
        }
        if (!response.ok) {
          const serverMessage =
            response.status < 500 && json && "error" in json && typeof json.error === "string"
              ? json.error
              : null;
          fail(serverMessage ?? GATE_COPY.checkout.failed);
          return;
        }
        if (!json || !("enabled" in json) || !json.enabled) {
          fail(
            json && "message" in json && typeof json.message === "string"
              ? json.message
              : STRIPE_CHECKOUT_DISABLED_MESSAGE
          );
          return;
        }
        if (!json.url) {
          fail(GATE_COPY.checkout.noUrl);
          return;
        }
        posthog.capture("checkout_started", { currency: "EUR", plan: "initial" });
        window.location.assign(json.url);
      } catch {
        fail(GATE_COPY.checkout.unreachable);
      }
    },
    [priceCents, reportSessionId, reportToken]
  );

  return { start, state };
}
