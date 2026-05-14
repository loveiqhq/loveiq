"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FC } from "react";
import { useRouter } from "next/navigation";
import {
  buildReportCheckoutHref,
  getReportPurchasePlan,
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
  trackPaywallUnlocked,
  trackReportPurchase,
} from "@features/analytics/client";
import { toArchetypeSlug } from "@features/report/server/archetypeSlug";

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
  archetype?: string | null;
  planId: ReportPurchasePlanId;
  sessionId?: string | null;
  token?: string | null;
}

function isSuccessfulPaymentStatus(value: string | null) {
  return value === "paid" || value === "no_payment_required";
}

const CheckoutReturnPage: FC<Props> = ({
  archetype = null,
  planId,
  sessionId = null,
  token = null,
}) => {
  const router = useRouter();
  const plan = getReportPurchasePlan(planId);
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
  const reportHrefWithArchetype = archetypeSlug
    ? `${baseReportHref}?archetype=${encodeURIComponent(archetypeSlug)}`
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
          | StripeCheckoutSessionStatusResponse
          | { error?: string }
          | null;

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
    trackReportPurchase({ ...state.purchaseAnalytics, item_name: plan.title });

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
  }, [isPaidAndComplete, state, plan.title, planId]);

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
          <p className="checkout-return__eyebrow">{plan.title}</p>
          <h1 className="checkout-return__title">Checkout status</h1>

          {state.status === "loading" ? (
            <p className="checkout-return__copy">{state.message}</p>
          ) : isRedirecting ? (
            <p className="checkout-return__copy">
              Payment complete. Your report is unlocked. Redirecting you now…
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
            <Link href={backHref} className="checkout-submit checkout-submit--secondary">
              {canReturnToUnlockedReport ? "Go to unlocked report" : "Return to report"}
            </Link>
            {!isPaidAndComplete ? (
              <Link
                href={buildReportCheckoutHref({ archetype: archetypeSlug, plan: planId, token })}
                className="checkout-return__link"
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
