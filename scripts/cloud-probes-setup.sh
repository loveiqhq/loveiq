#!/bin/bash
# Gets a Claude cloud session ready to run the probes in scripts/probes. Run it
# when a probe is needed: about two minutes on a fresh session, seconds after.
# docs/runbooks/CLOUD_SESSIONS.md.
#
# Every step was earned in a real session in the "loveiq probes" environment
# on 2026-09-25, where each one's absence broke the probe.
set -euo pipefail
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  echo "cloud-probes-setup: for Claude cloud sessions only. Locally, npm ci and npx playwright install are enough."
  exit 1
fi
cd "$(dirname "$0")/.."

# A fresh session has no node_modules (28s); a resumed one keeps them.
want=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ "$(cat node_modules/.cloud-lock-hash 2>/dev/null || true)" != "$want" ]; then
  npm ci --no-audit --no-fund --loglevel=error
  echo "$want" >node_modules/.cloud-lock-hash
fi

# The system libraries (the session runs as root) and the builds for the repo's
# own Playwright (1m24s). The image's /opt/pw-browsers holds an older Chromium
# build this version will not use, and no WebKit.
npx playwright install --with-deps chromium webkit

# The session reaches the internet through Anthropic's security proxy, which
# re-signs HTTPS with its own CAs (/usr/local/share/ca-certificates/ccr-*.crt).
# curl and WebKit trust them through the system store; Chromium checks its own
# NSS store, so every page failed with ERR_CERT_AUTHORITY_INVALID until they
# were added there. certutil imports only a file's FIRST certificate and one of
# these files holds two, so each file is split first.
shopt -s nullglob
cas=(/usr/local/share/ca-certificates/*.crt)
if [ ${#cas[@]} -gt 0 ]; then
  command -v certutil >/dev/null || apt-get install -y -qq libnss3-tools >/dev/null
  db="$HOME/.pki/nssdb"
  mkdir -p "$db"
  [ -f "$db/cert9.db" ] || certutil -d "sql:$db" -N --empty-password
  split=$(mktemp -d)
  for ca in "${cas[@]}"; do
    awk -v out="$split/$(basename "$ca" .crt)" \
      '/BEGIN CERTIFICATE/ { n++ } n { print > (out "-" n ".pem") }' "$ca"
  done
  for pem in "$split"/*.pem; do
    name=$(basename "$pem" .pem)
    certutil -d "sql:$db" -L -n "$name" >/dev/null 2>&1 ||
      certutil -d "sql:$db" -A -t "C,," -n "$name" -i "$pem"
  done
  rm -rf "$split"
fi

# Proof, not a claim: both engines load the live site.
node -e '
  const pw = require("playwright");
  const url = process.env.REPORT_ORIGIN || "https://www.loveiq.org";
  (async () => {
    for (const engine of [pw.chromium, pw.webkit]) {
      const browser = await engine.launch();
      const res = await (await browser.newPage()).goto(url);
      await browser.close();
      if (!res || !res.ok()) throw new Error(`${engine.name()} got ${res ? res.status() : "no response"} from ${url}`);
      console.log(`${engine.name()} loaded ${url}`);
    }
  })().catch((err) => { console.error(err.message); process.exit(1); });
'
echo "cloud-probes-setup: ready"
