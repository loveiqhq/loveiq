#!/usr/bin/env bash
# check-docs-impact.sh — Advisory check for documentation freshness.
#
# Prints warnings when code changes in certain areas are not accompanied
# by documentation updates. Always exits 0 (advisory only, never blocks PRs).
#
# Usage:
#   scripts/check-docs-impact.sh            # compares HEAD against origin/main
#   scripts/check-docs-impact.sh <base_ref> # compares HEAD against a custom base

set -euo pipefail

BASE_REF="${1:-origin/main}"

# Ensure we have the base ref available (CI may do a shallow clone)
git fetch origin main --depth=1 2>/dev/null || true

# Get the list of changed files relative to the base
CHANGED_FILES=$(git diff --name-only "$BASE_REF"...HEAD 2>/dev/null || git diff --name-only "$BASE_REF" HEAD 2>/dev/null || echo "")

if [ -z "$CHANGED_FILES" ]; then
  echo "[docs-impact] No changed files detected. Nothing to check."
  exit 0
fi

WARNINGS=0

print_warning() {
  if [ "$WARNINGS" -eq 0 ]; then
    echo ""
    echo "============================================================"
    echo "  Documentation Impact Warnings (advisory, non-blocking)"
    echo "============================================================"
  fi
  WARNINGS=$((WARNINGS + 1))
  echo ""
  echo "  WARNING #${WARNINGS}: $1"
  echo "  -> $2"
}

# ---------------------------------------------------------------------------
# Check 1: Admin code changed without any .md file update
# ---------------------------------------------------------------------------
ADMIN_CHANGES=$(echo "$CHANGED_FILES" | grep -E '^(lib/admin/|app/admin/|app/api/admin/|components/admin/)' || true)

if [ -n "$ADMIN_CHANGES" ]; then
  MD_CHANGES=$(echo "$CHANGED_FILES" | grep -E '\.md$' || true)
  if [ -z "$MD_CHANGES" ]; then
    print_warning "Admin code changed but no documentation updated" \
      "Changed admin files:
$(echo "$ADMIN_CHANGES" | sed 's/^/           /')
         Consider updating CLAUDE.md, DEVELOPMENT.md, or relevant .planning/ docs
         if the admin panel API, auth flow, or UI structure changed."
  fi
fi

# ---------------------------------------------------------------------------
# Check 2: package.json scripts section changed without CLAUDE.md update
# ---------------------------------------------------------------------------
PACKAGE_CHANGED=$(echo "$CHANGED_FILES" | grep -E '^package\.json$' || true)

if [ -n "$PACKAGE_CHANGED" ]; then
  # Check if the scripts section actually changed
  SCRIPTS_DIFF=$(git diff "$BASE_REF"...HEAD -- package.json 2>/dev/null | grep -E '^\+.*"scripts"' || git diff "$BASE_REF" HEAD -- package.json 2>/dev/null | grep -E '^\+.*"(dev|build|start|lint|test|check|setup|analyze|prepare)"' || true)

  if [ -n "$SCRIPTS_DIFF" ]; then
    CLAUDE_MD_CHANGED=$(echo "$CHANGED_FILES" | grep -E '^CLAUDE\.md$' || true)
    if [ -z "$CLAUDE_MD_CHANGED" ]; then
      print_warning "package.json scripts changed but CLAUDE.md was not updated" \
        "The Quick Commands section in CLAUDE.md should reflect any new or modified npm scripts."
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Check 3: .env.example changed without CLAUDE.md update
# ---------------------------------------------------------------------------
ENV_EXAMPLE_CHANGED=$(echo "$CHANGED_FILES" | grep -E '^\.env\.example$' || true)

if [ -n "$ENV_EXAMPLE_CHANGED" ]; then
  CLAUDE_MD_CHANGED=$(echo "$CHANGED_FILES" | grep -E '^CLAUDE\.md$' || true)
  if [ -z "$CLAUDE_MD_CHANGED" ]; then
    print_warning ".env.example changed but CLAUDE.md was not updated" \
      "The Environment Variables table in CLAUDE.md should list any new or removed variables."
  fi
fi

# ---------------------------------------------------------------------------
# Check 4: API routes changed without CLAUDE.md repo map update
# ---------------------------------------------------------------------------
NEW_API_ROUTES=$(echo "$CHANGED_FILES" | grep -E '^app/api/.*route\.ts$' || true)

if [ -n "$NEW_API_ROUTES" ]; then
  # Only warn for new files (added, not modified)
  NEW_API_FILES=$(git diff --name-status "$BASE_REF"...HEAD 2>/dev/null | grep -E '^A.*app/api/.*route\.ts$' || git diff --name-status "$BASE_REF" HEAD 2>/dev/null | grep -E '^A.*app/api/.*route\.ts$' || true)
  if [ -n "$NEW_API_FILES" ]; then
    CLAUDE_MD_CHANGED=$(echo "$CHANGED_FILES" | grep -E '^CLAUDE\.md$' || true)
    if [ -z "$CLAUDE_MD_CHANGED" ]; then
      print_warning "New API route(s) added but CLAUDE.md was not updated" \
        "New routes:
$(echo "$NEW_API_FILES" | awk '{print $2}' | sed 's/^/           /')
         Add them to the Repo Map in CLAUDE.md."
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Check 5: proxy.ts (middleware/CSP) changed without SECURITY.md update
# ---------------------------------------------------------------------------
PROXY_CHANGED=$(echo "$CHANGED_FILES" | grep -E '^proxy\.ts$' || true)

if [ -n "$PROXY_CHANGED" ]; then
  SECURITY_MD_CHANGED=$(echo "$CHANGED_FILES" | grep -E '^SECURITY\.md$' || true)
  if [ -z "$SECURITY_MD_CHANGED" ]; then
    print_warning "proxy.ts changed but SECURITY.md was not updated" \
      "CSP or middleware changes should be reflected in SECURITY.md."
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
if [ "$WARNINGS" -gt 0 ]; then
  echo "============================================================"
  echo "  ${WARNINGS} documentation warning(s) found."
  echo "  These are advisory only and do not block the PR."
  echo "============================================================"
else
  echo "[docs-impact] All checks passed. No documentation warnings."
fi
echo ""

# Always exit 0 — this is advisory only
exit 0
