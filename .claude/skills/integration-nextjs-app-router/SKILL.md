---
name: integration-nextjs-app-router
description: PostHog's own documentation for adding PostHog to a Next.js App Router app (client and server SDKs, reverse proxy, identifying users), saved by the PostHog setup wizard. Use when adding or changing PostHog tracking, feature flags or user identification in a Next.js project.
---

# PostHog in a Next.js App Router app

Two pages from PostHog's documentation, saved when the PostHog wizard set up LoveIQ's
analytics:

- `references/next-js.md`: installing the browser and server SDKs, the provider, server-side
  capture and the reverse proxy.
- `references/identify-users.md`: identifying a person, resetting on logout, and person
  properties.

Read only the page you need. In LoveIQ's codebase, extend the existing setup rather than adding
a second one: PostHog starts in `instrumentation-client.ts`, the shared helpers are in
`features/analytics/client.ts`, and the `NEXT_PUBLIC_POSTHOG_*` rows of `CLAUDE.md` explain the
host and proxy rules.
