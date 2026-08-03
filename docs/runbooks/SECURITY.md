# Security Guide

> Owner: CODEOWNERS default
> Last verified: 2026-05-31
> Verified against: `.env.example`, `proxy.ts`, `shared/http/csrf.ts`, `shared/http/ratelimit.ts`, `.github/workflows/security.yml`

## Environment & secrets

- **Server-only secrets** (set only in Vercel env vars, never in client bundles): `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RECAPTCHA_SECRET_KEY`, `SLACK_CONTACT_WEBHOOK_URL`, `SLACK_SURVEY_WEBHOOK_URL`, `SLACK_PAYMENTS_WEBHOOK_URL`, `STAGING_PASSWORD`, `SURVEY_CLOSE_PASSWORD`, `GA4_API_SECRET`.
- **Server config** (not secret but server-only): `SUPABASE_URL`, `RESEND_FROM`, `RESEND_REPLY_TO`, `CONTACT_TO_EMAIL`.
- **Client-safe** (`NEXT_PUBLIC_*` prefix, exposed in browser bundles by design): `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_GTM_ID`.
- Never expose the Supabase service role key to the client; keep all DB access server-side.

## Secrets rotation schedule

| Secret                           | Rotation                | How to rotate                                                                                                                                                                                                                                              |
| -------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY`      | Quarterly / on incident | Supabase Dashboard → Settings → API → Regenerate                                                                                                                                                                                                           |
| `RESEND_API_KEY`                 | Quarterly / on incident | Resend Dashboard → API Keys → Create new → Delete old                                                                                                                                                                                                      |
| `RECAPTCHA_SECRET_KEY`           | Annually / on incident  | Google reCAPTCHA Admin → Settings → Regenerate                                                                                                                                                                                                             |
| `SLACK_*_WEBHOOK_URL`            | On incident only        | Slack App → Incoming Webhooks → Add new → Remove old                                                                                                                                                                                                       |
| `STAGING_PASSWORD`               | On incident only        | Update in Vercel env vars → Redeploy                                                                                                                                                                                                                       |
| `SURVEY_CLOSE_PASSWORD`          | On incident only        | Update in Vercel env vars → Redeploy                                                                                                                                                                                                                       |
| `STRIPE_WEBHOOK_SECRET`          | Annually / on incident  | See §Webhook secret rotation below                                                                                                                                                                                                                         |
| `RESEND_WEBHOOK_SECRET`          | Annually / on incident  | See §Webhook secret rotation below                                                                                                                                                                                                                         |
| `UNSUBSCRIBE_SECRET`             | Annually / on incident  | `crypto.randomBytes(32).toString('hex')` → Vercel env → redeploy. Existing unsubscribe links in already-sent emails break — accept that or schedule rotation to coincide with low-email-volume window.                                                     |
| `SHARE_VERIFY_SECRET`            | Annually / on incident  | `crypto.randomBytes(32).toString('hex')` → Vercel env → redeploy. All existing share-recipient cookies invalidate immediately; users re-prompt at next access.                                                                                             |
| `CRON_SECRET`                    | Annually / on incident  | `crypto.randomBytes(32).toString('hex')` → Vercel env → redeploy. The vercel.json cron entries automatically pick up the new value on next fire.                                                                                                           |
| `STRATEGY_DIGEST_SIGNING_SECRET` | Annually / on incident  | `crypto.randomBytes(32).toString('hex')` → Vercel env → redeploy. Slack-cached PNG images signed with the old secret keep working until Slack's image-proxy TTL expires (~24h, then broken-image icon until the next Monday's digest re-signs everything). |

## Webhook secret rotation (R-25)

Stripe and Resend webhook secrets cannot be swapped atomically — for a brief
window after the new key lands in Vercel env but BEFORE the dashboard is
updated (or vice versa), incoming webhooks will fail signature verification.
For Stripe specifically, failed webhooks retry with exponential backoff for
3 days, so the swap is recoverable but messy. Plan a 30-second window.

### Stripe `STRIPE_WEBHOOK_SECRET`

1. **Add a second signing secret in Stripe dashboard.** Stripe → Developers → Webhooks → your endpoint → Signing secret → "Roll secret". Stripe accepts BOTH the old and new secret for 24 hours during the rollover window.
2. **Update Vercel env var** `STRIPE_WEBHOOK_SECRET` to the new value. Trigger redeploy.
3. **Verify** by triggering a test event from the Stripe dashboard (`Send test webhook` → `checkout.session.completed`). Confirm the event is processed (look in Vercel logs for `"Stripe webhook processed"`).
4. **Disable the old secret** in the Stripe dashboard once the redeploy is stable (≥10 min). Stripe stops accepting it; in-flight retries with the old secret start failing — fine because step 3 confirmed the new secret works.

### Resend `RESEND_WEBHOOK_SECRET`

1. **Generate a new signing secret in Resend dashboard.** Resend → Webhooks → your endpoint → Reveal → "Generate new". Unlike Stripe, Resend does NOT support overlapping secrets — the swap is atomic and any in-flight webhook fails signature verification during the seconds-long window.
2. **Update Vercel env var** `RESEND_WEBHOOK_SECRET` AT THE SAME TIME you click "Generate new" in the Resend dashboard. Trigger redeploy.
3. **Verify** by waiting for the next email-engagement webhook (or sending a test email and tracking the open). Confirm Slack ops doesn't fire the `resend_webhook_signature_fail` alert.
4. **Bound the failure window**: if step 2 takes >30s, Resend will retry the failed webhooks up to ~24h, so the bounce/complaint/click data isn't lost — it lands slightly late.

### Health check during rotation

Both webhook handlers post a Slack ops alert on signature failure
(`stripe_webhook_signature_fail`, `resend_webhook_signature_fail`). During
rotation, expect 1-5 of these immediately after the swap. If they continue
firing >5 minutes after step 2, rollback: revert the env var and re-enable
the old dashboard secret.

## Resend domain tracking (T-13 / T-14)

Resend enables open-tracking pixels and click-link wrapping by DEFAULT on
every verified domain. With tracking on:

- Every recipient's click hits `x.resend-links.com/...` before reaching
  `loveiq.org`. Resend logs the click (IP, UA, timestamp). The user sees
  the Resend redirect domain in their email client's hover preview.
- A 1×1 transparent pixel embedded in every HTML email fires on first
  render. Resend records "opened" + IP + UA.

Both behaviours have three problems for us:

1. **Privacy disclosure gap** — our privacy policy does not list Resend as
   a click/open tracking processor. Disclosure work is more effort than
   simply disabling.
2. **Brand** — `resend-links.com` in hover-preview erodes trust on
   transactional emails (purchase confirms, share links, magic links).
3. **Compliance** — the open pixel is a tracking technology that requires
   consent in some EU jurisdictions; transactional emails arguably escape
   under legitimate interest, but marketing nurtures do not.

Resend's per-message override is NOT available in SDK v6.12 (the
`emails.send` payload accepts no `tracking` field — verified against
`node_modules/resend/dist/index.d.mts`). Tracking is controlled at the
DOMAIN level only.

### One-time disable (operator action)

1. Open Resend dashboard → Domains → `send.loveiq.org` (or whichever
   sending domain is verified for this project).
2. Toggle **Click tracking** OFF.
3. Toggle **Open tracking** OFF.
4. Save. Changes apply to ALL future sends from this domain.

There is no rollback gotcha — existing in-flight emails keep whatever
tracking config they were sent with; new sends pick up the new domain
config.

### Verification

Send a test email from any of our routes (e.g., trigger an invite reminder
manually) and inspect the raw HTML in the recipient inbox:

- Hover any link — destination should be the real `loveiq.org` URL, NOT
  `x.resend-links.com/...`.
- Search the HTML body for `<img` — no 1×1 tracking pixel pointing at
  Resend's domain should be present.

### Re-enabling

If a future product decision requires open/click metrics, the cleanest path is:

1. Update the privacy policy to disclose Resend as a click/open processor.
2. Re-enable in the Resend dashboard.
3. Add the disclosure to the marketing-email opt-in copy at Q16015 (consent versioning via T-11 captures the new text).

**Rotation checklist:**

1. Generate new key in the service dashboard
2. Update Vercel environment variable
3. Trigger redeploy
4. Verify functionality (test form submissions)
5. Revoke/delete the old key
6. Log the rotation date

**Rotation reminders:** Set calendar reminders for:

- January 1, April 1, July 1, October 1 (quarterly review)

## DNS email-authentication records (P-11)

Resend deliverability rests on three DNS records published on the sending
domain (`send.loveiq.org`). All three live in the DNS zone, not in code —
this section documents the canonical expected values so an operator can
diff against `dig` output during an incident.

### SPF (TXT record at apex of sending domain)

```text
v=spf1 include:_spf.resend.com -all
```

- `-all` (hard-fail) is intentional: Gmail and Outlook treat soft-fail
  `~all` as nearly a pass these days, so a third party that ever spoofs
  the apex domain still wins. We control all senders via Resend.
- If a future provider is added (e.g. a separate transactional service),
  EXPAND the include list before flipping providers — do NOT mix `-all`
  with a missing include or every legitimate send hard-fails.

### DKIM (2 CNAME records, selectors provided by Resend)

Resend issues two selectors per verified domain (`resend._domainkey` and
`resend2._domainkey`). Both CNAMEs MUST resolve and BOTH MUST be signed
on every outgoing message. Re-verify any time a new sending sub-domain is
added.

To check from a shell:

```text
dig TXT resend._domainkey.send.loveiq.org +short
dig TXT resend2._domainkey.send.loveiq.org +short
```

Both should return CNAME chains terminating at a Resend-hosted record.

### DMARC (TXT record at `_dmarc.<sending-domain>`)

Current policy:

```text
v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@loveiq.org; pct=100; aspf=s; adkim=s
```

- `p=quarantine` (not `p=reject`) gives us a recovery window if a Resend
  outage briefly breaks DKIM — quarantine sends fail to the spam folder
  instead of being rejected outright. Move to `p=reject` once we have
  90 days of clean reports.
- `aspf=s` and `adkim=s` are strict alignment — the From: header domain
  must match the SPF Return-Path and DKIM-Signature `d=` exactly. Resend
  satisfies this by default.

### DKIM rotation cadence

- **Annual.** Resend rotates the underlying keys on a 12-month cycle; the
  selector CNAMEs do not change, so DNS does not need re-editing on the
  app side. Operator action is to confirm the two selectors still resolve
  during the annual security review.

### Monitoring

- `rua=mailto:dmarc-reports@loveiq.org` collects aggregate DMARC reports.
  Inspect quarterly: a spike in "fail" sources means either a spoofing
  attempt OR a new legitimate sender we forgot to add to SPF.
- Resend dashboard → Deliverability → Authentication status. Should be
  "Verified" for both DKIM selectors. A "Pending" or "Failed" line is the
  early warning before bulk inbox rejections.

## Stripe webhook IP allowlist (P-12)

We currently rely on **signature verification only** (`STRIPE_WEBHOOK_SECRET`
HMAC). Stripe publishes the list of webhook source IPs
(<https://stripe.com/files/ips/ips_webhooks.json>) but we do not enforce it
at the route level.

This is accepted-as-documented: the signature is a cryptographically strong
defense, and an attacker who somehow obtained the webhook secret would also
have the keys to fake the signature regardless of source IP. The IP
allowlist would add brittleness (Stripe updates the IP set without prior
notice) for marginal defense-in-depth.

**Operator note.** If this is ever revisited (e.g. an audit specifically
requests IP allowlisting), do it at the Vercel WAF / edge layer, not in
the route handler — the route runs after the Lambda spins up, so adding
an IP check there preserves zero of the cost-avoidance the allowlist
would otherwise provide.

## Monitoring & alerts

- Watch Vercel logs for spikes or 429/500s on `/api/survey` and `/api/contact`.
- Monitor Supabase logs for insert anomalies and rate spikes; enable row-level auditing if available.
- Monitor Resend dashboard for bounce/complaint rates; alert on send failures.
- Add Google Search Console/GA alerts for traffic anomalies.

## Backups & exports

- Export survey and waitlist_user data regularly from Supabase (CSV or snapshots) and store securely.
- Test restores periodically to ensure data integrity.

## Abuse protection

- Rate limit and cooldown on `/api/survey` and `/api/contact` (in place).
- Honeypot field on forms; consider adding CAPTCHA via env-flagged toggle if abuse increases.
- Keep generic error messages to avoid information disclosure.

## Secure headers & CSP

- Security headers are set in `proxy.ts` with nonce-based CSP (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, CSP).
- If you add new third-party scripts/resources, update CSP in `proxy.ts` accordingly.
- All inline scripts must use the `nonce` prop passed from the layout.
- **SRI (Subresource Integrity):** Google Analytics and reCAPTCHA don't support SRI hashes because their scripts change dynamically. Our nonce-based CSP provides equivalent protection by only allowing scripts with valid nonces to execute.

## Dependencies

- Run `npm audit` regularly; patch high/critical issues. Avoid shipping dev-only tooling to production if not needed.
- **Automated scanning**: See `.github/workflows/security.yml` for comprehensive dependency scanning
- **SBOM**: Software Bill of Materials generated on every build (90-day retention)
- **Dependabot**: Configured in `.github/dependabot.yml` for automated security updates

## Security Scanning

The repository uses multiple layers of automated security scanning:

### 1. Secret Scanning (TruffleHog)

- Runs on every push, PR, and weekly (`.github/workflows/security.yml`).
- Scans the **last 10 commits** (`fetch-depth: 10`), `--only-verified` — recent
  leaks are caught; older history / unverified patterns are NOT. A periodic
  full-history scan is a known gap (see CI/CD enforcement below).
- Fails the job if verified secrets are detected.

### 2. SAST - Static Analysis

- **Semgrep**: runs in a digest-pinned container; **note** the SARIF output is
  not uploaded (requires GitHub Advanced Security) and the job does not yet fail
  on findings — results are in the workflow logs only.
- **CodeQL**: `security-extended` / `security-and-quality` queries, but
  `upload: false` (no GHAS) — findings are computed, not surfaced in the Security
  tab and not gated. See CI/CD enforcement below for the path to make SAST gate.

### 3. Dependency Scanning

- **npm audit** (`--audit-level=high`): **blocks the merge** in `ci.yml` (Dependabot PRs exempted) and runs again in `security.yml`.
- **OSV-Scanner**: pinned binary (sha256-verified), config in `.osv-scanner.toml`.
- **SBOM generation**: CycloneDX format, stored as a 90-day artifact (not signed/attested).
- **Dependency Review**: currently **disabled** (commented out in `security.yml`; requires GHAS for private repos). npm audit + OSV cover the gap.

### 4. Custom Security Rules

- API routes must have CSRF protection, rate limiting, Zod validation
- Checks for dangerous patterns (eval, dangerouslySetInnerHTML)
- Verifies security headers in middleware
- Scans build output for leaked secrets

### 5. Enhanced Linting

- `eslint-plugin-security` for security anti-patterns
- `eslint-plugin-no-secrets` for secret detection
- Custom rules in `eslint.config.mjs`

## CI/CD enforcement (branch protection is unavailable on this plan)

GitHub **branch protection rules and repository rulesets are a paid feature** for
private repos (Team/Enterprise) — this repo is on the Free plan, so we **cannot**
require status checks or reviews at the GitHub layer. A red commit can therefore
reach `main` (a web merge, or `git push --no-verify`) and Vercel auto-deploys it.

Because we can't hard-block merges, enforcement is layered (defence in depth):

### Layer 1 — local pre-push gate (preventive)

`.husky/pre-push` runs `lint` + `typecheck` + `test` + `docs:check` before any
push — the same checks as the CI `lint` and `test` jobs. For our small team that
pushes from local, this is the primary gate. It is bypassable with
`git push --no-verify`; don't, except for a documented emergency.

### Layer 2 — CI red-main alert (detective)

`ci.yml` runs the full gate on every push to `main`. The `notify-failure` job
fires a **Slack alert** the instant `lint`/`test`/`integration`/`build` fail on
`main`, so a bad commit is caught in minutes and can be reverted before/just
after it deploys. It reuses the existing `SLACK_COMMITS_WEBHOOK_URL` Actions
secret (posts to the commits channel); the job no-ops safely if that secret is
unset.

### Layer 3 — Vercel build gate (preventive, for compile errors)

Vercel will not promote a deployment whose `next build` fails, so a build-breaking
commit cannot reach production — prod stays on the last good deploy. This does not
catch logic/test failures that still compile (Layers 1–2 do).

### Layer 4 — review convention (social)

`.github/CODEOWNERS` auto-requests review from both owners on PRs and the PR
template carries the checklist. Unenforced without branch protection, but it
keeps the 2-reviewer norm visible.

### Revert-red-main runbook

On a Layer-2 alert: open the linked Actions run, confirm the failure is real
(not flaky), then `git revert <sha> && git push` (fastest, keeps history) — or in
Vercel, instantly **promote the previous production deployment** while the fix is
prepared. Then fix forward.

### If the plan is upgraded (Team/Enterprise)

Add a ruleset on `main` (and `staging`): require status checks `Lint`, `Test`,
`Build` (+ `Documentation Impact Check` on PRs, `docs-truth` on doc paths);
require Code-Owner review (≥1) with stale-approval dismissal; require linear
history; block force-push + deletion. Also enable **Require signed commits** once
contributors have signing keys — signed tags give `release.yml` the provenance
the pipeline otherwise lacks (no SBOM signing / SLSA today).

### Other known gaps (tracked / accepted)

- **SAST gating:** Semgrep now **fails the job on error-severity findings** with
  the explicit rule packs (`security.yml`; the old `--config auto` ignored them).
  CodeQL still runs with `upload: false` — surfacing it in the Security tab needs
  GHAS (paid); the Semgrep error-gate is the free substitute.
- **Secret scan depth:** TruffleHog scans only the last 10 commits; add a
  scheduled full-history (`fetch-depth: 0`) scan to catch older leaks.
- **Dependency Review** is GHAS-gated and disabled; `npm audit --audit-level=high`
  (blocks merge) + OSV-Scanner cover dependency CVEs.
- **E2E is intentionally not in CI** (deferred until the funnel stabilises) — do
  not add it to the merge gate.
- **Prod deploy gating** (approvals / rollback) lives in Vercel project settings,
  not this repo — the revert runbook above is the rollback path.

## Incident response

- On suspected compromise: rotate Supabase/Resend keys, invalidate sessions if added later, redeploy, and review logs. Notify affected users if data exposure is confirmed.
- Review GitHub Security tab for any active alerts
- Check TruffleHog and CodeQL findings for indicators of compromise
- Generate fresh SBOM to audit all dependencies
