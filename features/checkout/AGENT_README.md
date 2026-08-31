# features/checkout

**Purpose:** Stripe-backed report-purchase checkout. Three plans: `essentials`, `full_report`, `all_reports`. Sandbox + live modes both fulfill via webhook.

**Entry:**

- `ui/startReportCheckout.ts` — creates the Stripe session and redirects. The single door to a charge; called straight from the report's unlock CTAs. (The `/checkout` review page it replaced was removed 2026-08-31; the route survives only as a redirect for `cancel_url`s baked into in-flight Stripe sessions.)
- `ui/CheckoutReturnPage.tsx` — `/checkout/return` post-payment landing.
- `server/stripeCheckout.ts` — Stripe SDK client + checkout-session builder.
- `server/reportPurchase.ts` — plan IDs, access token regex, purchase helpers.
- `server/fulfillment.ts` — webhook event processor; grants access on payment events.
- API routes (still in `app/api/`): `stripe/checkout-session`, `stripe/checkout-session-status`, `stripe/webhook`, `price`.

**Belongs:** anything specific to the checkout flow — UI, Stripe wiring, fulfillment, tests.

**Does NOT belong:**

- Pricing math (separate domain at `features/pricing/logic/`).
- Report rendering (`features/report/`).
- Email templates (report emails live in `features/report/server/emails/`).

**Related:**

- `features/pricing/logic/reportPricing.ts` — price quote source, consumed by checkout.
- `app/api/stripe/webhook/route.ts` — dispatches to `server/fulfillment.ts`.
- Stripe dashboard webhook endpoint: `https://<domain>/api/stripe/webhook` — see `CLAUDE.md` for the event list.
