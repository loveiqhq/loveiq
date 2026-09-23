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

## Letting the pipeline write a fix

`.github/workflows/generate-fix.yml` — **Actions → Generate and prove a fix →
Run workflow**. Give it three things: the probe that reproduces the defect, the
JSON environment that probe needs, and one plain sentence describing what a
visitor experienced. It proposes a fix, then proves it, then opens a pull
request — and only in that order.

It authenticates with the **team Claude subscription, not an API key**. Mint the
token once with `claude setup-token` (it needs a real terminal — Claude Code
cannot give it one) and store it as the repository secret
`CLAUDE_CODE_OAUTH_TOKEN`. Without it the workflow skips with a warning instead
of failing every run.

Two things it will not do, both enforced mechanically rather than by the prompt:

- **It cannot merge its own work.** The pull request opens ready for review and
  a person merges it — which is also the label the pipeline learns from, so
  automating the click would destroy the only signal that does not come from
  our own machinery judging itself.
- **It cannot touch anything a probe cannot vouch for.** `scripts/prove-fix.mjs`
  refuses any diff reaching API routes, migrations, auth, payments or the probes
  themselves, and refuses a change over the line cap. A green probe says the UI
  behaves; it says nothing about whether a payment still settles.

**What it is allowed to change.** Presentation code and tests only. Paths and
size are judged differently, because they answer different questions:

|          | question                             | answer                                                                                                                       |
| -------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **path** | can a probe speak to this at all?    | a hard gate — API routes, migrations, auth, payments and the probes themselves are refused before anything runs, at any size |
| **size** | how much should one green probe buy? | a tier — an oversize change is still proven, and opens as a **draft** rather than ready-to-merge                             |

Refusing a large diff unmeasured threw away the measurement too. The real
survey-loop fix was 171 product lines across a hook, a submit path and the
probe, and the honest verdict on it is "proven, and too big to merge on the
proof alone" — not silence.

The size cap counts PRODUCT lines, not test lines. A test changes no runtime
behaviour, so it cannot widen what the probe failed to check, and a fix that
brings its own regression test should not be penalised for it. (Measured: this
morning's consent-gate fix was 37 lines of product code and 56 of test.)

**Three ways the proposal step can fail, which need opposite responses.** The
job names them rather than reporting a bare failure, because the natural reading
of "failed" is "the model could not do it", and that is wrong in two of the three:

| what the log says   | what it means                        | what to do                                                      |
| ------------------- | ------------------------------------ | --------------------------------------------------------------- |
| `session limit`     | the Claude subscription is exhausted | wait for the reset and re-run; nothing about the task was wrong |
| `Reached max turns` | the defect is too large for one pass | narrow the defect, or fix it by hand                            |
| anything else       | a real error                         | read it                                                         |

In all three the partial work is committed, printed and pushed, so what it had
got to is readable.

**One organisation setting gates the pull request.** "Allow GitHub Actions to
create and approve pull requests" is off by default, and while it is off the
last step fails with `GitHub Actions is not permitted to create or approve pull
requests`. That is why this repo had never opened an automatic pull request —
including from `replay-pr.mjs`, since the day it was written. An org owner
enables it at <https://github.com/organizations/loveiqhq/settings/actions>.

Nothing is lost while it is off: the branch is pushed and the proof is in the
log, so the pull request can be opened by hand from `autofix/<timestamp>`.

Worth knowing before enabling it: the same toggle also lets Actions _approve_
pull requests. That is harmless today because `main` requires **zero**
approvals, so an approval gates nothing — but if required approvals is ever
raised to make review the human gate, this setting would let a workflow satisfy
it, and the two must be reconsidered together.

**What a proven run produces.** `prove-fix.mjs` prints `PROVEN` and then a
machine-readable `PROVEN_TIER=small|large`, which is what the workflow reads to
decide ready-for-review versus draft. That line going missing once cost a
genuinely proven fix its pull request — `grep` found nothing, exited 1, and
`bash -e` failed the step after six green checks — so the workflow now tolerates
a missing tier and a test requires the line to exist.

**When it fails.** The proof refusing a fix is a normal outcome, not a
malfunction — the first live run produced a plausible twelve-line change that
simply did not work, and was refused. The run then leaves two things behind so
the attempt can be read rather than guessed at: the proposed diff in the job
summary, and the branch itself (`autofix/<timestamp>`), pushed whether or not
the proof passed. It stays a BRANCH — unproven work must not sit in the review
queue wearing the same badge as proven work.

Reading that diff is how you tell apart a model that misunderstood the defect,
one that fixed the wrong thing, and a task no small change could satisfy. Those
call for rewording, retrying, and doing it by hand respectively.

`base_ref` replays a defect from history. That is how the machine is tested: a
healthy production has nothing to fix, and waiting for a customer to hit
something is not verification.

**A ref can be a local branch, a remote branch or a SHA** — the harness tries
each spelling, because in CI a branch pushed from a laptop exists only on the
remote and `actions/checkout` does not fetch it. An unresolvable ref fails
rather than falling back to `HEAD`, which would quietly prove a diff nobody
asked about.

Proving a candidate on its own, without generating anything:
`.github/workflows/prove-fix.yml`, or locally —

```bash
FIX_REF=my-branch PROBE=verify-survey-loop.mjs node scripts/prove-fix.mjs
```

## Reading a Supabase failure alert

Every write through `supabaseFetch` is checked, and a non-2xx is logged at
`error` — which mirrors to the ops Slack channel. Two things about that alert
are worth knowing before you go looking for a lost row.

**A 409 is not a failure.** It is how idempotency is expressed: a replayed
Stripe webhook hits the unique constraint on
`payment_webhook_event.stripe_event_id` and is refused on purpose. Logged at
`warn`, so it stays out of Slack.

**An RPC is a call, not a write.** PostgREST expresses both a table insert and
a database function call as a `POST`, and every analysis function in this
codebase (`get_conversion_funnel` and the rest of the analysis RPCs) is reached that
way. A failed function call reports

    supabase: a database function call was REFUSED — nothing was written

and carries `kind=rpc`. A refused INSERT reports "the row was not written" and
carries `kind=write`. Before 2026-09-23 both said the second thing, and a
mistyped report query was chased for an hour as data loss.

**`PGRST202` means the arguments did not match**, not that the function is
missing. `get_conversion_funnel` takes `(since_ts, utm_filter)`; a caller
sending `{days: 7}` gets a 404 while the function sits there perfectly healthy.
Check the signature before assuming a migration was skipped:

```sql
select proname, pg_get_function_identity_arguments(oid)
from pg_proc where proname = 'the_function';
```

**The alert carries the identifiers you need.** `path`, `method`, `status`,
`code` and `kind` are appended to the Slack line from an allowlist — objects
are never expanded, because a payload is where an email or a report token
hides. If you need more than that, Supabase's own gateway log has the request:

```sql
select log_attributes['request.path'] as path,
       toInt32OrZero(log_attributes['response.status_code']) as status,
       count() as n
from logs
where source = 'edge_logs'
  and log_attributes['request.method'] in ('POST','PATCH','PUT','DELETE')
  and toInt32OrZero(log_attributes['response.status_code']) >= 400
group by path, status order by n desc limit 25;
```

## Related Docs

- [README.md](../../README.md)
- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [SECURITY.md](SECURITY.md)
- [docs/api.md](../api.md)
- [docs/admin-api.md](../admin-api.md)
- [docs/architecture/TESTING.md](../architecture/TESTING.md)
