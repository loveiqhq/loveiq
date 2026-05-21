# shared/emails

Cross-feature email helpers:

- `ab-variant.ts` — deterministic A/B variant picker for email templates.
- `shared.ts` — common HTML shell + footer used by all transactional templates.
- `suppression.ts` — unsubscribe / suppression-list check.
- `unsubscribe-token.ts` — HMAC-signed one-click unsubscribe token issuer.

Feature-specific templates live in `features/<name>/server/emails/` (invite, survey, report, admin).
