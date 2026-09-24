#!/bin/bash
# A SessionStart hook in .claude/settings.json: tells a Claude cloud session
# how to get ready for the probes. It runs on every laptop too, where it exits
# at once. docs/runbooks/CLOUD_SESSIONS.md.
#
# It only speaks, because setting up takes about two minutes and most sessions
# never run a probe. What it prints becomes Claude's context.
[ "$CLAUDE_CODE_REMOTE" = "true" ] || exit 0
echo "Cloud session: before running anything in scripts/probes, run 'bash scripts/cloud-probes-setup.sh' once (about two minutes; it ends by printing ready). This environment holds no secrets: read a finding through the loveiq-brain connector (table ux_finding) and pass its devices, viewport and url_path to the probe."
exit 0
