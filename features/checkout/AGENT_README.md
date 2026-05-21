# features/checkout

**Purpose:** Stripe-backed report-purchase checkout. Three plans: `essentials`, `full_report`, `all_reports`. Sandbox + live modes both fulfill via webhook.

**Entry:**

- `ui/CheckoutPage.tsx` — `/checkout` route landing.
- `ui/CheckoutReturnPage.tsx` — `/checkout/return` post-payment landing.
- `server/stripeCheckout.ts` — Stripe SDK client + checkout-session builder.
- `server/reportPurchase.ts` — plan IDs, access token regex, purchase helpers.
- `server/reportCheckoutQuoteCache.ts` — short-lived quote cache (KV-backed).
- `server/fulfillment.ts` — webhook event processor; grants access on payment events.
- API routes (still in `app/api/`): `stripe/checkout-session`, `stripe/checkout-session-status`, `stripe/webhook`, `price`.

**Belongs:** anything specific to the checkout flow — UI, Stripe wiring, fulfillment, tests.

**Does NOT belong:**

- Pricing math (separate domain at `lib/pricing/` → `features/pricing/` in later phase).
- Report rendering (`features/report/` in later phase).
- Email templates (the `report-discount` email lives in `lib/emails/` for now; will move with report phase).

**Related:**

- `lib/pricing/reportPricing.ts` — price quote source, consumed by checkout.
- `app/api/stripe/webhook/route.ts` — dispatches to `server/fulfillment.ts`.
- Stripe dashboard webhook endpoint: `https://<domain>/api/stripe/webhook` — see `CLAUDE.md` for the event list.
