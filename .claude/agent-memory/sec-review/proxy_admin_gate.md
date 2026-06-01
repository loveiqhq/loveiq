---
name: proxy-admin-gate
description: How the proxy.ts admin/staging gates work, the digest-image exemption, and the Next.js pathname-normalization property that makes prefix allowlists safe
metadata:
  type: project
---

# proxy.ts auth gates (admin + staging)

The admin gate (proxy.ts ~line 187) covers BOTH `/admin*` pages and `/api/admin*`
JSON routes with one Supabase-session check. `isAdminPublic` allowlist exempts:
`/admin/login`, `/api/admin/login`, `/api/admin/logout`, `/admin/auth/*`, and
(added 2026-05-31) `/api/admin/digest-image/`.

## Why digest-image is public-by-design

`app/api/admin/digest-image/[kind]/route.tsx` is an edge route rendering chart
PNGs for Slack funnel-digest messages. Slack's image proxy is ANONYMOUS (no
cookies/headers), so it self-authorizes via an HMAC signature in the URL
(`verifyImagePayload(d, s)` from `shared/url/signed-image-url.ts` → 403 on bad sig).
Reads no DB, exposes no admin data, fully deterministic from the signed payload.
The admin SESSION gate returning 401 broke the charts in prod — hence the exemption.
Defense layers: VALID_KINDS allowlist (400) → HMAC verify (403) → payload.kind===URL kind (400) → render.

## KEY SECURITY FACT — Next.js normalizes nextUrl.pathname before middleware

**Why:** path-confusion attacks (`/api/admin/digest-image/../stats`, encoded slashes)
are the obvious way to abuse a `startsWith()` prefix allowlist to reach a sibling
admin route. Verified against Next.js 16 proxy docs: dot-segments are resolved and
the pathname is normalized by DEFAULT before middleware runs. `%2F` does NOT decode
into a path separator in `nextUrl.pathname`. This is ONLY guaranteed while
`skipProxyUrlNormalize` is UNSET in next.config.js (confirmed unset 2026-05-31).
**How to apply:** if anyone ever sets `skipProxyUrlNormalize: true`, EVERY prefix-based
allowlist in proxy.ts (admin gate + staging gate) must be re-audited for path-confusion.
Also: `startsWith("/api/admin/digest-image/")` keeps the trailing slash, so it cannot
prefix-match a hypothetical `/api/admin/digest-image-something` sibling.

## CI security scanners only scan route.ts, not route.tsx

`.github/workflows/security.yml` custom-security-rules `find app/api -name 'route.ts'`
(exact, not `*.ts`) — so `route.tsx` files are NOT scanned for the CSRF/RateLimit/Zod
POST pattern. digest-image is `route.tsx` AND GET-only, so it's correctly out of scope
(those rules target POST/PUT/DELETE/PATCH). Not a gap for this route, but worth knowing:
a future `route.tsx` with a POST handler would silently escape those three checks.

## Staging gate (proxy.ts ~75-103) already exempts all of /admin

The staging gate exempts `path.startsWith("/admin")` — but NOT `/api/admin`. So on a
staging deploy with STAGING_PASSWORD set, `/api/admin/digest-image/*` WOULD hit the
staging gate and redirect to /login. This is harmless because staging crons are gated
by `isProdCronHost()` (funnel-digest no-ops on non-prod hosts) so staging never posts a
digest — no Slack proxy ever fetches a staging digest-image URL. Leaving the staging
gate unchanged is correct. (Prod has STAGING_PASSWORD unset, so the gate is a no-op there.)
