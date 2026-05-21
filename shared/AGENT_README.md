# shared

**Purpose:** Cross-cutting infrastructure used by every feature. Renamed from old `lib/` to make intent explicit.

**Subtrees:**

- `http/` — CSRF, rate limit, fetch-with-timeout, circuit breaker, after-response scheduler.
- `observability/` — pino logger, Hotjar bootstrap.
- `auth/` — Supabase Auth client helper for middleware (admin sessions only — no end-user auth).
- `url/` — UTM capture, safe-href, share-message URL builders.
- `format/` — html-escape.
- `emails/` — cross-feature email helpers: A/B variant picker, suppression list, unsubscribe token signer, shared HTML shell.

**Belongs:** anything genuinely used by 2+ features and not specific to any one domain.

**Does NOT belong:**

- Feature-specific helpers (use `features/<name>/server/`).
- UI components (use `features/<name>/ui/` or top-level `components/` for stable shared chrome).
