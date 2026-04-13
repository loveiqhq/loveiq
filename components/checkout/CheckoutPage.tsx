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
import StripeCheckoutMount from "./StripeCheckoutMount";

const subscribeNoop = () => () => {};

type PaymentMethodId = "card" | "bank_account" | "google_pay" | "apple_pay" | "more";

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

const paymentMethodOptions: Array<{
  icon: "card" | "bank" | "google" | "apple" | "more";
  id: PaymentMethodId;
  label: string;
  previewCopy: string;
}> = [
  {
    icon: "card",
    id: "card",
    label: "Card",
    previewCopy: "Previewing the card form shell that will later be replaced by Stripe Checkout.",
  },
  {
    icon: "bank",
    id: "bank_account",
    label: "Bank Account",
    previewCopy: "Bank account payments will be rendered by Stripe once checkout is enabled.",
  },
  {
    icon: "google",
    id: "google_pay",
    label: "Google Pay",
    previewCopy:
      "Google Pay will appear through Stripe on supported browsers and devices after checkout is enabled.",
  },
  {
    icon: "apple",
    id: "apple_pay",
    label: "Apple Pay",
    previewCopy:
      "Apple Pay will appear through Stripe on supported Apple devices once checkout is enabled.",
  },
  {
    icon: "more",
    id: "more",
    label: "More",
    previewCopy:
      "Additional payment methods will be supplied by Stripe automatically based on customer eligibility.",
  },
];

function PaymentMethodIcon({ icon }: { icon: (typeof paymentMethodOptions)[number]["icon"] }) {
  if (icon === "more") {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <circle cx="5" cy="10" r="1.4" />
        <circle cx="10" cy="10" r="1.4" />
        <circle cx="15" cy="10" r="1.4" />
      </svg>
    );
  }

  if (icon === "google") {
    return (
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <path d="M10.5 4.6a5.4 5.4 0 1 0 5 7.4H10V8.8h8.4c.13.53.2 1.07.2 1.66A8.6 8.6 0 1 1 10.5 1.8c2.12 0 3.9.78 5.16 2.06L13.6 5.9A4.45 4.45 0 0 0 10.5 4.6Z" />
      </svg>
    );
  }

  if (icon === "apple") {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M12.06 3.08c.75-.9 1.3-2.08 1.16-3.08-1.08.04-2.35.72-3.1 1.62-.69.82-1.3 2.03-1.13 3 1.21.09 2.3-.62 3.07-1.54ZM15.8 10.4c.03-2.36 1.93-3.49 2.02-3.55-1.1-1.6-2.8-1.82-3.4-1.85-1.45-.16-2.83.85-3.57.85-.75 0-1.9-.83-3.13-.81-1.6.03-3.08.93-3.9 2.36-1.67 2.88-.43 7.15 1.2 9.5.8 1.16 1.76 2.46 3.02 2.41 1.2-.05 1.66-.76 3.12-.76 1.45 0 1.87.76 3.14.73 1.3-.02 2.12-1.17 2.91-2.34.92-1.33 1.28-2.62 1.3-2.69-.03 0-2.47-.95-2.5-3.85Z" />
      </svg>
    );
  }

  if (icon === "bank") {
    return (
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden="true"
      >
        <path d="M3.5 8.5h13m-10.5 3h1m2 0h4.5" strokeLinecap="round" />
        <rect x="3.1" y="4.6" width="13.8" height="10.8" rx="2.1" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M3.5 8.5h13m-10.5 3h1m2 0h4.5" strokeLinecap="round" />
      <rect x="3.1" y="4.6" width="13.8" height="10.8" rx="2.1" />
    </svg>
  );
}

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

function CheckoutPlaceholderSurface({
  backHref,
  selectedMethod,
  sessionState,
}: {
  backHref: string;
  selectedMethod: (typeof paymentMethodOptions)[number];
  sessionState: CheckoutSessionState;
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

  if (sessionState.status === "error") {
    return (
      <div className="checkout-payment-stack">
        <div className="checkout-payment-panel checkout-payment-panel--error">
          <SecureHeader />
          <div className="checkout-payment-panel__state" role="alert">
            {sessionState.message}
          </div>
        </div>

        <button type="button" className="checkout-submit" disabled>
          Checkout unavailable
        </button>

        <CheckoutTrustFooter />
      </div>
    );
  }

  return (
    <div className="checkout-payment-stack">
      <div className="checkout-payment-panel">
        <SecureHeader />

        {sessionState.status === "loading" ? (
          <div className="checkout-placeholder">
            <div className="checkout-placeholder__group">
              <span className="checkout-placeholder__label">Preparing checkout</span>
              <div className="checkout-placeholder__skeleton" />
            </div>
            <div className="checkout-placeholder__row">
              <div className="checkout-placeholder__group">
                <span className="checkout-placeholder__label">Secure payment methods</span>
                <div className="checkout-placeholder__skeleton" />
              </div>
              <div className="checkout-placeholder__group">
                <span className="checkout-placeholder__label">Pricing details</span>
                <div className="checkout-placeholder__skeleton" />
              </div>
            </div>
            <div className="checkout-placeholder__group">
              <span className="checkout-placeholder__label">Payment preview</span>
              <div className="checkout-placeholder__skeleton checkout-placeholder__skeleton--large" />
            </div>
          </div>
        ) : selectedMethod.id === "card" ? (
          <div className="checkout-placeholder">
            <div className="checkout-placeholder__group">
              <span className="checkout-placeholder__label">Card Number</span>
              <div className="checkout-placeholder__field">1234 5678 9012 3456</div>
            </div>

            <div className="checkout-placeholder__row">
              <div className="checkout-placeholder__group">
                <span className="checkout-placeholder__label">Expiry</span>
                <div className="checkout-placeholder__field">MM / YY</div>
              </div>
              <div className="checkout-placeholder__group">
                <span className="checkout-placeholder__label">CVC</span>
                <div className="checkout-placeholder__field">123</div>
              </div>
            </div>

            <div className="checkout-placeholder__group">
              <span className="checkout-placeholder__label">Promo Code</span>
              <div className="checkout-placeholder__field">LOVEIQSMART10</div>
            </div>
          </div>
        ) : (
          <div className="checkout-payment-panel__state">
            <strong>{selectedMethod.label}</strong>
            <span>{selectedMethod.previewCopy}</span>
          </div>
        )}
      </div>

      <button type="button" className="checkout-submit" disabled>
        <span className="checkout-submit__icon" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M5.2 7V5.8a2.8 2.8 0 1 1 5.6 0V7" strokeLinecap="round" />
            <rect x="3.6" y="7" width="8.8" height="5.8" rx="1.4" />
          </svg>
        </span>
        {sessionState.status === "loading" ? "Loading checkout preview" : "Complete Payment"}
      </button>

      {sessionState.status !== "loading" ? (
        <p className="checkout-payment-stack__note" role="status">
          {sessionState.status === "disabled"
            ? sessionState.message
            : STRIPE_CHECKOUT_DISABLED_MESSAGE}
        </p>
      ) : null}

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
  const [selectedMethodId, setSelectedMethodId] = useState<PaymentMethodId>("card");
  const [sessionState, setSessionState] = useState<CheckoutSessionState>({ status: "loading" });
  const selectedMethod =
    paymentMethodOptions.find((method) => method.id === selectedMethodId) ??
    paymentMethodOptions[0];
  const backHref = getReportReturnHref(token);

  useEffect(() => {
    let cancelled = false;

    async function prepareCheckout() {
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
                : "We couldn’t prepare checkout right now. Please try again later.",
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
            message: "We couldn’t reach checkout right now. Please try again later.",
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
              <strong>{plan.price}</strong>
              <span>{plan.priceSuffix}</span>
            </div>
          </div>
        </section>

        <div className="checkout-page__payment-label">
          {sessionState.status === "ready" ? "Stripe Checkout Preview" : "Payment Method"}
        </div>

        {sessionState.status === "ready" ? null : (
          <div className="checkout-page__methods" role="tablist" aria-label="Payment methods">
            {paymentMethodOptions.map((method) => (
              <button
                key={method.id}
                type="button"
                role="tab"
                aria-selected={selectedMethodId === method.id}
                className={[
                  "checkout-page__method",
                  selectedMethodId === method.id ? "checkout-page__method--active" : "",
                  method.id === "more" ? "checkout-page__method--compact" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setSelectedMethodId(method.id)}
              >
                <span className="checkout-page__method-icon">
                  <PaymentMethodIcon icon={method.icon} />
                </span>
                <span>{method.label}</span>
              </button>
            ))}
          </div>
        )}

        {sessionState.status === "ready" ? (
          <StripeCheckoutMount clientSecret={sessionState.clientSecret} />
        ) : (
          <CheckoutPlaceholderSurface
            backHref={backHref}
            selectedMethod={selectedMethod}
            sessionState={sessionState}
          />
        )}
      </div>
    </main>
  );
};

export default CheckoutPage;
