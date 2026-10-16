"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FC } from "react";
import { useRouter } from "next/navigation";
import {
  getReportPurchasePlanTitle,
  getReportReturnHref,
  type ReportPurchasePlanId,
} from "@features/checkout/server/reportPurchase";
import type {
  StripeCheckoutPurchaseAnalytics,
  StripeCheckoutSessionStatusResponse,
} from "@features/checkout/server/stripeCheckout";
import type { ReportAccessPlan } from "@features/report/server/access";
import {
  setReportSubmissionContext,
  trackCheckoutAbandonedReturn,
  trackCheckoutRetryClicked,
  trackCheckoutReturnViewed,
  trackPaywallUnlocked,
  trackReportPurchase,
} from "@features/analytics/client";
import { toArchetypeSlug } from "@features/report/server/archetypeSlug";
import { clearReportNurturePromos } from "@features/survey/ui/hooks/surveySession";

type ReturnState =
  | {
      message: string;
      status: "loading";
    }
  | {
      message: string;
      status: "disabled" | "error" | "missing";
    }
  | {
      accessPlan: ReportAccessPlan;
      paymentStatus: string | null;
      purchaseAnalytics: StripeCheckoutPurchaseAnalytics | null;
      sessionStatus: string | null;
      status: "ready";
      surveySubmissionId: number | null;
    };

interface Props {
  /** Where on the report the checkout started; handed back so it opens there. */
  anchor?: string | null;
  archetype?: string | null;
  planId: ReportPurchasePlanId;
  sessionId?: string | null;
  token?: string | null;
}

function isSuccessfulPaymentStatus(value: string | null) {
  return value === "paid" || value === "no_payment_required";
}

const CheckoutReturnPage: FC<Props> = ({
  anchor = null,
  archetype = null,
  planId,
  sessionId = null,
  token = null,
}) => {
  const router = useRouter();
  const planTitle = getReportPurchasePlanTitle(planId);
  // Say WHAT is now open. A report bought from another archetype's row returns to that
  // report, and "Your report is unlocked" left the buyer unsure which one they had paid for.
  const unlockedWhat =
    planId === "all_reports"
      ? "All 14 archetype reports are"
      : planId === "full_report" && archetype
        ? `Your ${archetype} report is`
        : "Your report is";
  const trackedTransactionIdRef = useRef<string | null>(null);
  const [state, setState] = useState<ReturnState>(
    sessionId
      ? {
          message: "Verifying your checkout session…",
          status: "loading",
        }
      : {
          message: "Missing checkout session ID. Return to your report and try again.",
          status: "missing",
        }
  );
  const archetypeSlug = archetype ? toArchetypeSlug(archetype) : null;
  const baseReportHref = getReportReturnHref(token);
  const reportQuery = new URLSearchParams();
  if (archetypeSlug) reportQuery.set("archetype", archetypeSlug);
  // The report reads `anchor` once, scrolls the reader back to it and drops it.
  if (anchor) reportQuery.set("anchor", anchor);
  // `.toString()`, not `.size`: Safari before 17 has no `size`, and an undefined
  // there would drop the archetype from every return.
  const reportQueryString = reportQuery.toString();
  const reportHrefWithArchetype = reportQueryString
    ? `${baseReportHref}?${reportQueryString}`
    : baseReportHref;
  const backHref = reportHrefWithArchetype;

  useEffect(() => {
    if (!sessionId) return;
    const resolvedSessionId = sessionId;
    // Webhook fulfillment can take a few seconds under load (multiple Supabase
    // writes) and Stripe may even retry once. Polling for ~30s gives the
    // happy path room without making the user stare at "loading" forever.
    const MAX_UNLOCK_CHECK_ATTEMPTS = 15;
    const UNLOCK_CHECK_DELAY_MS = 2_000;

    let cancelled = false;
    let attempts = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function fetchStatus() {
      try {
        const response = await fetch(
          `/api/stripe/checkout-session-status?session_id=${encodeURIComponent(resolvedSessionId)}`
        );
        const json = (await response.json().catch(() => null)) as
          StripeCheckoutSessionStatusResponse | { error?: string } | null;

        if (cancelled) return;

        if (!response.ok) {
          setState({
            message:
              json && "error" in json && typeof json.error === "string"
                ? json.error
                : "We couldn't verify the checkout result.",
            status: "error",
          });
          return;
        }

        if (!json || !("enabled" in json) || !json.enabled) {
          setState({
            message:
              json && "message" in json && typeof json.message === "string"
                ? json.message
                : "Checkout verification is not enabled yet in this environment.",
            status: "disabled",
          });
          return;
        }

        const paymentStatus = json.paymentStatus;
        const sessionStatus = json.sessionStatus;
        const accessPlan = json.accessPlan ?? null;
        const isPaidAndComplete =
          isSuccessfulPaymentStatus(paymentStatus) && sessionStatus === "complete";

        if (isPaidAndComplete && accessPlan === null && attempts < MAX_UNLOCK_CHECK_ATTEMPTS) {
          attempts += 1;
          setState({
            message: "Payment received. Unlocking your report…",
            status: "loading",
          });
          timeoutId = setTimeout(() => {
            void fetchStatus();
          }, UNLOCK_CHECK_DELAY_MS);
          return;
        }

        setState({
          accessPlan,
          paymentStatus,
          purchaseAnalytics: json.purchaseAnalytics ?? null,
          sessionStatus,
          status: "ready",
          surveySubmissionId: json.surveySubmissionId ?? null,
        });
      } catch {
        if (!cancelled) {
          setState({
            message: "We couldn't verify the checkout result.",
            status: "error",
          });
        }
      }
    }

    void fetchStatus();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [sessionId]);

  const isPaidAndComplete =
    state.status === "ready" &&
    isSuccessfulPaymentStatus(state.paymentStatus) &&
    state.sessionStatus === "complete";
  const canReturnToUnlockedReport =
    state.status === "ready" && isPaidAndComplete && state.accessPlan !== null;
  const isRedirecting = canReturnToUnlockedReport;

  // The email's promo code is spent once Stripe completes the checkout that used it. Left
  // in this tab it rode along on the reader's next checkout, which Stripe then refused.
  useEffect(() => {
    if (isPaidAndComplete) clearReportNurturePromos();
  }, [isPaidAndComplete]);

  // Fire `checkout_return_viewed` exactly once per (sessionId, terminal state)
  // pair so a 30s polling loop doesn't double-count. Bind the submission
  // context first so persistence doesn't silently drop on null context.
  const returnViewedFiredRef = useRef(false);
  useEffect(() => {
    if (returnViewedFiredRef.current) return;
    if (state.status === "loading") return;
    let status: "success" | "failed" | "pending" = "failed";
    if (state.status === "ready") {
      if (state.surveySubmissionId) {
        setReportSubmissionContext(state.surveySubmissionId);
      }
      status = isPaidAndComplete ? "success" : "pending";
    }
    returnViewedFiredRef.current = true;
    trackCheckoutReturnViewed({ status, plan: planId });
  }, [isPaidAndComplete, planId, state]);

  useEffect(() => {
    if (
      state.status !== "ready" ||
      !isPaidAndComplete ||
      state.accessPlan === null ||
      state.purchaseAnalytics === null
    ) {
      return;
    }

    if (trackedTransactionIdRef.current === state.purchaseAnalytics.transaction_id) {
      return;
    }

    trackedTransactionIdRef.current = state.purchaseAnalytics.transaction_id;
    trackReportPurchase({ ...state.purchaseAnalytics, item_name: planTitle });

    // Persist a durable "paywall_unlocked" event to analytics_event so the
    // admin submission funnel can show the conversion as a timestamp +
    // surface it in the chronological timeline. The persistence layer keys
    // off __loveiqReportSubmissionId, which the report page sets but
    // /checkout/return is a separate route, so re-bind it here.
    if (state.surveySubmissionId) {
      setReportSubmissionContext(state.surveySubmissionId);
      trackPaywallUnlocked(
        planId,
        state.purchaseAnalytics.value,
        state.purchaseAnalytics.currency,
        state.purchaseAnalytics.transaction_id
      );
    }
  }, [isPaidAndComplete, state, planTitle, planId, token]);

  useEffect(() => {
    if (!canReturnToUnlockedReport) {
      return;
    }

    const redirectId = setTimeout(() => {
      router.replace(backHref);
    }, 1_200);

    return () => {
      clearTimeout(redirectId);
    };
  }, [backHref, canReturnToUnlockedReport, router]);

  return (
    <main className="checkout-page checkout-page--return">
      <div className="checkout-page__shell">
        <Link href={backHref} className="checkout-page__back">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M9.75 3.25 5 8l4.75 4.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to report
        </Link>

        <div className="checkout-return">
          {/* What was bought, for screen readers only: the journey's frames (1382:1210–1212)
              take it off the card (Marcus, Figma comment: "took out some text on the top").
              It stays in the page, which is also where the nightly persona walks read the
              plan they paid for (scripts/walkers/walk.ts). */}
          <p className="sr-only">{planTitle}</p>
          <h1 className="checkout-return__title">Checkout status</h1>

          {state.status === "loading" ? (
            <p className="checkout-return__copy">{state.message}</p>
          ) : isRedirecting ? (
            <p className="checkout-return__copy">
              <strong className="checkout-return__done">Payment complete.</strong> {unlockedWhat}{" "}
              unlocked. Redirecting you now…
            </p>
          ) : state.status === "ready" && isPaidAndComplete ? (
            <>
              <p className="checkout-return__copy">
                Session status: <strong>{state.sessionStatus ?? "unknown"}</strong>
              </p>
              <p className="checkout-return__copy">
                Payment status: <strong>{state.paymentStatus ?? "unknown"}</strong>
              </p>
              <p className="checkout-return__copy">
                Your purchase is confirmed. Unlock can take up to a minute. If the report does not
                open automatically, use the button below or email{" "}
                <a className="checkout-return__link" href="mailto:hello@loveiq.org">
                  hello@loveiq.org
                </a>{" "}
                with your receipt.
              </p>
            </>
          ) : state.status === "ready" ? (
            <>
              <p className="checkout-return__copy">
                Session status: <strong>{state.sessionStatus ?? "unknown"}</strong>
              </p>
              <p className="checkout-return__copy">
                Payment status: <strong>{state.paymentStatus ?? "unknown"}</strong>
              </p>
            </>
          ) : (
            <p className="checkout-return__copy">{state.message}</p>
          )}

          <div className="checkout-return__actions">
            <Link
              href={backHref}
              className="checkout-submit checkout-submit--secondary"
              onClick={() => {
                // Only count as abandonment if the user did NOT complete
                // payment. Successful unlocks shouldn't pollute the
                // abandonment metric.
                if (!isPaidAndComplete) {
                  trackCheckoutAbandonedReturn({
                    failure_reason:
                      state.status === "ready"
                        ? `payment_${state.paymentStatus ?? "unknown"}`
                        : state.status,
                  });
                }
              }}
            >
              {canReturnToUnlockedReport ? "Go to unlocked report" : "Return to report"}
            </Link>
            {!isPaidAndComplete ? (
              <Link
                // Back to the report, where every unlock CTA now goes straight to
                // Stripe. There is no /checkout page to send them to any more.
                href={reportHrefWithArchetype}
                className="checkout-return__link"
                onClick={() =>
                  trackCheckoutRetryClicked({
                    failure_reason:
                      state.status === "ready"
                        ? `payment_${state.paymentStatus ?? "unknown"}`
                        : state.status,
                  })
                }
              >
                Start checkout again
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
};

export default CheckoutReturnPage;
