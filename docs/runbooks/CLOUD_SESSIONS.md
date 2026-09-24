# Claude cloud sessions

> Owner: CODEOWNERS default
> Last verified: 2026-09-25
> Verified against: `scripts/cloud-probes-setup.sh`, `scripts/cloud-session-start.sh`, `.claude/settings.json`, `.github/workflows/cloud-setup-smoke.yml`, and a real session in the environment below

A Claude session in the cloud (claude.ai/code, the Claude app, `claude --cloud`)
can run the production probes itself. Someone asks about a finding and Claude
re-runs the probe on that reader's devices, with nobody's laptop involved.
Everything that writes, posts or needs a secret stays in GitHub Actions. Cloud
sessions draw on each member's normal plan limits, with no separate compute
charge. Claude in Slack (Claude Tag) is not used: its channel work is billed per
use (decided 2026-09-25).

## The environment

An Owner created it at claude.ai → Admin settings → **Cloud environments**, and
it is the organization default for Claude Code cloud sessions.

- **Name:** `loveiq probes`
- **Network access:** Custom, with **Also include default list of common package
  managers** checked, and these domains:

  ```text
  cdn.playwright.dev
  playwright.download.prss.microsoft.com
  loveiq.org
  *.loveiq.org
  cdn-cookieyes.com
  log.cookieyes.com
  ```

  The first two serve Playwright's browsers. The CookieYes hosts matter because
  the banner changes what a probe can tap. The live site also calls Google
  Analytics, Tag Manager, the ad tags and Clarity. They are left off on purpose:
  a probe run from here then cannot add robot visits to our analytics, and the
  page still renders without them.

- **Environment variables:** none are needed. Never put a secret here.
- **Setup script:** none. See "What a real session taught us" below.

## No secrets, on purpose

On our Team plan every member can read an environment's variables and setup
script. The feature that hides a key from the session ("API credentials") is
not available on Team plans yet. So `SUPABASE_SERVICE_ROLE_KEY`,
`POSTHOG_API_KEY` and the Slack tokens stay out, and that decides what a session
can do:

- **Runs:** every probe that only reads the live site (the `probe-guard.yml`
  set and the auto-PR set), `npm test`, lint.
- **Reads a finding:** through the loveiq-brain connector, table `ux_finding`
  (`session_id`, `criterion`, `devices`, `viewport_min`/`viewport_max`,
  `url_path`, `target_selector`). The session passes those to the probe.
- **Does not run:** `scripts/verify-ux-findings.mjs`, `replay-session.mjs` from
  a session id (it reads PostHog), and anything that writes the ledger or posts
  to Slack.

## How it is wired

- `scripts/cloud-session-start.sh` is a SessionStart hook in
  `.claude/settings.json`. On a laptop it exits at once. In the cloud it prints
  one line that Claude reads as context: run the setup before any probe.
- `scripts/cloud-probes-setup.sh` is that setup, run on demand because it takes
  about two minutes and most sessions never run a probe. It runs `npm ci` when
  the lockfile changed, installs Chromium and WebKit with their system
  libraries, adds the security proxy's certificates to Chromium's own store,
  then proves both engines load the live site and prints `ready`.
- `.github/workflows/cloud-setup-smoke.yml` runs the setup on a bare
  `ubuntu:24.04` as root, then a probe on each engine. It runs on every PR that
  touches the scripts or the lockfile, and weekly. It cannot reproduce the
  security proxy, which is why the certificate step was proven in a real
  session.

## What a real session taught us

Measured 2026-09-25 in a real session in this environment. The bare-Ubuntu
smoke test had passed; each of these still broke the probe:

- **The setup script ran and did nothing.** The VM's log records only that the
  script ran, its length and that it succeeded; not its output. Nothing it
  should have installed was there. A pasted copy nobody can read back is a
  silent failure waiting to happen, so the setup lives in the repo instead.
- **Chromium rejected every page** with `ERR_CERT_AUTHORITY_INVALID`. The
  session's traffic goes through Anthropic's security proxy, whose CAs sit in
  `/usr/local/share/ca-certificates/ccr-*.crt`. curl and WebKit trust them
  through the system store; Chromium only through its NSS store, which the
  setup now fills.
- **`claude --cloud` from a large checkout does not clone from GitHub.** Over
  the 100 MB bundle limit it uploads a squashed snapshot of the working tree,
  uncommitted edits included. Start test sessions from claude.ai/code, or from
  a clean worktree of `origin/main`.

## Check it works

Start a session in `loveiq probes` (claude.ai/code → the cloud icon above the
message box) and ask:

> Run `bash scripts/cloud-probes-setup.sh`, then
> `npx tsx scripts/probes/verify-consent-banner-clearance.mjs`, and tell me
> each exit code.

- The setup ends with `cloud-probes-setup: ready`.
- The probe's `0` or `1` means both browsers ran against the live site (`1` is
  a finding, not a setup fault). `3` means it could not measure: read which
  rows, since a slow cookie banner through the proxy shows up this way.
