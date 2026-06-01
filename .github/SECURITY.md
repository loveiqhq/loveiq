# Security Policy

LoveIQ takes the security of our service and our users' data seriously. This
policy explains how to report a vulnerability and what to expect in return.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Report privately through one of:

- **Email:** `hello@loveiq.org` — use the subject prefix `[SECURITY]`.
- **GitHub:** the repository's **Security → Report a vulnerability** tab
  (private vulnerability reporting), if enabled.
- **Fallback:** the contact form at <https://www.loveiq.org/contact>, noting
  that it is a security report.

Please include:

- a description of the issue and its impact,
- steps to reproduce (proof-of-concept if possible),
- affected URL(s), endpoint(s), or component(s),
- any logs, requests, or screenshots that help us reproduce it.

## What to expect

- **Acknowledgement:** within 3 business days.
- **Triage & severity assessment:** within 7 business days.
- **Fix timeline:** communicated after triage; critical issues are prioritised
  for an expedited fix.
- We will keep you informed of progress and let you know when the issue is
  resolved. We are happy to credit reporters who wish to be acknowledged.

## Scope

In scope:

- The production site `https://www.loveiq.org` and its API routes (`/api/*`).
- This repository's source code and CI/CD configuration.

Out of scope (please do **not** test these):

- Denial-of-service / volumetric load testing against production.
- Social engineering, phishing, or physical attacks against staff.
- Automated scanner output without a demonstrated, reproducible impact.
- Findings in third-party services we depend on (Vercel, Supabase, Stripe,
  Resend) — report those to the respective vendor.

## Safe harbor

We will not pursue or support legal action against researchers who:

- make a good-faith effort to follow this policy,
- avoid privacy violations, data destruction, and service degradation,
- give us a reasonable time to remediate before any public disclosure.

## Operational reference

Internal rotation schedules, incident response, and hardening details live in
[`docs/runbooks/SECURITY.md`](../docs/runbooks/SECURITY.md) and
[`.github/INCIDENT_RESPONSE_AGENT.md`](INCIDENT_RESPONSE_AGENT.md).
