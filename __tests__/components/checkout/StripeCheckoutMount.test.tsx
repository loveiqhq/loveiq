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
      checkout: {
        confirm: vi.fn().mockResolvedValue({ type: "success" }),
      },
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
      checkout: {
        confirm,
      },
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
      checkout: {
        confirm,
      },
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
});
