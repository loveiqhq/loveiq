// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

let mockCheckoutState: unknown;
let capturedExpressCheckoutProps: {
  onConfirm?: (event: { paymentFailed: (payload?: unknown) => void }) => Promise<void> | void;
  options?: {
    paymentMethodOrder?: string[];
  };
} | null = null;
let capturedPaymentElementProps: {
  options?: {
    paymentMethodOrder?: string[];
  };
} | null = null;

function createCheckoutMock(overrides: Record<string, unknown> = {}) {
  return {
    applyPromotionCode: vi.fn().mockResolvedValue({
      session: {
        discountAmounts: [
          {
            displayName: "Spring promo",
            promotionCode: "LOVEIQ10",
          },
        ],
        total: {
          discount: {
            amount: "€3.00",
            minorUnitsAmount: 300,
          },
          subtotal: {
            amount: "€29.99",
            minorUnitsAmount: 2999,
          },
          total: {
            amount: "€26.99",
            minorUnitsAmount: 2699,
          },
        },
      },
      type: "success",
    }),
    confirm: vi.fn().mockResolvedValue({ type: "success" }),
    discountAmounts: null,
    removePromotionCode: vi.fn().mockResolvedValue({
      session: {
        discountAmounts: null,
        total: {
          discount: {
            amount: "€0.00",
            minorUnitsAmount: 0,
          },
          subtotal: {
            amount: "€29.99",
            minorUnitsAmount: 2999,
          },
          total: {
            amount: "€29.99",
            minorUnitsAmount: 2999,
          },
        },
      },
      type: "success",
    }),
    total: {
      discount: {
        amount: "€0.00",
        minorUnitsAmount: 0,
      },
      subtotal: {
        amount: "€29.99",
        minorUnitsAmount: 2999,
      },
      total: {
        amount: "€29.99",
        minorUnitsAmount: 2999,
      },
    },
    ...overrides,
  };
}

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn(() => Promise.resolve({})),
}));

vi.mock("@stripe/react-stripe-js/checkout", () => ({
  CheckoutElementsProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="checkout-elements-provider">{children}</div>
  ),
  ExpressCheckoutElement: (props: Record<string, unknown>) => {
    capturedExpressCheckoutProps = props;
    return <div data-testid="express-checkout-element" />;
  },
  PaymentElement: (props: Record<string, unknown>) => {
    capturedPaymentElementProps = props;
    return <div data-testid="payment-element" />;
  },
  useCheckout: () => mockCheckoutState,
}));

describe("StripeCheckoutMount", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "pk_test_preview_123");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_CHECKOUT_PREVIEW_MODE", "true");
    capturedExpressCheckoutProps = null;
    capturedPaymentElementProps = null;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    mockCheckoutState = null;
  });

  it("renders the express wallet element above the payment element", async () => {
    mockCheckoutState = {
      type: "success",
      checkout: createCheckoutMock(),
    };

    const { default: StripeCheckoutMount } =
      await import("@/components/checkout/StripeCheckoutMount");

    render(<StripeCheckoutMount clientSecret="cs_test_preview_123" />);

    expect(screen.getByTestId("express-checkout-element")).toBeInTheDocument();
    expect(screen.getByTestId("payment-element")).toBeInTheDocument();
    expect(capturedExpressCheckoutProps?.options).toMatchObject({
      paymentMethodOrder: ["apple_pay", "google_pay", "link"],
    });
    expect(capturedPaymentElementProps?.options).toMatchObject({
      paymentMethodOrder: ["card", "us_bank_account", "amazon_pay", "link"],
    });
  });

  it("passes Stripe express confirm events into checkout.confirm", async () => {
    const confirm = vi.fn().mockResolvedValue({ type: "success" });

    mockCheckoutState = {
      type: "success",
      checkout: createCheckoutMock({
        confirm,
      }),
    };

    const { default: StripeCheckoutMount } =
      await import("@/components/checkout/StripeCheckoutMount");

    render(<StripeCheckoutMount clientSecret="cs_test_preview_123" />);

    const paymentFailed = vi.fn();

    await act(async () => {
      await capturedExpressCheckoutProps?.onConfirm?.({
        paymentFailed,
      });
    });

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        expressCheckoutConfirmEvent: expect.objectContaining({
          paymentFailed,
        }),
        redirect: "always",
      })
    );
    expect(paymentFailed).not.toHaveBeenCalled();
  });

  it("keeps the manual submit path working for the payment element", async () => {
    const confirm = vi.fn().mockResolvedValue({ type: "success" });

    mockCheckoutState = {
      type: "success",
      checkout: createCheckoutMock({
        confirm,
      }),
    };

    const { default: StripeCheckoutMount } =
      await import("@/components/checkout/StripeCheckoutMount");

    render(<StripeCheckoutMount clientSecret="cs_test_preview_123" />);

    fireEvent.click(screen.getByRole("button", { name: /complete payment/i }));

    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          redirect: "always",
        })
      )
    );
    expect(confirm).not.toHaveBeenCalledWith(
      expect.objectContaining({
        expressCheckoutConfirmEvent: expect.anything(),
      })
    );
  });

  it("applies a promotion code through the Stripe checkout session", async () => {
    const applyPromotionCode = vi.fn().mockResolvedValue({
      session: {
        discountAmounts: [
          {
            displayName: "Spring promo",
            promotionCode: "LOVEIQ10",
          },
        ],
        total: {
          discount: {
            amount: "€3.00",
            minorUnitsAmount: 300,
          },
          subtotal: {
            amount: "€29.99",
            minorUnitsAmount: 2999,
          },
          total: {
            amount: "€26.99",
            minorUnitsAmount: 2699,
          },
        },
      },
      type: "success",
    });

    mockCheckoutState = {
      type: "success",
      checkout: createCheckoutMock({
        applyPromotionCode,
      }),
    };

    const { default: StripeCheckoutMount } =
      await import("@/components/checkout/StripeCheckoutMount");

    render(<StripeCheckoutMount clientSecret="cs_test_preview_123" />);

    fireEvent.change(screen.getByPlaceholderText(/enter promo code/i), {
      target: { value: "loveiq10" },
    });
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));

    await waitFor(() => expect(applyPromotionCode).toHaveBeenCalledWith("loveiq10"));
    expect(await screen.findByText(/promo code LOVEIQ10 applied\./i)).toBeInTheDocument();
  });
});
