#!/bin/bash
# Makes the probes runnable in a Claude cloud session (claude.ai/code, Claude
# in Slack). A SessionStart hook in .claude/settings.json, so it also runs on
# every laptop, where it exits at once. docs/runbooks/CLOUD_SESSIONS.md.
#
# What it prints becomes Claude's context, so it says one true thing: ready,
# or what is missing.
[ "$CLAUDE_CODE_REMOTE" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# A fresh clone has no node_modules and a resumed session keeps them, so
# reinstall only when the lockfile moved.
want=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ "$(cat node_modules/.cloud-lock-hash 2>/dev/null)" != "$want" ]; then
  if ! npm ci --no-audit --no-fund --loglevel=error >/tmp/cloud-npm-ci.log 2>&1; then
    echo "Cloud setup: npm ci failed (/tmp/cloud-npm-ci.log), so tests and probes will not run."
    exit 0
  fi
  echo "$want" >node_modules/.cloud-lock-hash
fi

# The repo's own Playwright builds: a no-op when the environment already has
# them. Then actually start both engines, because a browser whose system
# libraries are missing downloads fine and only fails when launched.
npx playwright install chromium webkit >/tmp/cloud-playwright.log 2>&1
if ! node -e '
  const pw = require("playwright");
  (async () => { for (const e of [pw.chromium, pw.webkit]) await (await e.launch()).close(); })()
    .catch((err) => { console.error(err.message); process.exit(1); });
' >>/tmp/cloud-playwright.log 2>&1; then
  echo "Cloud setup: Chromium or WebKit cannot start (/tmp/cloud-playwright.log). This environment lacks their system libraries: use the \"loveiq probes\" environment."
  exit 0
fi
echo "Cloud setup: dependencies, Chromium and WebKit are ready, so the probes in scripts/probes run here against the live site. This environment holds no secrets: read a finding through the loveiq-brain connector (table ux_finding) and pass its devices, viewport and url_path to the probe."
exit 0
