# Development Guide

> Owner: CODEOWNERS default
> Last verified: 2026-04-05
> Verified against: `package.json`, `.env.example`, `.github/workflows/ci.yml`, `app/api/**`, `proxy.ts`

## Prerequisites

- Node.js `20` as used in CI. See [docs/versions.md](../versions.md) for the pinned toolchain list.
- npm from the bundled Node.js installation.
- Optional service credentials only when you need live integrations.

## Quick Start

Recommended:

```bash
npm run setup
npm run dev
```

Manual:

```bash
npm install
npm run dev
```

`npm run setup` creates `.env.local` from `.env.example` if the file does not already exist.

## Expected Local State

After startup:

1. The site responds at `http://localhost:3000`.
2. The middleware sets a `__csrf` cookie on first request.
3. Public pages render without local env vars.
4. Form submissions and admin flows require the relevant env vars below.

## Environment Variables

### Required for specific features

| Variable                         | Purpose                                  | Required for local dev?                                     |
| -------------------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`           | Canonical URL, metadata, and email links | Recommended                                                 |
| `SUPABASE_URL`                   | Supabase REST base URL                   | Required for survey, admin data, and health checks          |
| `SUPABASE_SERVICE_ROLE_KEY`      | Server-side Supabase access              | Required for survey, tracking, and health checks            |
| `RESEND_API_KEY`                 | Transactional email delivery             | Required for contact email, invite email, and health checks |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Contact form reCAPTCHA client key        | Required for contact form UI                                |
| `RECAPTCHA_SECRET_KEY`           | Contact form reCAPTCHA verification      | Required for contact form submissions                       |
| `NEXT_PUBLIC_SUPABASE_URL`       | Browser-safe Supabase auth URL           | Required for admin auth UI                                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | Browser-safe Supabase auth key           | Required for admin auth UI                                  |

### Optional

| Variable                    | Purpose                                                     |
| --------------------------- | ----------------------------------------------------------- |
| `RESEND_FROM`               | Override sender identity for LoveIQ emails                  |
| `RESEND_REPLY_TO`           | Override reply-to address for outbound email                |
| `CONTACT_TO_EMAIL`          | Destination inbox for `/api/contact`                        |
| `SLACK_CONTACT_WEBHOOK_URL` | Contact form notifications                                  |
| `SLACK_SURVEY_WEBHOOK_URL`  | Survey completion notifications                             |
| `STAGING_PASSWORD`          | Enables the staging password gate and `/api/staging-login`  |
| `SURVEY_CLOSE_PASSWORD`     | Required to close the survey via `/api/admin/survey-status` |
| `NEXT_PUBLIC_GTM_ID`        | Optional Google Tag Manager container ID                    |
| `LOG_LEVEL`                 | Pino log level override                                     |

## Validation Commands

```bash
npm run lint
npm test
npm run build
npm run docs:truth
```

Use `npm run check` for the first three in one command. Run `npm run docs:truth` when you touch docs, API routes, env vars, scripts, or CI workflows.

## CSP and Runtime Behavior

`proxy.ts` applies different CSP behavior by environment:

| Directive area            | Development                            | Production         |
| ------------------------- | -------------------------------------- | ------------------ |
| Script execution          | Includes `'unsafe-eval'` for local HMR | No `'unsafe-eval'` |
| Local websocket access    | Allows localhost websocket connections | HTTPS only         |
| Upgrade insecure requests | Disabled                               | Enabled            |

No extra configuration is required when switching between local and production builds.

## Third-Party Integrations

- Google Analytics and GTM only become active when the matching public IDs are configured.
- CookieYes can load in development, but banner behavior still depends on its external script.
- The contact form requires both reCAPTCHA keys and `CONTACT_TO_EMAIL`.
- The health endpoint returns `503` until `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `RESEND_API_KEY` are configured and Supabase is reachable.

## Troubleshooting

### Forms return `403 Invalid request.`

1. Clear cookies for `localhost`.
2. Reload the page so middleware can reissue the `__csrf` cookie.
3. Retry the request with the `x-csrf-token` header that matches the cookie.

### Local dev shows CSP `EvalError`

Run against the current `proxy.ts`. Development CSP must allow `'unsafe-eval'` for Next.js HMR.

### reCAPTCHA does not load

1. Set `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` in `.env.local`.
2. Register `localhost` in the Google reCAPTCHA admin console.
3. Check the browser console for CSP or network errors.

### `/api/health` returns `503`

The route requires:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`

It also checks live Supabase reachability, so invalid credentials or a down Supabase project still return `503`.

## Related Docs

- [README.md](../../README.md)
- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)
- [docs/api.md](../api.md)
- [docs/admin-api.md](../admin-api.md)
- [docs/architecture/TESTING.md](../architecture/TESTING.md)
