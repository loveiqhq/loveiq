"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FC } from "react";
import type { PayToStartStatusResponse } from "@features/pay-to-start/logic/api";
import {
  CHECKOUT_SESSION_ID_REGEX,
  PAY_TO_START_RETURN_PATH,
} from "@features/pay-to-start/logic/journey";
import { trackPtsPurchase, trackPtsStatusViewed } from "../analytics";
import { PTS_STATUS } from "../landing/payToStartContent";
import { PtsCtaStatus, usePtsCheckout } from "../landing/PtsCheckout";

/**
 * The "Checkout status" page Stripe sends a buyer back to (success_url
 * /sexual-archetype/checkout?session_id=…; Figma 1475:2090-2092, the report's own return
 * page restyled for this journey, so it keeps that page's look and classes).
 *
 *   08 verifying   → asks the status route, which settles the session with Stripe itself
 *   09 received    → paid with a method still settling: asks again every 2 s, 15 times
 *   10 complete    → the purchase is reported once (GA4, Ads) and the survey opens
 *
 * The session id leaves the address bar once read (it is kept for this tab, so a reload
 * still works): with it, the status route hands the entitlement to any browser for a week.
 */

const SESSION_KEY = "pts-checkout-session";
const POLL_DELAY_MS = 2_000;
const MAX_POLLS = 15;
const MAX_ERRORS = 3;
const REDIRECT_DELAY_MS = 1_200;

type View =
  | { kind: "verifying" }
  | { kind: "received" }
  | { kind: "complete" }
  | { kind: "used"; reportPath: string | null }
  | { kind: "message"; text: string };

function readStoredSession(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function storeSession(sessionId: string) {
  try {
    window.sessionStorage.setItem(SESSION_KEY, sessionId);
  } catch {
    // Private mode: a reload then reads the address bar only.
  }
}

// The session as the page loaded: the address bar's, else the one this tab kept.
let arrival: { sessionId: string | null } | undefined;
const readArrivalSession = (): string | null => {
  if (!arrival) {
    const fromUrl = new URLSearchParams(window.location.search).get("session_id");
    const candidate = fromUrl ?? readStoredSession();
    arrival = {
      sessionId: candidate && CHECKOUT_SESSION_ID_REGEX.test(candidate) ? candidate : null,
    };
  }
  return arrival.sessionId;
};
/** On the server the session is not known yet: the page says it is verifying. */
const noSessionOnServer = (): string | null | undefined => undefined;
const subscribeToNothing = () => () => {};

/** For tests: forget the address this page loaded at. */
export const __resetArrivalSessionForTests = () => {
  arrival = undefined;
};

/**
 * A full page load in this page's place (Back does not return to a status that has been
 * read), so the survey boots fresh with the cookie the status route set.
 */
const replacePage = (path: string) =>
  window.location.replace(new URL(path, window.location.origin).href);

export const PayToStartStatusPage: FC = () => {
  const sessionId = useSyncExternalStore<string | null | undefined>(
    subscribeToNothing,
    readArrivalSession,
    noSessionOnServer
  );
  const [view, setView] = useState<View>({ kind: "verifying" });
  const reportedPurchase = useRef<string | null>(null);
  const { state: checkout, start } = usePtsCheckout();

  // No session at all: nothing to ask, say so once.
  useEffect(() => {
    if (sessionId === null) trackPtsStatusViewed("missing");
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    storeSession(sessionId);
    const url = new URL(window.location.href);
    if (url.searchParams.has("session_id")) {
      url.searchParams.delete("session_id");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    let errors = 0;

    const finish = (next: View, state: Parameters<typeof trackPtsStatusViewed>[0]) => {
      setView(next);
      trackPtsStatusViewed(state);
    };
    const again = () => {
      timer = setTimeout(() => void ask(), POLL_DELAY_MS);
    };

    async function ask() {
      let body: PayToStartStatusResponse | null = null;
      let ok = false;
      try {
        const response = await fetch(
          `/api/stripe/pay-to-start/status?session_id=${encodeURIComponent(sessionId!)}`,
          { cache: "no-store" }
        );
        ok = response.ok;
        body = (await response.json().catch(() => null)) as PayToStartStatusResponse | null;
      } catch {
        ok = false;
      }
      if (cancelled) return;

      if (!ok || !body || !("state" in body)) {
        errors += 1;
        if (errors < MAX_ERRORS) return again();
        return finish({ kind: "message", text: PTS_STATUS.error }, "error");
      }

      switch (body.state) {
        case "paid":
        case "used":
          if (reportedPurchase.current !== body.purchase.transaction_id) {
            reportedPurchase.current = body.purchase.transaction_id;
            trackPtsPurchase(body.purchase);
          }
          if (body.state === "paid") {
            finish({ kind: "complete" }, "paid");
            timer = setTimeout(() => {
              if (!cancelled) replacePage("/survey");
            }, REDIRECT_DELAY_MS);
          } else {
            finish({ kind: "used", reportPath: body.reportPath }, "used");
          }
          return;
        case "processing":
        case "open":
          polls += 1;
          if (body.state === "processing") setView({ kind: "received" });
          if (polls < MAX_POLLS) return again();
          return body.state === "processing"
            ? finish({ kind: "message", text: PTS_STATUS.slow }, "timeout")
            : finish({ kind: "message", text: PTS_STATUS.failed }, "open");
        case "expired":
        case "failed":
          return finish({ kind: "message", text: PTS_STATUS.failed }, body.state);
        case "refunded":
          return finish({ kind: "message", text: PTS_STATUS.refunded }, "refunded");
        case "unavailable":
          return finish({ kind: "message", text: body.message }, "unavailable");
        default:
          return finish({ kind: "message", text: PTS_STATUS.unknown }, "unknown");
      }
    }

    void ask();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sessionId]);

  const shown: View = sessionId === null ? { kind: "message", text: PTS_STATUS.missing } : view;
  const retrying = checkout.status === "starting";

  return (
    <main id="main-content" className="checkout-page checkout-page--return">
      <div className="checkout-page__shell">
        <a href={PAY_TO_START_RETURN_PATH} className="checkout-page__back">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M9.75 3.25 5 8l4.75 4.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {PTS_STATUS.back}
        </a>

        <div className="checkout-return">
          <h1 className="checkout-return__title">{PTS_STATUS.title}</h1>

          <p className="checkout-return__copy" role="status">
            {shown.kind === "verifying" ? (
              PTS_STATUS.verifying
            ) : shown.kind === "received" ? (
              PTS_STATUS.received
            ) : shown.kind === "complete" ? (
              <>
                <strong className="checkout-return__done">{PTS_STATUS.completeLead}</strong>
                {PTS_STATUS.completeRest}
              </>
            ) : shown.kind === "used" ? (
              shown.reportPath ? (
                <>
                  <strong className="checkout-return__done">{PTS_STATUS.completeLead}</strong>
                  {PTS_STATUS.usedRest}
                </>
              ) : (
                PTS_STATUS.usedNoReport
              )
            ) : (
              shown.text
            )}
          </p>

          <div className="checkout-return__actions">
            {shown.kind === "complete" ? (
              <a href="/survey" className="checkout-submit checkout-submit--secondary">
                {PTS_STATUS.goToSurvey}
              </a>
            ) : shown.kind === "used" && shown.reportPath ? (
              <a href={shown.reportPath} className="checkout-submit checkout-submit--secondary">
                {PTS_STATUS.openReport}
              </a>
            ) : (
              <>
                <a
                  href={PAY_TO_START_RETURN_PATH}
                  className="checkout-submit checkout-submit--secondary"
                >
                  {PTS_STATUS.returnToLanding}
                </a>
                <button
                  type="button"
                  className="checkout-return__link"
                  disabled={retrying}
                  aria-busy={retrying || undefined}
                  onClick={() => start("status_retry")}
                >
                  {PTS_STATUS.startAgain}
                </button>
                <PtsCtaStatus location="status_retry" className="text-center" />
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
};
