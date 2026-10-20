"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type ReactNode,
} from "react";
import posthog from "posthog-js";
import { getGaMeasurementContext } from "@features/analytics/client";
import type { PayToStartCheckoutResponse } from "@features/pay-to-start/logic/api";
import type { PayToStartOfferId } from "@features/pay-to-start/logic/offer";
import { getCsrfToken } from "@shared/http/csrf-client";
import { getStoredUtm } from "@shared/url/utm";
import {
  trackPtsCheckoutFailed,
  trackPtsCheckoutOpened,
  trackPtsCtaClick,
  type PtsCtaLocation,
} from "../analytics";
import { PTS_NOTICES } from "./payToStartContent";
import { ArrowGlyph, Spinner } from "./ptsIcons";
import { PTS_CTA_GRADIENT } from "./ptsStyles";

/**
 * Every "Unlock …" button on the page shares one checkout: one request in
 * flight however many buttons are pressed, one answer, and the page goes where it says.
 *
 *   redirect       → Stripe Checkout (or the status page while a payment settles)
 *   paid           → this browser already paid: straight to the survey
 *   used           → paid and used: the report
 *   price_changed  → the setting changed under the page: reload it, never charge a price
 *                    the visitor was not shown
 *   unavailable    → checkout or the survey is paused: say so beside the button
 *
 * Back from Stripe can restore this page from the back-forward cache with a button still
 * waiting; `pageshow` puts every button back.
 */

export type PtsCheckoutState =
  | { status: "idle" }
  | { status: "starting"; location: PtsCtaLocation }
  | { status: "failed"; location: PtsCtaLocation; message: string };

interface PtsCheckoutValue {
  offer: PayToStartOfferId;
  priceCents: number;
  /** The formatted price (formatOfferPrice): every price on the page is this one string. */
  price: string;
  state: PtsCheckoutState;
  start: (location: PtsCtaLocation) => void;
}

const PtsCheckoutContext = createContext<PtsCheckoutValue | null>(null);

export function usePtsCheckout(): PtsCheckoutValue {
  const value = useContext(PtsCheckoutContext);
  if (!value) throw new Error("usePtsCheckout needs a PtsCheckoutProvider");
  return value;
}

/** A 4xx body is written for a reader; a 5xx one is not (see startReportCheckout.ts). */
function messageForStatus(status: number): string {
  if (status === 429) return "Too many attempts in a row. Please wait a minute and try again.";
  if (status === 403) return "This page has expired. Please reload it and try again.";
  return PTS_NOTICES.checkoutFailed;
}

type Outcome = { kind: "navigating" } | { kind: "failed"; message: string; reason: string };

/**
 * A full page load, on purpose: the survey and the report boot fresh and read the cookie
 * this response just set, with nothing of this page's client state carried over.
 */
const loadPage = (url: string) => window.location.assign(new URL(url, window.location.origin).href);

/**
 * The visitor's anonymous PostHog id, so the server's purchase event can join this visit's
 * history (the ad, the page) to the buyer. Only while anonymous: an identified browser's id
 * is an email, which has no place in Stripe's metadata.
 */
function anonymousPosthogId(): string | null {
  try {
    if (posthog.get_property("$user_state") !== "anonymous") return null;
    const id = posthog.get_distinct_id();
    return typeof id === "string" && id.length > 0 && id.length <= 200 ? id : null;
  } catch {
    return null;
  }
}

async function requestCheckout(
  offer: PayToStartOfferId,
  priceCents: number,
  location: PtsCtaLocation
): Promise<Outcome> {
  const ga = getGaMeasurementContext();
  let response: Response;
  try {
    response = await fetch("/api/stripe/pay-to-start", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": getCsrfToken() },
      body: JSON.stringify({
        offer,
        displayedPriceCents: priceCents,
        gaClientId: ga.clientId,
        gaSessionId: ga.sessionId,
        gaConsent: ga.consent,
        posthogDistinctId: anonymousPosthogId(),
        utmTracker: getStoredUtm(),
      }),
    });
  } catch {
    return { kind: "failed", message: PTS_NOTICES.checkoutFailed, reason: "network" };
  }

  const body = (await response.json().catch(() => null)) as PayToStartCheckoutResponse | null;
  const state = body && typeof body === "object" && "state" in body ? body : null;

  if (state?.state === "price_changed") {
    window.location.reload();
    return { kind: "navigating" };
  }
  if (state?.state === "unavailable") {
    return { kind: "failed", message: state.message, reason: "unavailable" };
  }
  if (!response.ok || !state) {
    return {
      kind: "failed",
      message: messageForStatus(response.status),
      reason: `http_${response.status}`,
    };
  }

  switch (state.state) {
    case "redirect":
      // Stripe's page. Our own status page (a payment still settling) is no checkout.
      if (new URL(state.url, window.location.href).origin !== window.location.origin) {
        trackPtsCheckoutOpened({ location, offer, priceCents });
      }
      loadPage(state.url);
      return { kind: "navigating" };
    case "paid":
      loadPage("/survey");
      return { kind: "navigating" };
    case "used":
      if (state.reportPath) {
        loadPage(state.reportPath);
        return { kind: "navigating" };
      }
      return { kind: "failed", message: PTS_NOTICES.alreadyUsed, reason: "used" };
  }
}

export const PtsCheckoutProvider: FC<{
  offer: PayToStartOfferId;
  priceCents: number;
  price: string;
  children: ReactNode;
}> = ({ offer, priceCents, price, children }) => {
  const [state, setState] = useState<PtsCheckoutState>({ status: "idle" });
  // The guard a second click reads before React has re-rendered the first.
  const inFlight = useRef(false);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      inFlight.current = false;
      setState({ status: "idle" });
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const start = useCallback(
    (location: PtsCtaLocation) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setState({ status: "starting", location });
      trackPtsCtaClick({ location, offer, priceCents });
      void requestCheckout(offer, priceCents, location).then((outcome) => {
        if (outcome.kind === "navigating") return;
        inFlight.current = false;
        trackPtsCheckoutFailed({ location, reason: outcome.reason });
        setState({ status: "failed", location, message: outcome.message });
      });
    },
    [offer, priceCents]
  );

  const value = useMemo(
    () => ({ offer, priceCents, price, state, start }),
    [offer, priceCents, price, state, start]
  );
  return <PtsCheckoutContext.Provider value={value}>{children}</PtsCheckoutContext.Provider>;
};

/**
 * The page's gradient button. `className` carries the size and type of the instance it
 * draws (Figma draws four), the rest is shared: the gradient, the arrow, the busy state.
 */
export const PtsCtaButton: FC<{
  location: PtsCtaLocation;
  className: string;
  /** False for the sticky bar's button, which Figma draws without the glow. */
  glow?: boolean;
  children: ReactNode;
}> = ({ location, className, glow = true, children }) => {
  const { state, start } = usePtsCheckout();
  const busy = state.status === "starting";
  const mine = busy && state.location === location;
  return (
    <button
      type="button"
      onClick={() => start(location)}
      disabled={busy}
      aria-busy={mine || undefined}
      data-pts-cta={location}
      className={`focus-visible-ring group inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-sans font-semibold text-white transition-[filter,box-shadow] duration-200 hover:brightness-[1.04] disabled:cursor-progress ${PTS_CTA_GRADIENT} ${
        glow ? "shadow-[0_12px_28px_-12px_rgba(191,102,217,0.8)]" : ""
      } ${busy && !mine ? "opacity-80" : ""} ${className}`}
    >
      <span>{children}</span>
      {mine ? <Spinner /> : <ArrowGlyph />}
    </button>
  );
};

/**
 * The line under a button: the wait while its request runs, or why it did not go through.
 * Empty for every other button, so the message appears where the visitor clicked.
 */
export const PtsCtaStatus: FC<{ location: PtsCtaLocation; className?: string }> = ({
  location,
  className = "",
}) => {
  const { state } = usePtsCheckout();
  const here = state.status !== "idle" && state.location === location;
  return (
    <p
      role={here && state.status === "failed" ? "alert" : "status"}
      className={`font-sans text-[13px] leading-[18px] ${
        here && state.status === "failed" ? "text-[#a62700]" : "text-[#6b6678]"
      } ${here ? "" : "sr-only"} ${className}`}
    >
      {here ? (state.status === "failed" ? state.message : PTS_NOTICES.checkoutStarting) : ""}
    </p>
  );
};
