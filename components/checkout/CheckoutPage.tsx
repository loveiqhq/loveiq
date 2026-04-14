"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type FC } from "react";
import { getReportSessionId } from "@/components/survey/hooks/surveySession";
import { getCsrfToken } from "@/lib/csrf-client";
import {
  getReportPurchasePlan,
  getReportReturnHref,
  type ReportPurchasePlanId,
} from "@/lib/checkout/reportPurchase";
import {
  STRIPE_CHECKOUT_DISABLED_MESSAGE,
  type StripeCheckoutSessionResponse,
} from "@/lib/checkout/stripeCheckout";
import StripeCheckoutMount, { type StripeCheckoutSummary } from "./StripeCheckoutMount";

const subscribeNoop = () => () => {};

type CheckoutSessionState =
  | {
      message?: string;
      status: "loading";
    }
  | {
      clientSecret: string;
      status: "ready";
    }
  | {
      message: string;
      status: "disabled" | "error" | "missing-context";
    };

function SecureHeader() {
  return (
    <div className="checkout-payment-panel__secure">
      <span className="checkout-payment-panel__secure-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M6.75 8.25V6.5a3.25 3.25 0 1 1 6.5 0v1.75" strokeLinecap="round" />
          <rect x="4.75" y="8.25" width="10.5" height="7" rx="2" />
        </svg>
      </span>
      <span>Secure Payment</span>
    </div>
  );
}

function CheckoutTrustFooter() {
  return (
    <>
      <div className="checkout-trust">
        <span className="checkout-trust__item">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M4.8 7.6V6.4a3.2 3.2 0 0 1 6.4 0v1.2" strokeLinecap="round" />
            <rect x="3.4" y="7.6" width="9.2" height="5.4" rx="1.5" />
          </svg>
          Secure SSL
        </span>
        <span className="checkout-trust__dot" aria-hidden="true">
          •
        </span>
        <span className="checkout-trust__item">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path
              d="M8 13.5s4.25-2.55 4.25-6.15V3.5L8 2 3.75 3.5v3.85C3.75 10.95 8 13.5 8 13.5Z"
              strokeLinejoin="round"
            />
          </svg>
          14-day money-back
        </span>
      </div>

      <div className="checkout-powered">
        Powered by <span className="checkout-powered__mark">stripe</span>
      </div>
    </>
  );
}

function CheckoutFallbackSurface({
  backHref,
  sessionState,
}: {
  backHref: string;
  sessionState: Extract<CheckoutSessionState, { status: "disabled" | "error" | "missing-context" }>;
}) {
  if (sessionState.status === "missing-context") {
    return (
      <div className="checkout-payment-stack">
        <div className="checkout-payment-panel checkout-payment-panel--error">
          <SecureHeader />
          <div className="checkout-payment-panel__state" role="alert">
            {sessionState.message}
          </div>
        </div>

        <Link href={backHref} className="checkout-submit checkout-submit--secondary">
          Return to your report
        </Link>

        <CheckoutTrustFooter />
      </div>
    );
  }

  const isErrorState = sessionState.status === "error";

  return (
    <div className="checkout-payment-stack">
      <div
        className={["checkout-payment-panel", isErrorState ? "checkout-payment-panel--error" : ""]
          .filter(Boolean)
          .join(" ")}
      >
        <SecureHeader />
        <div className="checkout-payment-panel__state" role={isErrorState ? "alert" : "status"}>
          {sessionState.message}
        </div>
      </div>

      <button type="button" className="checkout-submit" disabled>
        {isErrorState ? "Checkout unavailable" : "Secure checkout unavailable"}
      </button>

      {!isErrorState ? (
        <p className="checkout-payment-stack__note" role="status">
          {sessionState.message || STRIPE_CHECKOUT_DISABLED_MESSAGE}
        </p>
      ) : null}

      <CheckoutTrustFooter />
    </div>
  );
}

function CheckoutLoadingSurface() {
  return (
    <div className="checkout-payment-stack">
      <div className="checkout-payment-panel">
        <SecureHeader />
        <div className="checkout-placeholder">
          <div className="checkout-placeholder__group">
            <span className="checkout-placeholder__label">Preparing secure checkout</span>
            <div className="checkout-placeholder__skeleton" />
          </div>
          <div className="checkout-placeholder__group">
            <span className="checkout-placeholder__label">Loading Stripe payment form</span>
            <div className="checkout-placeholder__skeleton checkout-placeholder__skeleton--large" />
          </div>
        </div>
      </div>

      <button type="button" className="checkout-submit" disabled>
        Preparing Stripe checkout
      </button>

      <CheckoutTrustFooter />
    </div>
  );
}

interface Props {
  planId: ReportPurchasePlanId;
  token?: string | null;
}

const CheckoutPage: FC<Props> = ({ planId, token = null }) => {
  const plan = getReportPurchasePlan(planId);
  const reportSessionId = useSyncExternalStore(subscribeNoop, getReportSessionId, () => null);
  const [checkoutSummary, setCheckoutSummary] = useState<StripeCheckoutSummary | null>(null);
  const [sessionState, setSessionState] = useState<CheckoutSessionState>({ status: "loading" });
  const backHref = getReportReturnHref(token);

  useEffect(() => {
    let cancelled = false;

    async function prepareCheckout() {
      setCheckoutSummary(null);

      if (!token && !reportSessionId) {
        setSessionState({
          message:
            "This checkout preview is tied to a saved report. Open your report again and retry.",
          status: "missing-context",
        });
        return;
      }

      setSessionState({ status: "loading" });

      try {
        const response = await fetch("/api/stripe/checkout-session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": getCsrfToken(),
          },
          body: JSON.stringify({
            plan: planId,
            reportSessionId: token ? null : reportSessionId,
            reportToken: token,
          }),
        });

        const json = (await response.json().catch(() => null)) as
          | StripeCheckoutSessionResponse
          | { error?: string }
          | null;

        if (cancelled) return;

        if (!response.ok) {
          setSessionState({
            message:
              json && "error" in json && typeof json.error === "string"
                ? json.error
                : "We couldn't prepare checkout right now. Please try again later.",
            status: "error",
          });
          return;
        }

        if (!json || !("enabled" in json) || !json.enabled) {
          setSessionState({
            message:
              json && "message" in json && typeof json.message === "string"
                ? json.message
                : STRIPE_CHECKOUT_DISABLED_MESSAGE,
            status: "disabled",
          });
          return;
        }

        setSessionState({
          clientSecret: json.clientSecret,
          status: "ready",
        });
      } catch {
        if (!cancelled) {
          setSessionState({
            message: "We couldn't reach checkout right now. Please try again later.",
            status: "error",
          });
        }
      }
    }

    void prepareCheckout();

    return () => {
      cancelled = true;
    };
  }, [planId, reportSessionId, token]);

  const hasAppliedDiscount = (checkoutSummary?.discountMinorUnitsAmount ?? 0) > 0;
  const displayedPrice = checkoutSummary?.totalAmount ?? plan.price;

  return (
    <main className="checkout-page">
      <div className="checkout-page__shell">
        <Link href={backHref} className="checkout-page__back">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M9.75 3.25 5 8l4.75 4.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to pricing
        </Link>

        <header className="checkout-page__header">
          <h1 className="checkout-page__title">Complete your order</h1>
          <p className="checkout-page__subtitle">
            Your journey to deeper self-understanding is just moments away
          </p>
        </header>

        <section className="checkout-page__summary" aria-label="Order summary">
          <div className="checkout-page__summary-head">
            <div>
              <h2 className="checkout-page__summary-title">{plan.title}</h2>
              <p className="checkout-page__summary-copy">{plan.description}</p>
            </div>
            {plan.badge ? (
              <span
                className={[
                  "checkout-page__badge",
                  plan.badgeTone ? `checkout-page__badge--${plan.badgeTone}` : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {plan.badge}
              </span>
            ) : null}
          </div>

          <div className="checkout-page__summary-price">
            {plan.strikePrice ? (
              <span className="checkout-page__summary-strike">{plan.strikePrice}</span>
            ) : (
              <span className="checkout-page__summary-strike checkout-page__summary-strike--placeholder">
                &nbsp;
              </span>
            )}
            <div className="checkout-page__summary-amount">
              <strong>{displayedPrice}</strong>
              <span>{hasAppliedDiscount ? "after promo code" : plan.priceSuffix}</span>
            </div>
          </div>

          {hasAppliedDiscount ? (
            <div className="checkout-page__summary-adjustment" role="status">
              <span>
                {checkoutSummary?.promotionCode
                  ? `Promo code ${checkoutSummary.promotionCode}`
                  : (checkoutSummary?.discountLabel ?? "Discount applied")}
              </span>
              <strong>-{checkoutSummary?.discountAmount}</strong>
            </div>
          ) : null}
        </section>

        <div className="checkout-page__payment-label">Secure checkout</div>

        {sessionState.status === "ready" ? (
          <StripeCheckoutMount
            clientSecret={sessionState.clientSecret}
            onSessionChange={setCheckoutSummary}
          />
        ) : sessionState.status === "loading" ? (
          <CheckoutLoadingSurface />
        ) : (
          <CheckoutFallbackSurface backHref={backHref} sessionState={sessionState} />
        )}
      </div>
    </main>
  );
};

export default CheckoutPage;
