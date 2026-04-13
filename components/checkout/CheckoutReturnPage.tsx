"use client";

import Link from "next/link";
import { useEffect, useState, type FC } from "react";
import {
  buildReportCheckoutHref,
  getReportPurchasePlan,
  getReportReturnHref,
  type ReportPurchasePlanId,
} from "@/lib/checkout/reportPurchase";
import type { StripeCheckoutSessionStatusResponse } from "@/lib/checkout/stripeCheckout";

type ReturnState =
  | {
      status: "loading";
    }
  | {
      message: string;
      status: "disabled" | "error" | "missing";
    }
  | {
      paymentStatus: string | null;
      sessionStatus: string | null;
      status: "ready";
    };

interface Props {
  planId: ReportPurchasePlanId;
  sessionId?: string | null;
  token?: string | null;
}

const CheckoutReturnPage: FC<Props> = ({ planId, sessionId = null, token = null }) => {
  const plan = getReportPurchasePlan(planId);
  const [state, setState] = useState<ReturnState>(
    sessionId
      ? { status: "loading" }
      : {
          message: "Missing checkout session ID. Return to your report and try again.",
          status: "missing",
        }
  );
  const backHref = getReportReturnHref(token);

  useEffect(() => {
    if (!sessionId) return;
    const resolvedSessionId = sessionId;

    let cancelled = false;

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

        setState({
          paymentStatus: json.paymentStatus,
          sessionStatus: json.sessionStatus,
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
    };
  }, [sessionId]);

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
            <p className="checkout-return__copy">Verifying your checkout session…</p>
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
              Return to report
            </Link>
            <Link
              href={buildReportCheckoutHref({ plan: planId, token })}
              className="checkout-return__link"
            >
              Start checkout again
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
};

export default CheckoutReturnPage;
