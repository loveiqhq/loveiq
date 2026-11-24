"use client";

import posthog from "posthog-js";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getGaMeasurementContext,
  trackBeginCheckout,
  trackInitialGateCta,
  type InitialGateCtaPlace,
} from "@features/analytics/client";
import {
  STRIPE_CHECKOUT_DISABLED_MESSAGE,
  type StripeCheckoutSessionResponse,
} from "@features/checkout/server/stripeCheckout";
import type { ChoosePriceOption } from "@features/report/logic/choosePrice";
import { INITIAL_UNLOCK_PLAN } from "@features/report/logic/initialUnlock";
import { getCsrfToken } from "@shared/http/csrf-client";
import { isOnOverlayEntry } from "@shared/ui/overlay-history";
import { previewPaidHref } from "../previewCheckout";
import { GATE_COPY } from "./gateContent";

/** The gate's card and bar, and the same two on its exit page (`exit_card` / `exit_sticky`). */
export type GateCtaPlace = InitialGateCtaPlace;

export interface InitialUnlockCheckoutState {
  status: "idle" | "redirecting" | "error";
  message: string | null;
  /** Which button the last attempt came from, so its failure shows beside it. */
  place: GateCtaPlace | null;
}

const IDLE: InitialUnlockCheckoutState = { status: "idle", message: null, place: null };

/** The price test's pick (logic/choosePrice.ts): the option, and what it charges in cents. */
export interface InitialUnlockChoice {
  option: ChoosePriceOption;
  cents: number;
}

/**
 * The gate's two buttons: one POST to /api/stripe/initial-unlock, then off to Stripe.
 *
 * - A 409 means the gate no longer stops this reader (bought, or switched off): reload, and
 *   the report opens.
 * - A failure says why in words a reader can use: a 4xx body's own, a generic line for a
 *   5xx, whose bodies are internal ("Unable to process request."), as startReportCheckout.
 * - One checkout at a time, however often a button is pressed; back from Stripe through the
 *   back-forward cache (`pageshow`, persisted) puts both buttons back.
 * - A preview (`?preview=1`) has no report to buy: the buttons open the preview of the
 *   report after the EUR 1.99 (previewCheckout.ts), with no request and nothing recorded.
 * - On the "Choose your price" half of the price test (`choice`), the request names the pick
 *   and, for an own amount, the amount; the server checks both and charges that. EUR 0 needs
 *   no Stripe: the server records the pre-unlock and answers with the report's own address,
 *   followed the same way, and nothing counts it as a checkout begun.
 */
export function useInitialUnlockCheckout({
  priceCents,
  reportSessionId,
  reportToken,
  preview = false,
  choice = null,
}: {
  priceCents: number;
  reportSessionId: string | null;
  reportToken: string | null;
  preview?: boolean;
  choice?: InitialUnlockChoice | null;
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
      if (preview) {
        window.location.assign(previewPaidHref(INITIAL_UNLOCK_PLAN));
        return;
      }
      trackInitialGateCta({ place });
      const cents = choice ? choice.cents : priceCents;
      if (cents > 0) trackBeginCheckout("initial", cents / 100, "EUR");

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
            ...(choice
              ? {
                  priceOption: choice.option,
                  ...(choice.option === "custom" ? { amountCents: choice.cents } : {}),
                }
              : {}),
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
        if (cents > 0) {
          posthog.capture("checkout_started", {
            currency: "EUR",
            plan: "initial",
            ...(choice ? { price_option: choice.option, price_cents: choice.cents } : {}),
          });
        }
        // Replace, not push, when the entry on top is the Back catch's own (useGateBack), the
        // same rule as the pricing modal (startReportCheckout): pushed on top, Stripe left that
        // same-URL duplicate behind, and Back from Stripe walked through an extra copy of the
        // report. With no such entry on top, this is the assign() it has always been.
        if (isOnOverlayEntry()) window.location.replace(json.url);
        else window.location.assign(json.url);
      } catch {
        fail(GATE_COPY.checkout.unreachable);
      }
    },
    [choice, preview, priceCents, reportSessionId, reportToken]
  );

  return { start, state };
}
