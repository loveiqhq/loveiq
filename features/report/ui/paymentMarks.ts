/**
 * 842:591's row: Apple Pay, Visa, Google Pay, Klarna, American Express, Mastercard.
 * The marks are the frame's own artwork (public/report/paygate/mark-*.svg), except
 * Apple Pay's: 842:591 sets "Pay" after U+F8FF, a glyph only Apple's fonts have, so
 * that one is cut from the repo's Apple Pay mark (public/payment-logos). PayPal is not
 * in the row: Checkout cannot take PayPal (#451 on main).
 *
 * Shared with the EUR 1.99 pre-unlock gate (features/report/ui/gate, 1604:2426): the same row.
 */
export const PAYMENT_MARKS = [
  { logo: "apple-pay", label: "Apple Pay" },
  { logo: "visa", label: "Visa" },
  { logo: "google-pay", label: "Google Pay" },
  { logo: "klarna", label: "Klarna" },
  { logo: "amex", label: "American Express" },
  { logo: "mastercard", label: "Mastercard" },
] as const;
