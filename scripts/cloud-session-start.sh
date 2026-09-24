#!/bin/bash
# A SessionStart hook in .claude/settings.json: tells a Claude cloud session
# how to get ready for the probes. It runs on every laptop too, where it exits
# at once. docs/runbooks/CLOUD_SESSIONS.md.
#
# It only speaks, because setting up takes about two minutes and most sessions
# never run a probe. What it prints becomes Claude's context.
[ "$CLAUDE_CODE_REMOTE" = "true" ] || exit 0
echo "Cloud session: before running anything in scripts/probes, run 'bash scripts/cloud-probes-setup.sh' once (about two minutes; it ends by printing ready). This environment holds no secrets, so the repo's loveiq-brain server (.mcp.json) cannot authenticate here: if the claude.ai loveiq-brain connector is enabled for this session, read the finding from table ux_finding there; otherwise ask for the finding's session id, devices and page. Then pass its devices, viewport and url_path to the probe."
exit 0
