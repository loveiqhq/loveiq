"use client";

import { useState, type FormEvent, type FC } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  CheckoutElementsProvider,
  PaymentElement,
  useCheckout,
} from "@stripe/react-stripe-js/checkout";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;
const isPreviewMode = process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_PREVIEW_MODE === "true";
const previewModeMessage =
  "Preview mode is active. Stripe's real test checkout is mounted, but payment confirmation is disabled here.";

const checkoutAppearance = {
  theme: "night" as const,
  variables: {
    colorPrimary: "#fe6839",
    colorBackground: "#140d1b",
    colorText: "#f4effb",
    colorDanger: "#fb7185",
    borderRadius: "14px",
    fontFamily: "var(--font-manrope), Manrope, sans-serif",
  },
  rules: {
    ".Input": {
      backgroundColor: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.1)",
      boxShadow: "none",
      color: "#f4effb",
    },
    ".Input:focus": {
      border: "1px solid rgba(168, 85, 247, 0.9)",
      boxShadow: "0 0 0 1px rgba(168, 85, 247, 0.38)",
    },
    ".Label": {
      color: "rgba(255,255,255,0.76)",
      fontWeight: "500",
    },
    ".Tab": {
      backgroundColor: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.1)",
      color: "#f4effb",
    },
    ".Tab:hover": {
      border: "1px solid rgba(168, 85, 247, 0.75)",
    },
    ".Tab--selected": {
      backgroundColor: "rgba(168,85,247,0.12)",
      border: "1px solid rgba(168, 85, 247, 0.95)",
      boxShadow: "0 0 20px rgba(168, 85, 247, 0.18)",
    },
    ".PickerItem": {
      backgroundColor: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.1)",
    },
  },
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

function TrustFooter() {
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

function StripeCheckoutForm() {
  const checkoutState = useCheckout();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (checkoutState.type === "loading") {
    return (
      <div className="checkout-payment-stack">
        <div className="checkout-payment-panel">
          <SecureHeader />
          <div className="checkout-payment-panel__state">Loading secure checkout…</div>
        </div>
        <button type="button" className="checkout-submit" disabled>
          Loading checkout
        </button>
        <TrustFooter />
      </div>
    );
  }

  if (checkoutState.type === "error") {
    return (
      <div className="checkout-payment-stack">
        <div className="checkout-payment-panel checkout-payment-panel--error">
          <SecureHeader />
          <div className="checkout-payment-panel__state" role="alert">
            {checkoutState.error.message}
          </div>
        </div>
        <button type="button" className="checkout-submit" disabled>
          Checkout unavailable
        </button>
        <TrustFooter />
      </div>
    );
  }

  const { checkout } = checkoutState;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (isPreviewMode) {
      return;
    }

    setIsSubmitting(true);

    const result = await checkout.confirm({ redirect: "always" });

    if (result.type === "error") {
      setErrorMessage(result.error.message ?? "Unable to confirm payment right now.");
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
  }

  return (
    <form className="checkout-payment-stack" onSubmit={handleSubmit}>
      <div className="checkout-payment-panel">
        <SecureHeader />
        <div className="checkout-payment-panel__element-shell">
          <PaymentElement
            options={{
              layout: {
                type: "tabs",
                defaultCollapsed: false,
              },
              wallets: {
                applePay: "auto",
                googlePay: "auto",
                link: "auto",
              },
            }}
          />
        </div>
        {errorMessage ? (
          <div className="checkout-payment-panel__inline-error" role="alert">
            {errorMessage}
          </div>
        ) : null}
      </div>

      <button
        type="submit"
        className="checkout-submit"
        disabled={isPreviewMode || !checkout.canConfirm || isSubmitting}
      >
        <span className="checkout-submit__icon" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M5.2 7V5.8a2.8 2.8 0 1 1 5.6 0V7" strokeLinecap="round" />
            <rect x="3.6" y="7" width="8.8" height="5.8" rx="1.4" />
          </svg>
        </span>
        {isSubmitting ? "Processing payment…" : "Complete Payment"}
      </button>

      {isPreviewMode ? (
        <p className="checkout-payment-stack__note" role="status">
          {previewModeMessage}
        </p>
      ) : null}

      <TrustFooter />
    </form>
  );
}

interface Props {
  clientSecret: string;
}

const StripeCheckoutMount: FC<Props> = ({ clientSecret }) => {
  if (!stripePromise) {
    return (
      <div className="checkout-payment-stack">
        <div className="checkout-payment-panel checkout-payment-panel--error">
          <SecureHeader />
          <div className="checkout-payment-panel__state" role="alert">
            Stripe publishable key missing. Add the public key before enabling live checkout.
          </div>
        </div>
        <button type="button" className="checkout-submit" disabled>
          Checkout unavailable
        </button>
        <TrustFooter />
      </div>
    );
  }

  return (
    <CheckoutElementsProvider
      stripe={stripePromise}
      options={{
        clientSecret,
        elementsOptions: {
          appearance: checkoutAppearance,
        },
      }}
    >
      <StripeCheckoutForm />
    </CheckoutElementsProvider>
  );
};

export default StripeCheckoutMount;
