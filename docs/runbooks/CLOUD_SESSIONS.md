# Claude cloud sessions

> Owner: CODEOWNERS default
> Last verified: 2026-09-24
> Verified against: `scripts/cloud-environment-setup.sh`, `scripts/cloud-session-start.sh`, `.claude/settings.json`, `.github/workflows/cloud-setup-smoke.yml`

A Claude session in the cloud (claude.ai/code, the Claude app, `claude --cloud`,
Claude in Slack) can run the production probes itself. Someone asks about a
finding and Claude re-runs the probe on that reader's devices, with nobody's
laptop involved. Everything that writes, posts or needs a secret stays in GitHub
Actions.

## The environment

An Owner creates it once: claude.ai → Admin settings → **Cloud environments** →
add an Anthropic-hosted environment, shared with the organization.

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
  the banner changes what a probe can tap. Measured 2026-09-24, the live site
  also calls Google Analytics, Tag Manager, the ad tags and Clarity. They are
  left off on purpose: a probe run from here then cannot add robot visits to our
  analytics, and the page still renders without them.

- **Environment variables:** `PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright`, and
  nothing else (see below).
- **Setup script:** the contents of `scripts/cloud-environment-setup.sh`.

For Claude in Slack, channel sessions use organization environments only. Make
this one the organization default at claude.ai/admin-settings/claude-code, or
pin it to the channel in the Claude Tag admin settings.

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

- `scripts/cloud-environment-setup.sh` is the environment's setup script. It
  installs the system libraries and the Chromium and WebKit builds for the
  pinned Playwright. It runs as root and must finish within about five minutes.
  The environment then snapshots the machine, so later sessions skip it for
  about a week. **After changing it, paste it into the environment again**: the
  environment keeps its own copy. `__tests__/scripts/cloud-setup.test.ts` fails
  when `package-lock.json` moves past the pinned Playwright, as the reminder.
- `scripts/cloud-session-start.sh` is a SessionStart hook in
  `.claude/settings.json`, run on every start and resume. On a laptop it exits
  at once. In the cloud it runs `npm ci` when the lockfile changed, fetches
  browsers for the repo's own Playwright, starts both engines to prove they
  launch, and prints one line that Claude reads as context: ready, or what is
  missing.
- `.github/workflows/cloud-setup-smoke.yml` runs both scripts on a bare
  `ubuntu:24.04` as root, then a probe on each engine. It runs on every PR that
  touches them or the lockfile, and weekly.

## Check it works

Start a session in `loveiq probes` (claude.ai/code → the cloud icon above the
message box) and ask:

> Run `npx tsx scripts/probes/verify-consent-banner-clearance.mjs` and tell me
> its exit code.

- `0` or `1` means both browsers ran against the live site (`1` is a finding,
  not a setup fault).
- `3` means it could not measure. The usual cause is a blocked host: the banner
  never appeared because `cdn-cookieyes.com` is missing from the list.
