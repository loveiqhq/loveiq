# Development Guide

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Edit .env.local with your values

# Start development server
npm run dev
```

## Environment Setup

### Required for full functionality

| Variable                         | Purpose              | Required for dev?         |
| -------------------------------- | -------------------- | ------------------------- |
| `NEXT_PUBLIC_SITE_URL`           | Canonical URL        | Only for metadata         |
| `SUPABASE_URL`                   | Waitlist database    | Only for form submissions |
| `SUPABASE_SERVICE_ROLE_KEY`      | Supabase auth        | Only for form submissions |
| `RESEND_API_KEY`                 | Email sending        | Only for form submissions |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Contact form captcha | Only for contact form     |
| `RECAPTCHA_SECRET_KEY`           | Captcha verification | Only for contact form     |

### Optional

| Variable                        | Purpose                                                   |
| ------------------------------- | --------------------------------------------------------- |
| `RESEND_FROM`                   | From address (default: `LoveIQ <hello@send.loveiq.org>`)  |
| `RESEND_REPLY_TO`               | Reply-to address (default: `hello@loveiq.org`)            |
| `CONTACT_TO_EMAIL`              | Contact form recipient email                              |
| `SLACK_WAITLIST_WEBHOOK_URL`    | Slack notifications for waitlist signups                  |
| `SLACK_CONTACT_WEBHOOK_URL`     | Slack notifications for contact form                      |
| `SLACK_SURVEY_WEBHOOK_URL`      | Slack notifications for survey submissions                |
| `STAGING_PASSWORD`              | Password gate for staging deployment                      |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase project URL (browser-safe, for admin auth SDK)   |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (browser-safe, for admin auth SDK)      |
| `SURVEY_CLOSE_PASSWORD`         | Password to close/pause the survey (server-only)          |
| `NEXT_PUBLIC_GTM_ID`            | GTM container ID (optional, falls back to direct gtag.js) |
| `LOG_LEVEL`                     | Pino log level (default: info)                            |

**Tip:** You can run the site without any env vars set - the UI will render fine. Forms will fail gracefully with error messages.

## Development vs Production

### CSP (Content Security Policy)

The middleware applies different CSP rules based on environment:

| Directive                   | Development                      | Production         |
| --------------------------- | -------------------------------- | ------------------ |
| `script-src`                | Includes `'unsafe-eval'` for HMR | No `'unsafe-eval'` |
| `connect-src`               | Allows `ws://localhost:*`        | HTTPS only         |
| `upgrade-insecure-requests` | Disabled                         | Enabled            |

This is handled automatically - no configuration needed.

### Third-Party Scripts

In development, these scripts still load but may not function fully without keys:

- **Google Analytics** - Loads but won't track without valid ID
- **CookieYes** - Cookie consent banner loads
- **reCAPTCHA** - Requires `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`

## Testing

```bash
npm test              # Run unit tests (Vitest)
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
npm run test:e2e      # Run E2E tests (Playwright) — builds prod first
```

Unit tests live in `__tests__/` and E2E tests in `e2e/`. See `.planning/codebase/TESTING.md` for full test reference.

## Common Issues

### Blank sections / CSP errors in dev

If you see `EvalError: call to eval() blocked by CSP` in the console, ensure you're running the latest `proxy.ts` which relaxes CSP in development.

### Form submissions fail with 403

The CSRF token is set via a cookie (`__csrf`). If forms return 403:

1. Clear cookies for localhost
2. Refresh the page (middleware sets the cookie on first request)
3. Try submitting again

### reCAPTCHA not loading

1. Ensure `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` is set in `.env.local`
2. The site key must be registered for `localhost` in Google reCAPTCHA admin
3. Check browser console for CSP or network errors

## Scripts

```bash
npm run dev      # Start dev server (http://localhost:3000)
npm run build    # Production build
npm run start    # Run production build locally
npm run lint     # Run ESLint
npm run analyze  # Bundle size analysis (visual treemap)
npm run check    # Lint + test + build (full CI check)
```

## Project Structure

See `CLAUDE.md` for architecture overview and `SECURITY.md` for security guidelines.
