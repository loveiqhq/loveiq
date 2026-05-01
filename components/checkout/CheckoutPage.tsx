"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type FC } from "react";
import {
  getReportPricingSessionId,
  getReportSessionId,
} from "@/components/survey/hooks/surveySession";
import { getCsrfToken } from "@/lib/csrf-client";
import {
  formatReportPurchasePrice,
  getReportPurchaseBadgeFromPrice,
  getReportPurchasePlan,
  getReportPurchaseStrikePrice,
  getReportReturnHref,
  type ReportPurchasePlanId,
} from "@/lib/checkout/reportPurchase";
import {
  cacheReportCheckoutQuote,
  getCachedReportCheckoutQuote,
} from "@/lib/checkout/reportCheckoutQuoteCache";
import {
  STRIPE_CHECKOUT_DISABLED_MESSAGE,
  type StripeCheckoutSessionResponse,
} from "@/lib/checkout/stripeCheckout";
import type { ReportPriceQuoteSnapshot } from "@/lib/pricing/reportPricing";

const subscribeNoop = () => () => {};

type CheckoutSessionState =
  | {
      status: "idle" | "redirecting";
    }
  | {
      message: string;
      status: "disabled";
    }
  | {
      message: string;
      status: "error";
    }
  | {
      message: string;
      status: "missing-context";
    };

type QuoteState =
  | {
      status: "idle" | "loading";
    }
  | {
      message: string;
      status: "error";
    }
  | {
      quote: ReportPriceQuoteSnapshot;
      status: "ready";
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
      <span className="checkout-payment-panel__secure-copy">
        <span className="checkout-payment-panel__secure-title">Secure Payment</span>
        <span className="checkout-payment-panel__secure-subtitle">
          LoveIQ will hand you off to Stripe to complete payment securely.
        </span>
      </span>
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
  sessionState: Extract<CheckoutSessionState, { status: "disabled" | "missing-context" }>;
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

  return (
    <div className="checkout-payment-stack">
      <div className="checkout-payment-panel">
        <SecureHeader />
        <div className="checkout-payment-panel__state" role="status">
          {sessionState.message}
        </div>
      </div>

      <button type="button" className="checkout-submit" disabled>
        Secure checkout unavailable
      </button>

      <p className="checkout-payment-stack__note" role="status">
        {sessionState.message || STRIPE_CHECKOUT_DISABLED_MESSAGE}
      </p>

      <CheckoutTrustFooter />
    </div>
  );
}

function CheckoutReviewSurface({
  canContinue,
  quote,
  errorMessage,
  isRedirecting,
  onContinue,
}: {
  canContinue: boolean;
  quote: ReportPriceQuoteSnapshot | null;
  errorMessage?: string | null;
  isRedirecting: boolean;
  onContinue: () => void;
}) {
  return (
    <div className="checkout-payment-stack">
      <div className="checkout-payment-panel">
        <SecureHeader />
        <div className="checkout-payment-panel__review">
          <div className="checkout-payment-panel__review-copy">
            <strong>Stripe-hosted checkout</strong>
            <p>
              You&apos;ll continue to Stripe to enter payment details, choose your country, use any
              available wallets, and finish the purchase on their hosted page.
            </p>
          </div>
          <ul className="checkout-payment-panel__review-list">
            <li>
              Your current quoted total is{" "}
              <strong>
                {quote ? formatReportPurchasePrice(quote.currentPriceCents) : "loading..."}
              </strong>
              .
            </li>
            <li>Promo codes are entered directly on Stripe.</li>
            <li>
              Apple Pay, Google Pay, and other methods appear when Stripe marks them eligible.
            </li>
            <li>You&apos;ll return to LoveIQ after payment.</li>
          </ul>
        </div>
        {errorMessage ? (
          <div className="checkout-payment-panel__inline-error" role="alert">
            {errorMessage}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        className="checkout-submit"
        disabled={isRedirecting || !canContinue}
        onClick={onContinue}
      >
        {isRedirecting
          ? "Redirecting to Stripe…"
          : canContinue
            ? "Continue to secure checkout"
            : "Preparing secure checkout…"}
      </button>

      <CheckoutTrustFooter />
    </div>
  );
}

interface Props {
  archetype?: string | null;
  planId: ReportPurchasePlanId;
  token?: string | null;
}

const CheckoutPage: FC<Props> = ({ archetype = null, planId, token = null }) => {
  const plan = getReportPurchasePlan(planId);
  const reportSessionId = useSyncExternalStore(subscribeNoop, getReportSessionId, () => null);
  const pricingSessionId = getReportPricingSessionId({
    sessionId: token ? null : reportSessionId,
    token,
  });
  const cachedQuote = getCachedReportCheckoutQuote({
    plan: planId,
    sessionId: token ? null : reportSessionId,
    token,
  });
  const [sessionState, setSessionState] = useState<CheckoutSessionState>({ status: "idle" });
  const [quoteState, setQuoteState] = useState<QuoteState>({ status: "idle" });
  const backHref = getReportReturnHref(token);
  const hasCheckoutContext = Boolean(token || reportSessionId);
  const hasCachedQuote = Boolean(cachedQuote);
  const activeQuote = quoteState.status === "ready" ? quoteState.quote : cachedQuote;

  useEffect(() => {
    if (!hasCheckoutContext) {
      return;
    }

    let cancelled = false;

    async function fetchQuote() {
      setQuoteState((current) =>
        hasCachedQuote || current.status === "ready" ? current : { status: "loading" }
      );

      try {
        const params = new URLSearchParams({ plan: planId });
        if (token) {
          params.set("token", token);
        } else if (reportSessionId) {
          params.set("reportSessionId", reportSessionId);
        }
        if (pricingSessionId) {
          params.set("pricingSessionId", pricingSessionId);
        }

        const response = await fetch(`/api/price?${params.toString()}`, {
          headers: {
            "x-csrf-token": getCsrfToken(),
          },
        });
        const json = (await response.json().catch(() => null)) as {
          quote?: ReportPriceQuoteSnapshot;
          error?: string;
        } | null;

        if (cancelled) {
          return;
        }

        if (!response.ok || !json?.quote) {
          setQuoteState((current) =>
            hasCachedQuote || current.status === "ready"
              ? current
              : {
                  message: json?.error ?? "We couldn't prepare your quoted price right now.",
                  status: "error",
                }
          );
          return;
        }

        cacheReportCheckoutQuote({
          plan: planId,
          quote: json.quote,
          sessionId: token ? null : reportSessionId,
          token,
        });
        setQuoteState({
          quote: json.quote,
          status: "ready",
        });
      } catch {
        if (!cancelled) {
          setQuoteState((current) =>
            hasCachedQuote || current.status === "ready"
              ? current
              : {
                  message: "We couldn't prepare your quoted price right now.",
                  status: "error",
                }
          );
        }
      }
    }

    void fetchQuote();

    return () => {
      cancelled = true;
    };
  }, [hasCachedQuote, hasCheckoutContext, planId, pricingSessionId, reportSessionId, token]);

  async function handleContinueToStripe() {
    if (!hasCheckoutContext) {
      setSessionState({
        message:
          "This checkout is tied to a saved report. Open your report again and retry from there.",
        status: "missing-context",
      });
      return;
    }

    if (!activeQuote) {
      setSessionState({
        message:
          quoteState.status === "error"
            ? quoteState.message
            : "We're still preparing your quoted price. Try again in a moment.",
        status: "error",
      });
      return;
    }

    setSessionState({ status: "redirecting" });

    try {
      const response = await fetch("/api/stripe/checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify({
          archetype: archetype ?? undefined,
          plan: planId,
          pricingSessionId,
          quoteId: activeQuote.id,
          reportSessionId: token ? null : reportSessionId,
          reportToken: token,
        }),
      });

      const json = (await response.json().catch(() => null)) as
        | StripeCheckoutSessionResponse
        | { error?: string }
        | null;

      if (!response.ok) {
        setSessionState({
          message:
            json && "error" in json && typeof json.error === "string"
              ? json.error
              : "We couldn't prepare secure checkout right now. Please try again.",
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

      if (!json.url) {
        setSessionState({
          message: "Stripe checkout could not be started right now. Please try again.",
          status: "error",
        });
        return;
      }

      window.location.assign(json.url);
    } catch {
      setSessionState({
        message: "We couldn't reach Stripe right now. Please try again.",
        status: "error",
      });
    }
  }

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
            {(() => {
              const strikeCents = activeQuote?.msrpCents ?? null;
              const currentCents = activeQuote?.currentPriceCents ?? plan.priceCents;
              const badge = getReportPurchaseBadgeFromPrice({ strikeCents, currentCents });
              return badge ? <span className="checkout-page__badge">{badge}</span> : null;
            })()}
          </div>

          <div className="checkout-page__summary-price">
            {(() => {
              const strikeCents = activeQuote?.msrpCents ?? null;
              const currentCents = activeQuote?.currentPriceCents ?? plan.priceCents;
              const showStrike = typeof strikeCents === "number" && strikeCents > currentCents;
              return showStrike ? (
                <span className="checkout-page__summary-strike">
                  {getReportPurchaseStrikePrice(strikeCents)}
                </span>
              ) : (
                <span className="checkout-page__summary-strike checkout-page__summary-strike--placeholder">
                  &nbsp;
                </span>
              );
            })()}
            <div className="checkout-page__summary-amount">
              <strong>
                {activeQuote
                  ? formatReportPurchasePrice(activeQuote.currentPriceCents)
                  : "Preparing quote..."}
              </strong>
              <span>{plan.priceSuffix}</span>
            </div>
          </div>
        </section>

        <div className="checkout-page__payment-label">Secure checkout</div>

        {!hasCheckoutContext || sessionState.status === "missing-context" ? (
          <CheckoutFallbackSurface
            backHref={backHref}
            sessionState={{
              message:
                "This checkout is tied to a saved report. Open your report again and retry from there.",
              status: "missing-context",
            }}
          />
        ) : sessionState.status === "disabled" ? (
          <CheckoutFallbackSurface backHref={backHref} sessionState={sessionState} />
        ) : (
          <CheckoutReviewSurface
            canContinue={Boolean(activeQuote)}
            quote={activeQuote}
            errorMessage={
              sessionState.status === "error"
                ? sessionState.message
                : !activeQuote && quoteState.status === "error"
                  ? quoteState.message
                  : null
            }
            isRedirecting={sessionState.status === "redirecting"}
            onContinue={handleContinueToStripe}
          />
        )}
      </div>
    </main>
  );
};

export default CheckoutPage;
