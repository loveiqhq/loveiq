"use client";

import { useEffect, useMemo, useState, type FormEvent, type FC, type KeyboardEvent } from "react";
import {
  loadStripe,
  type StripeCheckoutDiscountAmount,
  type StripeCheckoutSession,
  type StripeExpressCheckoutElementConfirmEvent,
  type StripeExpressCheckoutElementReadyEvent,
} from "@stripe/stripe-js";
import {
  CheckoutElementsProvider,
  ExpressCheckoutElement,
  PaymentElement,
  useCheckout,
} from "@stripe/react-stripe-js/checkout";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;
const isPreviewMode = process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_PREVIEW_MODE === "true";
const previewModeMessage =
  "You're checking out in Stripe test mode. Use card 4242 4242 4242 4242 with any future date and any CVC. No real charge will be made.";
const compactCheckoutMediaQuery = "(max-width: 640px)";

export interface StripeCheckoutSummary {
  discountAmount: string;
  discountLabel: string | null;
  discountMinorUnitsAmount: number;
  promotionCode: string | null;
  subtotalAmount: string;
  totalAmount: string;
}

const checkoutElementFonts = [
  {
    cssSrc:
      "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap",
  },
];

const checkoutAppearance = {
  theme: "night" as const,
  labels: "above" as const,
  inputs: "spaced" as const,
  variables: {
    colorPrimary: "#fe6839",
    colorBackground: "#120c19",
    colorText: "#f7f3fb",
    colorTextSecondary: "rgba(247,243,251,0.7)",
    colorTextPlaceholder: "rgba(247,243,251,0.38)",
    colorDanger: "#fb7185",
    colorSuccess: "#34d399",
    accessibleColorOnColorPrimary: "#f7f3fb",
    buttonColorText: "#f7f3fb",
    colorPrimaryText: "#f7f3fb",
    iconColor: "rgba(247,243,251,0.7)",
    iconHoverColor: "#f7f3fb",
    iconChevronDownColor: "rgba(247,243,251,0.66)",
    tabIconColor: "rgba(247,243,251,0.64)",
    tabIconHoverColor: "#fff",
    tabIconSelectedColor: "#fff",
    tabIconMoreColor: "rgba(247,243,251,0.64)",
    tabIconMoreHoverColor: "#fff",
    logoColor: "light",
    tabLogoColor: "light",
    tabLogoSelectedColor: "light",
    borderRadius: "16px",
    buttonBorderRadius: "999px",
    focusBoxShadow: "0 0 0 2px rgba(254, 104, 57, 0.24)",
    fontFamily: '"Manrope", "Helvetica Neue", Arial, sans-serif',
    fontSmooth: "always",
    fontLineHeight: "1.45",
    fontSizeBase: "15px",
    fontSizeSm: "13px",
    fontSizeXs: "12px",
    fontWeightNormal: "400",
    fontWeightMedium: "500",
    fontWeightBold: "600",
    spacingUnit: "4px",
    gridRowSpacing: "18px",
    gridColumnSpacing: "14px",
    tabSpacing: "10px",
    accordionItemSpacing: "12px",
  },
  rules: {
    ".Input": {
      backgroundColor: "rgba(255,255,255,0.045)",
      border: "1px solid rgba(255,255,255,0.12)",
      boxShadow: "none",
      color: "#f7f3fb",
      fontFamily: '"Manrope", "Helvetica Neue", Arial, sans-serif',
      fontSize: "15px",
      fontWeight: "500",
    },
    ".Input:focus": {
      border: "1px solid rgba(254, 104, 57, 0.88)",
      boxShadow: "0 0 0 2px rgba(254, 104, 57, 0.2)",
    },
    ".Input--invalid": {
      border: "1px solid rgba(251, 113, 133, 0.72)",
      boxShadow: "0 0 0 2px rgba(251, 113, 133, 0.14)",
    },
    ".Label": {
      color: "rgba(247,243,251,0.8)",
      fontFamily: '"Manrope", "Helvetica Neue", Arial, sans-serif',
      fontSize: "13px",
      fontWeight: "500",
      letterSpacing: "0.005em",
    },
    ".Text": {
      color: "rgba(247,243,251,0.68)",
      fontFamily: '"Manrope", "Helvetica Neue", Arial, sans-serif',
      fontSize: "13px",
    },
    ".Tab": {
      backgroundColor: "rgba(255,255,255,0.035)",
      border: "1px solid rgba(255,255,255,0.11)",
      boxShadow: "none",
      color: "#f7f3fb",
      borderRadius: "14px",
      fontFamily: '"Manrope", "Helvetica Neue", Arial, sans-serif',
      fontSize: "14px",
      fontWeight: "500",
    },
    ".Tab:hover": {
      border: "1px solid rgba(254, 104, 57, 0.42)",
      boxShadow: "0 0 0 1px rgba(254, 104, 57, 0.16)",
      color: "#ffffff",
    },
    ".Tab--selected": {
      backgroundColor: "rgba(254,104,57,0.18)",
      border: "1px solid rgba(254, 104, 57, 0.92)",
      boxShadow: "0 0 0 1px rgba(254, 104, 57, 0.24), 0 10px 18px rgba(254, 104, 57, 0.14)",
      color: "#f7f3fb",
    },
    ".Tab--selected:hover": {
      backgroundColor: "rgba(254,104,57,0.18)",
      border: "1px solid rgba(254, 104, 57, 0.92)",
      boxShadow: "0 0 0 1px rgba(254, 104, 57, 0.24), 0 10px 18px rgba(254, 104, 57, 0.14)",
      color: "#f7f3fb",
    },
    ".PickerItem": {
      backgroundColor: "rgba(255,255,255,0.035)",
      border: "1px solid rgba(255,255,255,0.11)",
    },
    ".PickerItem:hover": {
      border: "1px solid rgba(254, 104, 57, 0.38)",
    },
    ".Block": {
      backgroundColor: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.08)",
      boxShadow: "none",
    },
    ".CodeInput": {
      backgroundColor: "rgba(255,255,255,0.045)",
      border: "1px solid rgba(255,255,255,0.12)",
      boxShadow: "none",
    },
    ".Error": {
      color: "#fecdd3",
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
      <span className="checkout-payment-panel__secure-copy">
        <span className="checkout-payment-panel__secure-title">Secure Payment</span>
        <span className="checkout-payment-panel__secure-subtitle">
          Hosted by Stripe with encrypted checkout fields.
        </span>
      </span>
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

function hasAvailableExpressMethod(event: StripeExpressCheckoutElementReadyEvent) {
  return Boolean(
    event.availablePaymentMethods && Object.values(event.availablePaymentMethods).some(Boolean)
  );
}

function useCompactCheckoutLayout() {
  const [isCompactLayout, setIsCompactLayout] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQueryList = window.matchMedia(compactCheckoutMediaQuery);
    const updateLayout = (event?: MediaQueryListEvent) => {
      setIsCompactLayout(event ? event.matches : mediaQueryList.matches);
    };

    updateLayout();

    if (typeof mediaQueryList.addEventListener === "function") {
      mediaQueryList.addEventListener("change", updateLayout);
      return () => {
        mediaQueryList.removeEventListener("change", updateLayout);
      };
    }

    mediaQueryList.addListener(updateLayout);
    return () => {
      mediaQueryList.removeListener(updateLayout);
    };
  }, []);

  return isCompactLayout;
}

function getAppliedPromotion(checkout: StripeCheckoutSession): StripeCheckoutDiscountAmount | null {
  return (
    checkout.discountAmounts?.find((entry) => typeof entry.promotionCode === "string") ??
    checkout.discountAmounts?.[0] ??
    null
  );
}

function buildCheckoutSummary(checkout: StripeCheckoutSession): StripeCheckoutSummary {
  const appliedPromotion = getAppliedPromotion(checkout);

  return {
    discountAmount: checkout.total.discount.amount,
    discountLabel: appliedPromotion?.displayName ?? null,
    discountMinorUnitsAmount: checkout.total.discount.minorUnitsAmount,
    promotionCode: appliedPromotion?.promotionCode ?? null,
    subtotalAmount: checkout.total.subtotal.amount,
    totalAmount: checkout.total.total.amount,
  };
}

function StripeCheckoutForm({
  onSessionChange,
}: {
  onSessionChange?: (summary: StripeCheckoutSummary) => void;
}) {
  const checkoutState = useCheckout();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isApplyingPromotionCode, setIsApplyingPromotionCode] = useState(false);
  const [expressCheckoutAvailability, setExpressCheckoutAvailability] = useState<
    "available" | "pending" | "unavailable"
  >("pending");
  const [promotionCodeDraft, setPromotionCodeDraft] = useState("");
  const [promotionCodeMessage, setPromotionCodeMessage] = useState<{
    tone: "error" | "success";
    value: string;
  } | null>(null);
  const isCompactLayout = useCompactCheckoutLayout();
  const checkout = checkoutState.type === "success" ? checkoutState.checkout : null;
  const appliedPromotion = useMemo(
    () => (checkout ? getAppliedPromotion(checkout) : null),
    [checkout]
  );

  useEffect(() => {
    if (!checkout) {
      return;
    }

    onSessionChange?.(buildCheckoutSummary(checkout));
  }, [checkout, onSessionChange]);

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

  if (!checkout) {
    return null;
  }

  const activeCheckout = checkout;

  async function confirmCheckout(
    options?: { expressCheckoutConfirmEvent?: StripeExpressCheckoutElementConfirmEvent },
    formEvent?: FormEvent<HTMLFormElement>
  ) {
    formEvent?.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const result = await activeCheckout.confirm({
      redirect: "always",
      ...options,
    });

    if (result.type === "error") {
      const message = result.error.message ?? "Unable to confirm payment right now.";
      setErrorMessage(message);
      options?.expressCheckoutConfirmEvent?.paymentFailed({
        message,
        reason: "fail",
      });
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
  }

  async function applyPromotionCode() {
    const code = promotionCodeDraft.trim();

    if (!code) {
      setPromotionCodeMessage({
        tone: "error",
        value: "Enter a promo code before applying it.",
      });
      return;
    }

    setPromotionCodeMessage(null);
    setIsApplyingPromotionCode(true);

    const result = await activeCheckout.applyPromotionCode(code);

    if (result.type === "error") {
      setPromotionCodeMessage({
        tone: "error",
        value: result.error.message ?? "That promo code could not be applied.",
      });
      setIsApplyingPromotionCode(false);
      return;
    }

    const appliedCode = getAppliedPromotion(result.session)?.promotionCode ?? code.toUpperCase();

    setPromotionCodeMessage({
      tone: "success",
      value: `Promo code ${appliedCode} applied.`,
    });
    setPromotionCodeDraft(appliedCode);
    setIsApplyingPromotionCode(false);
  }

  async function removePromotionCode() {
    setPromotionCodeMessage(null);
    setIsApplyingPromotionCode(true);

    const result = await activeCheckout.removePromotionCode();

    if (result.type === "error") {
      setPromotionCodeMessage({
        tone: "error",
        value: result.error.message ?? "That promo code could not be removed.",
      });
      setIsApplyingPromotionCode(false);
      return;
    }

    setPromotionCodeDraft("");
    setPromotionCodeMessage({
      tone: "success",
      value: "Promo code removed.",
    });
    setIsApplyingPromotionCode(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    await confirmCheckout(undefined, event);
  }

  async function handleExpressConfirm(event: StripeExpressCheckoutElementConfirmEvent) {
    await confirmCheckout({ expressCheckoutConfirmEvent: event });
  }

  function handlePromotionCodeKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    void applyPromotionCode();
  }

  return (
    <form className="checkout-payment-stack" onSubmit={handleSubmit}>
      <div className="checkout-payment-panel">
        <SecureHeader />
        <div
          className={[
            "checkout-payment-panel__express-shell",
            expressCheckoutAvailability === "unavailable"
              ? "checkout-payment-panel__express-shell--hidden"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="checkout-payment-panel__express-copy">
            <span className="checkout-payment-panel__express-label">Fast checkout</span>
            <span className="checkout-payment-panel__express-meta">
              Apple Pay, Google Pay, and Link appear here when Stripe says they are eligible.
            </span>
          </div>
          <ExpressCheckoutElement
            onConfirm={handleExpressConfirm}
            onLoadError={() => {
              setExpressCheckoutAvailability("unavailable");
            }}
            onReady={(event) => {
              setExpressCheckoutAvailability(
                hasAvailableExpressMethod(event) ? "available" : "unavailable"
              );
            }}
            options={{
              buttonHeight: isCompactLayout ? 44 : 48,
              buttonTheme: {
                applePay: "white",
                googlePay: "white",
              },
              buttonType: {
                applePay: "buy",
                googlePay: "buy",
              },
              layout: {
                maxColumns: isCompactLayout ? 1 : 2,
                maxRows: isCompactLayout ? 3 : 2,
                overflow: "auto",
              },
              paymentMethodOrder: ["apple_pay", "google_pay", "link"],
              paymentMethods: {
                amazonPay: "never",
                applePay: "always",
                googlePay: "always",
                klarna: "never",
                link: "auto",
                paypal: "never",
              },
            }}
          />
        </div>
        {expressCheckoutAvailability !== "unavailable" ? (
          <div className="checkout-payment-panel__divider" aria-hidden="true">
            <span>Or pay manually</span>
          </div>
        ) : null}
        <div className="checkout-payment-panel__element-shell">
          <PaymentElement
            options={{
              layout: {
                type: isCompactLayout ? "accordion" : "tabs",
                defaultCollapsed: isCompactLayout,
                paymentMethodLogoPosition: isCompactLayout ? "end" : undefined,
                spacedAccordionItems: isCompactLayout,
                visibleAccordionItemsCount: isCompactLayout ? 3 : undefined,
              },
              paymentMethodOrder: ["card", "us_bank_account", "amazon_pay", "link"],
              wallets: {
                applePay: "never",
                googlePay: "never",
                link: "never",
              },
            }}
          />
        </div>
        <div className="checkout-payment-panel__promo-shell">
          <div className="checkout-payment-panel__promo-copy">
            <span className="checkout-payment-panel__promo-label">Promo code</span>
            <span className="checkout-payment-panel__promo-meta">
              Enter a valid Stripe promotion code to apply any extra discount before payment.
            </span>
          </div>
          <div className="checkout-payment-panel__promo-actions">
            <label className="checkout-payment-panel__promo-field">
              <span className="sr-only">Promo code</span>
              <input
                autoCapitalize="characters"
                autoCorrect="off"
                className="checkout-payment-panel__promo-input"
                inputMode="text"
                name="promotion_code"
                onChange={(event) => {
                  setPromotionCodeDraft(event.target.value);
                }}
                onKeyDown={handlePromotionCodeKeyDown}
                placeholder="Enter promo code"
                spellCheck={false}
                type="text"
                value={promotionCodeDraft}
              />
            </label>
            <button
              type="button"
              className="checkout-payment-panel__promo-button"
              disabled={isApplyingPromotionCode}
              onClick={() => {
                void applyPromotionCode();
              }}
            >
              {isApplyingPromotionCode ? "Applying..." : "Apply"}
            </button>
          </div>
          {appliedPromotion?.promotionCode ? (
            <div className="checkout-payment-panel__promo-applied">
              <span>
                Applied <strong>{appliedPromotion.promotionCode}</strong>
                {appliedPromotion.displayName ? ` - ${appliedPromotion.displayName}` : ""}
              </span>
              <button
                type="button"
                className="checkout-payment-panel__promo-remove"
                disabled={isApplyingPromotionCode}
                onClick={() => {
                  void removePromotionCode();
                }}
              >
                Remove
              </button>
            </div>
          ) : null}
          {promotionCodeMessage ? (
            <div
              className={[
                "checkout-payment-panel__promo-message",
                `checkout-payment-panel__promo-message--${promotionCodeMessage.tone}`,
              ].join(" ")}
              role={promotionCodeMessage.tone === "error" ? "alert" : "status"}
            >
              {promotionCodeMessage.value}
            </div>
          ) : null}
        </div>
        {errorMessage ? (
          <div className="checkout-payment-panel__inline-error" role="alert">
            {errorMessage}
          </div>
        ) : null}
      </div>

      <button type="submit" className="checkout-submit" disabled={isSubmitting}>
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
          <span className="checkout-payment-stack__note-badge">Test mode</span>
          <span>{previewModeMessage}</span>
        </p>
      ) : null}

      <TrustFooter />
    </form>
  );
}

interface Props {
  clientSecret: string;
  onSessionChange?: (summary: StripeCheckoutSummary) => void;
}

const StripeCheckoutMount: FC<Props> = ({ clientSecret, onSessionChange }) => {
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
          fonts: checkoutElementFonts,
          loader: "auto",
        },
      }}
    >
      <StripeCheckoutForm onSessionChange={onSessionChange} />
    </CheckoutElementsProvider>
  );
};

export default StripeCheckoutMount;
