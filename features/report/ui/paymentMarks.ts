/**
 * 842:591's row: Apple Pay, Visa, Google Pay, Klarna, American Express, Mastercard, each a
 * method the report's Checkout offers. PayPal is not in the row: Checkout cannot take PayPal
 * (#451 on main).
 *
 * Drawn by PaymentLogos as the official logos (public/payment-logos/official, from Figma's
 * "Payment Icons" 11482:1487; Marcus, sync 29.10), in place of the frame's own artwork: the
 * same row on the EUR 1.99 page, the plan picker and both exit pages.
 */
export const PAYMENT_MARKS = [
  { logo: "apple-pay", label: "Apple Pay" },
  { logo: "visa", label: "Visa" },
  { logo: "google-pay", label: "Google Pay" },
  { logo: "klarna", label: "Klarna" },
  { logo: "amex", label: "American Express" },
  { logo: "mastercard", label: "Mastercard" },
] as const;
