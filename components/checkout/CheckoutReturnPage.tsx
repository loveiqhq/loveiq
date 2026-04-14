"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FC } from "react";
import { useRouter } from "next/navigation";
import {
  buildReportCheckoutHref,
  getReportPurchasePlan,
  getReportReturnHref,
  type ReportPurchasePlanId,
} from "@/lib/checkout/reportPurchase";
import type {
  StripeCheckoutPurchaseAnalytics,
  StripeCheckoutSessionStatusResponse,
} from "@/lib/checkout/stripeCheckout";
import type { ReportAccessPlan } from "@/lib/report/access";
import { trackReportPurchase } from "@/lib/analytics";

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
    };

interface Props {
  planId: ReportPurchasePlanId;
  sessionId?: string | null;
  token?: string | null;
}

function isSuccessfulPaymentStatus(value: string | null) {
  return value === "paid" || value === "no_payment_required";
}

const CheckoutReturnPage: FC<Props> = ({ planId, sessionId = null, token = null }) => {
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
  const backHref = getReportReturnHref(token);

  useEffect(() => {
    if (!sessionId) return;
    const resolvedSessionId = sessionId;
    const MAX_UNLOCK_CHECK_ATTEMPTS = 8;
    const UNLOCK_CHECK_DELAY_MS = 1_500;

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
    trackReportPurchase(state.purchaseAnalytics);
  }, [isPaidAndComplete, state]);

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
                Your purchase is confirmed. Use the button below if the report does not open
                automatically.
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
                href={buildReportCheckoutHref({ plan: planId, token })}
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
