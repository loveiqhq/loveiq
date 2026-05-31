# ADR 0003 — CSRF verification via body field for sendBeacon paths

- Status: Accepted
- Date: 2026-05-25
- Deciders: Eman
- Related: `shared/http/csrf.ts`, `app/api/survey-partial/route.ts`

## Context

The standard CSRF protection in this codebase is a double-submit cookie
pattern: the browser sends the CSRF value in both the `__Host-csrf` cookie
and the `x-csrf-token` request header, and `verifyCsrfToken()` constant-time
compares the two.

This works for `fetch()`-based POSTs, where the browser lets us set headers.
It does **not** work for `navigator.sendBeacon()`, used by the survey
partial-save flow to write the user's progress when they navigate away from
the page. `sendBeacon` does not let us set request headers — only the body
and content type.

Without an exemption, every partial-save fired via sendBeacon would return 403. The browser would silently fail to save state, the user's draft would
be lost, and the survey-paused cron would no longer have anything to act on.

## Decision

`verifyCsrfHeaderOrBody(request, body._csrf)` accepts the CSRF value from
either:

1. The `x-csrf-token` request header (preferred, used by all interactive POSTs)
2. A `_csrf` field in the JSON body (sendBeacon fallback)

The body-field path:

- Is only enabled on `/api/survey-partial`, **not** on other state-changing
  routes. New routes must NOT adopt this variant unless they have the same
  sendBeacon-style constraint.
- Skips the per-IP "CSRF storm" counter when the header is absent — a
  legitimate beacon submission shouldn't be punished for the missing header
  it physically cannot send. Genuine CSRF attacks still produce a header
  mismatch (or no token at all), which the storm counter catches.

## Consequences

- Pro: sendBeacon-based partial saves work without sacrificing CSRF defense
  on the rest of the API.
- Con: the body-field path is a slightly wider attack surface — a future
  route author could mis-apply `verifyCsrfHeaderOrBody` to a real form
  submission. Lint guidance: only `/api/survey-partial` should import this
  helper. If a second route ever legitimately needs it, this ADR should be
  amended with the second use case.
- Con: storm detection on `/api/survey-partial` is narrower than on other
  routes; abuse there would have to be detected via rate-limit signals
  rather than CSRF-mismatch counters.

## Implementation

- `shared/http/csrf.ts` exports `verifyCsrfHeaderOrBody`.
- `app/api/survey-partial/route.ts` is the only current consumer.
- `proxy.ts` documents the exemption in the security-rules tag.
