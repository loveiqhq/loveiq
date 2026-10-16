# Admin API Reference

> Owner: CODEOWNERS default
> Last verified: 2026-10-16
> Verified against: `app/api/admin/**/route.ts`, `app/api/admin/digest-image/[kind]/route.tsx`, `features/admin/server/roles.ts`, `features/admin/server/ap/route-guard.ts`, `proxy.ts`

This document catalogs the admin API under `/api/admin/*`.

Since 16 Oct 2026 the admin is AP-Analytics only. The old admin's pages and the routes
behind them were removed. What is left is AP's routes, sign-in and sign-out, and four
routes other things need: GDPR export and erasure (`data-subject`), one submission's
API (`submissions/[id]`, whose `PATCH` the DPIA names for rectification), the incident
kill switch (`system-flags`) and the Slack digests' charts (`digest-image`). Those four
have no admin page; they are called directly.

The admin pages are described in [admin-dashboard.md](admin-dashboard.md).
Admin lookup by task lives in [docs/admin/AGENT_README.md](admin/AGENT_README.md).

## Displaying Personal Data

AP-Analytics shows email addresses masked. `maskEmail()` in
[`features/admin/server/format.ts`](../features/admin/server/format.ts) reduces one to
first character plus domain (`hamza@loveiq.org` → `h***@loveiq.org`), and a value with
no local part or no `@` renders as `***` rather than being echoed whole. It is one of
several implementations of the same rule; `shared/observability/tests/slack.test.ts`
holds them all to it and fails if a divergent copy appears in the tree. The exceptions are
deliberate: the AP Explorer shows stored values for 15 minutes after an admin unlocks it
with a reason, and the API-only `submissions/[id]` GET and the data-subject export return
the stored address.

Note that `/api/admin/submissions/[id]` validates a corrected address with a looser
regex than the public survey form, so a stored address can contain characters Zod
would reject. Anything rendering one into Slack mrkdwn must escape it —
`codeSpan()` in `shared/observability/slack-blocks.ts` is the helper that does.

## Access Model

- `proxy.ts` checks the Supabase Auth admin session on every `/api/admin/*` call except
  login, logout and the digest images, and answers 401 without one or after 30 minutes idle.
- Those routes check it again through `verifyAdminSession()`, then the role in `admin_users`.
- Read routes require `viewer` access or higher.
- Mutating routes also require CSRF validation and are rate-limited.
- Some write routes need a higher role, listed per method below.
- `/api/admin/login` is the public entrypoint for requesting an allowlisted magic link.

Canonical role hierarchy from [`features/admin/server/roles.ts`](../features/admin/server/roles.ts):

- `viewer`
- `editor`
- `admin`

## Route Inventory

### Sign-in, GDPR, Submissions, and Kill Switch

| Route                         | Methods              | Minimum access                                              | Source                                                                                                                                                                                  |
| ----------------------------- | -------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/admin/login`            | `POST`               | Public route with CSRF, rate limiting, and allowlist checks | [`app/api/admin/login/route.ts`](../app/api/admin/login/route.ts)                                                                                                                       |
| `/api/admin/logout`           | `POST`               | Authenticated session logout with CSRF                      | [`app/api/admin/logout/route.ts`](../app/api/admin/logout/route.ts)                                                                                                                     |
| `/api/admin/data-subject`     | `POST`               | `admin`                                                     | GDPR Art. 15/17 DSAR endpoint (export / delete), API only. See [`app/api/admin/data-subject/route.ts`](../app/api/admin/data-subject/route.ts).                                         |
| `/api/admin/submissions/[id]` | `GET, PATCH, DELETE` | `GET viewer+`, `PATCH editor+`, `DELETE admin`              | API only. Its `PATCH` is the Art. 16 rectification in `docs/compliance/DPIA.md`. See [`app/api/admin/submissions/[id]/route.ts`](../app/api/admin/submissions/[id]/route.ts).           |
| `/api/admin/system-flags`     | `GET, PATCH`         | `GET viewer+`, `PATCH admin`                                | Kill-switch flags (`survey_submissions`, `nurture_sequence`, `report_paywall_enforced`), API only. See [`app/api/admin/system-flags/route.ts`](../app/api/admin/system-flags/route.ts). |

The Slack digests' charts come from `/api/admin/digest-image/[kind]` (`GET`,
[`app/api/admin/digest-image/[kind]/route.tsx`](../app/api/admin/digest-image/[kind]/route.tsx);
a `.tsx` route, so the docs-truth check does not read it and it is not in the table).
Slack's image proxy cannot sign in, so it takes no session: the URL carries the chart's
data and an HMAC signature, and a bad signature gets a 403.

### AP-Analytics (`/admin/ap`)

The analytics admin from Marcus's 12 Oct 2026 design: its own light shell
(`app/admin/ap/`, `features/admin/ui/ap/`), its figures from `ap_facts` and three companion
SQL functions (`supabase/migrations/20261013120000_ap_facts.sql` onward), shaped in
`features/admin/server/ap/`. Every route goes through `apGuard`
([`route-guard.ts`](../features/admin/server/ap/route-guard.ts)): CSRF for writes, then the
session and role, then the rate limit.

The raw data explorer masks every row as the team's data copy does
([`team-export.ts`](../features/admin/server/team-export.ts) `maskRow`). An admin can unlock
one table for 15 minutes with a reason, written to `admin_audit_log` before the unlock is
issued; unmasked rows then include full email addresses. Every explorer CSV export is
logged too.

| Route                           | Methods             | Minimum access                                         | Source                                                                                      |
| ------------------------------- | ------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `/api/admin/ap/focus`           | `GET`               | `viewer+`                                              | [`app/api/admin/ap/focus/route.ts`](../app/api/admin/ap/focus/route.ts)                     |
| `/api/admin/ap/assessment`      | `GET`               | `viewer+`                                              | [`app/api/admin/ap/assessment/route.ts`](../app/api/admin/ap/assessment/route.ts)           |
| `/api/admin/ap/traffic`         | `GET`               | `viewer+`                                              | [`app/api/admin/ap/traffic/route.ts`](../app/api/admin/ap/traffic/route.ts)                 |
| `/api/admin/ap/payment`         | `GET`               | `viewer+`                                              | [`app/api/admin/ap/payment/route.ts`](../app/api/admin/ap/payment/route.ts)                 |
| `/api/admin/ap/landing`         | `GET`               | `viewer+`                                              | [`app/api/admin/ap/landing/route.ts`](../app/api/admin/ap/landing/route.ts)                 |
| `/api/admin/ap/survey`          | `GET`               | `viewer+`                                              | [`app/api/admin/ap/survey/route.ts`](../app/api/admin/ap/survey/route.ts)                   |
| `/api/admin/ap/survey/answers`  | `GET`               | `viewer+`                                              | [`app/api/admin/ap/survey/answers/route.ts`](../app/api/admin/ap/survey/answers/route.ts)   |
| `/api/admin/ap/report`          | `GET`               | `viewer+`                                              | [`app/api/admin/ap/report/route.ts`](../app/api/admin/ap/report/route.ts)                   |
| `/api/admin/ap/status`          | `GET`               | `viewer+`                                              | [`app/api/admin/ap/status/route.ts`](../app/api/admin/ap/status/route.ts)                   |
| `/api/admin/ap/saved-filters`   | `GET, POST, DELETE` | `GET viewer+`, `POST`/`DELETE editor+` (own rows only) | [`app/api/admin/ap/saved-filters/route.ts`](../app/api/admin/ap/saved-filters/route.ts)     |
| `/api/admin/ap/catalog`         | `GET, PUT`          | `GET viewer+`, `PUT editor+`                           | [`app/api/admin/ap/catalog/route.ts`](../app/api/admin/ap/catalog/route.ts)                 |
| `/api/admin/ap/catalog/rows`    | `GET`               | `viewer+`                                              | [`app/api/admin/ap/catalog/rows/route.ts`](../app/api/admin/ap/catalog/rows/route.ts)       |
| `/api/admin/ap/explorer`        | `GET`               | `viewer+` (masked rows), `admin` for `format=csv`      | [`app/api/admin/ap/explorer/route.ts`](../app/api/admin/ap/explorer/route.ts)               |
| `/api/admin/ap/explorer/unlock` | `POST`              | `admin`, with a reason (logged)                        | [`app/api/admin/ap/explorer/unlock/route.ts`](../app/api/admin/ap/explorer/unlock/route.ts) |
