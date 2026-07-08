"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type FC } from "react";
import {
  getReportNurturePromo,
  getReportPricingSessionId,
  getReportSessionId,
} from "@features/survey/ui/hooks/surveySession";
import { getCsrfToken } from "@shared/http/csrf-client";
import {
  formatReportPurchasePrice,
  getReportPurchaseBadgeFromPrice,
  getReportPurchasePlan,
  getReportPurchaseStrikePrice,
  getReportReturnHref,
  type ReportPurchasePlanId,
} from "@features/checkout/server/reportPurchase";
import {
  cacheReportCheckoutQuote,
  getCachedReportCheckoutQuote,
} from "@features/checkout/server/reportCheckoutQuoteCache";
import {
  STRIPE_CHECKOUT_DISABLED_MESSAGE,
  type StripeCheckoutSessionResponse,
} from "@features/checkout/server/stripeCheckout";
import type { ReportPriceQuoteSnapshot } from "@features/pricing/logic/reportPricing";

const subscribeNoop = () => () => {};

// Per-tab sessionStorage key holding the identity (`${plan}:${token|session}`)
// of the checkout we last handed off to Stripe. If this page loads and the
// stored value matches the current checkout, the user came back from Stripe
// (e.g. browser "back") — the one-tap auto-forward is suppressed so they aren't
// bounced straight back; they see the manual button and can leave or retry on
// purpose. Scoping by identity keeps one-tap working for a different plan/report
// bought later in the same tab.
const CHECKOUT_SENT_KEY = "liq_checkout_sent";

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
  // Marker identity for THIS checkout, so backing out of one plan doesn't
  // suppress the one-tap forward for a different plan in the same tab.
  const checkoutKey = `${planId}:${token ?? reportSessionId ?? "anon"}`;
  // Read the "already handed off to Stripe" marker exactly ONCE per page
  // instance and keep it in a ref (never cleared inside the auto-forward effect)
  // so a later re-render — e.g. when the /api/price refetch resolves — can't
  // resurrect the forward and re-trap a user who came back from Stripe. A match
  // means "don't auto-forward, show the manual button". The marker is
  // write-only (never deleted here): a match suppresses auto-forward on EVERY
  // return/reload of this checkout — not just the first — so a browser back OR
  // an F5 keeps the user on the review page instead of re-shoving them to
  // Stripe. A deliberate click re-sends. A different checkout has a different
  // key and still auto-forwards; the marker is overwritten on the next hand-off.
  //
  // CRITICAL: gate on a RESOLVED checkout context. On a hard load / hydration
  // (the exact back-from-Stripe path on Chrome Android), `reportSessionId` from
  // useSyncExternalStore is null on the first render (server snapshot), so
  // checkoutKey would be "<plan>:anon" and never match the marker written under
  // the real session id — silently defeating the guard. Waiting until token or
  // reportSessionId is present means we read the marker under the correct key.
  const returnedFromStripeRef = useRef<boolean | null>(null);
  if (returnedFromStripeRef.current === null && (token || reportSessionId)) {
    try {
      returnedFromStripeRef.current = sessionStorage.getItem(CHECKOUT_SENT_KEY) === checkoutKey;
    } catch {
      returnedFromStripeRef.current = false;
    }
  }
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

    // Pull any stashed nurture promo (set by /report/[token]?promo=...).
    // Forward it raw; the server validates ownership and expiry. Falsy / shape
    // miss is fine — the server treats unparseable values as absent.
    const stashedPromo = getReportNurturePromo({
      sessionId: token ? null : reportSessionId,
      token,
    });

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
          promo: stashedPromo ?? undefined,
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

      try {
        sessionStorage.setItem(CHECKOUT_SENT_KEY, checkoutKey);
      } catch {
        /* storage unavailable — the back-forward guard just won't engage */
      }
      window.location.assign(json.url);
    } catch {
      setSessionState({
        message: "We couldn't reach Stripe right now. Please try again.",
        status: "error",
      });
    }
  }

  // One-tap checkout (all devices). This page's only job is to repeat the price
  // and offer a "Continue to secure checkout" button — Stripe collects the
  // payment (and always shows the final amount before charging), so the extra
  // tap here is a redundant confirm. Once the quote is ready we auto-advance to
  // Stripe. The quote is pre-cached by the paywall modal, so for the modal path
  // this fires almost immediately; sticky-bar / other entries fetch the quote
  // first, then forward.
  //
  // Scope note: this only trims a redundant tap INSIDE the already-healthy
  // checkout-start→paid step (~72.5% of checkout-starters pay). It is NOT the fix
  // for the Android paid-CVR ~0.24% leak — that leak is upstream at paywall→click
  // (the ScrollPricingModal; see the strategy audit's Bet #1). Measure this via
  // checkout-start→paid, not paywall→paid.
  //
  // One-shot; never fires when the user came back from Stripe
  // (returnedFromStripeRef); on POST error sessionState flips to "error" and the
  // manual button is the fallback. Gates on the primitive `hasActiveQuote` (not
  // the quote object, whose identity changes every render) to avoid effect churn.
  // NOTE: never reset autoContinuedRef to false — the effect below depends on
  // sessionState.status, so re-arming it could resurrect the auto-forward
  // (double-POST / redirect loop). A soft-error retry goes through the manual
  // button, not by clearing this ref.
  const autoContinuedRef = useRef(false);
  const hasActiveQuote = Boolean(activeQuote);
  useEffect(() => {
    if (autoContinuedRef.current) return;
    if (returnedFromStripeRef.current) return; // came back from Stripe — show the manual button
    if (!hasCheckoutContext || !hasActiveQuote) return;
    if (sessionState.status !== "idle") return;
    autoContinuedRef.current = true;
    void handleContinueToStripe();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot, ref-guarded; handleContinueToStripe intentionally omitted
  }, [hasCheckoutContext, hasActiveQuote, sessionState.status]);

  // bfcache safety. A browser "Back" from Stripe can restore this page WITHOUT
  // remounting (Safari/Firefox, and Chrome on cross-origin back), so the effects
  // above never re-run. The page would be frozen mid-"redirecting", showing a
  // stuck, disabled "Redirecting to Stripe…" button. On a persisted restore,
  // block any further auto-forward and reset to idle so the manual button works.
  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (!event.persisted) return;
      // Block auto-forward on the restored instance and un-stick the frozen
      // "Redirecting…" state. Leave the write-only marker in place so a later
      // reload still shows the manual button rather than re-forwarding.
      returnedFromStripeRef.current = true;
      setSessionState({ status: "idle" });
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

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
