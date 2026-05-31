# shared

**Purpose:** Cross-cutting infrastructure used by every feature. Renamed from the old top-level lib tree to make intent explicit. Imported via the `@shared/*` alias.

**Subtrees:**

- `http/` — CSRF, rate limit, fetch-with-timeout, circuit breaker, after-response scheduler, is-prod-cron-host guard.
- `observability/` — pino logger, Hotjar bootstrap, Slack alerts + dedup, UX signals, visitor pinger.
- `auth/` — Supabase Auth client helper for middleware (admin sessions only — no end-user auth).
- `url/` — UTM capture, safe-href, share-message, signed-image-url builders.
- `format/` — html-escape.
- `emails/` — cross-feature email helpers: A/B variant picker, suppression list, unsubscribe token signer, shared HTML shell, site-url.
- `experiments/` — client-side A/B test buckets (forced paywall, client experiment targeting).
- `flags/` — system feature flags.
- `ui/` — shared browser-only React components (GTM, hydration, nonce, smooth scroll, UTM capture, UX signals, web vitals, branding).

**Belongs:** anything genuinely used by 2+ features and not specific to any one domain.

**Does NOT belong:**

- Feature-specific helpers (use `features/<name>/server/`).
- Feature UI (use `features/<name>/ui/`; shared chrome lives in `shared/ui/`).
