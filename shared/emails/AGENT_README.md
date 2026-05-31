# shared/emails

Cross-feature email helpers:

- `ab-variant.ts` — deterministic A/B variant picker for email templates.
- `shared.ts` — common HTML shell + footer used by all transactional templates.
- `suppression.ts` — unsubscribe / suppression-list check.
- `unsubscribe-token.ts` — HMAC-signed one-click unsubscribe token issuer.
- `site-url.ts` — canonical site-URL resolver for links in emails.

Feature-specific templates live in `features/<name>/server/emails/` (survey, report, admin); invite templates live in `features/invite/emails/`.
