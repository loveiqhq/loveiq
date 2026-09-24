#!/bin/bash
# The SETUP SCRIPT of the "loveiq probes" Claude cloud environment.
#
# The environment keeps its own copy: after changing this file, paste it into
# claude.ai → Admin settings → Cloud environments → loveiq probes → Setup
# script. Runs as root on Ubuntu 24.04 before Claude starts, must finish within
# about five minutes, and is snapshotted, so later sessions skip it for about a
# week. docs/runbooks/CLOUD_SESSIONS.md.
#
# The system libraries Chromium and WebKit need, and their builds for the
# repo's Playwright (pinned; __tests__/scripts/cloud-setup.test.ts fails when
# package-lock.json moves past it). The session hook fetches newer builds if
# the repo has moved on since the snapshot.
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/ms-playwright}"
npx -y playwright@1.61.0 install --with-deps chromium webkit || true
# Whoever the session runs as can use them, and add builds for a newer version.
mkdir -p "$PLAYWRIGHT_BROWSERS_PATH" && chmod -R a+rwX "$PLAYWRIGHT_BROWSERS_PATH" || true
exit 0
