#!/usr/bin/env bash
# check-docs-impact.sh - Blocking check for documentation freshness.
#
# Fails when high-risk code or config changes land without either:
# 1. a markdown documentation update in the same PR, or
# 2. an explicit checked "No doc impact" box in the PR body.
#
# Usage:
#   scripts/check-docs-impact.sh            # compares HEAD against origin/main
#   scripts/check-docs-impact.sh <base_ref> # compares HEAD against a custom base

set -euo pipefail

BASE_REF="${1:-origin/main}"
PR_BODY="${PR_BODY:-}"

git fetch origin main --depth=1 2>/dev/null || true

CHANGED_FILES=$(git diff --name-only "$BASE_REF"...HEAD 2>/dev/null || git diff --name-only "$BASE_REF" HEAD 2>/dev/null || echo "")

if [ -z "$CHANGED_FILES" ]; then
  echo "[docs-impact] No changed files detected. Nothing to check."
  exit 0
fi

FAILURES=0
MD_CHANGES=$(echo "$CHANGED_FILES" | grep -E '\.md$' || true)
DOCS_UPDATED_CHECKED=0
NO_DOC_IMPACT_CHECKED=0

if printf '%s\n' "$PR_BODY" | grep -qiE '^[[:space:]]*-[[:space:]]*\[[xX]\][[:space:]]+Documentation updated\b'; then
  DOCS_UPDATED_CHECKED=1
fi

if printf '%s\n' "$PR_BODY" | grep -qiE '^[[:space:]]*-[[:space:]]*\[[xX]\][[:space:]]+No doc impact\b'; then
  NO_DOC_IMPACT_CHECKED=1
fi

print_failure() {
  if [ "$FAILURES" -eq 0 ]; then
    echo ""
    echo "============================================================"
    echo "  Documentation Impact Failures"
    echo "============================================================"
  fi

  FAILURES=$((FAILURES + 1))
  echo ""
  echo "  FAILURE #${FAILURES}: $1"
  echo "  -> $2"
}

check_requires_docs() {
  local title="$1"
  local pattern="$2"
  local guidance="$3"
  local matches

  matches=$(echo "$CHANGED_FILES" | grep -E "$pattern" || true)
  if [ -n "$matches" ] && [ -z "$MD_CHANGES" ] && [ "$NO_DOC_IMPACT_CHECKED" -ne 1 ]; then
    print_failure "$title changed without a documentation update" \
"Changed files:
$(echo "$matches" | sed 's/^/           /')
         $guidance"
  fi
}

if [ "$DOCS_UPDATED_CHECKED" -eq 1 ] && [ "$NO_DOC_IMPACT_CHECKED" -eq 1 ]; then
  print_failure "PR body is contradictory" \
"Check either 'Documentation updated' or 'No doc impact', not both."
fi

if [ -n "$MD_CHANGES" ] && [ "$NO_DOC_IMPACT_CHECKED" -eq 1 ]; then
  print_failure "'No doc impact' was checked but markdown files changed" \
"Markdown changes were detected:
$(echo "$MD_CHANGES" | sed 's/^/           /')"
fi

if [ -z "$MD_CHANGES" ] && [ "$DOCS_UPDATED_CHECKED" -eq 1 ]; then
  print_failure "'Documentation updated' was checked but no markdown files changed" \
"Update the docs in this PR or switch the checkbox to 'No doc impact'."
fi

check_requires_docs \
  "Admin surface" \
  '^(features/admin/|app/admin/|app/api/admin/)' \
  "Update docs/admin-api.md, README.md, DEVELOPMENT.md, or another canonical markdown file."

check_requires_docs \
  "Public API surface" \
  '^app/api/(contact/|health/|invite/|invite-tracking/|staging-login/|staging-logout/|survey/|survey-partial/|survey-tracking/|waitlist/)' \
  "Update docs/api.md or another canonical markdown file."

check_requires_docs \
  "Security and middleware surface" \
  '^(proxy\.ts|shared/http/csrf\.ts|shared/http/ratelimit\.ts)' \
  "Update SECURITY.md, DEVELOPMENT.md, or the relevant API documentation."

check_requires_docs \
  "Toolchain and environment surface" \
  '^(package\.json|package-lock\.json|\.env\.example|\.github/workflows/|scripts/check-docs-truth\.mjs|scripts/check-docs-impact\.sh)' \
  "Update README.md, DEVELOPMENT.md, docs/versions.md, or the relevant workflow/docs references."

echo ""
if [ "$FAILURES" -gt 0 ]; then
  echo "============================================================"
  echo "  ${FAILURES} documentation impact failure(s) found."
  echo "  Add markdown updates or check 'No doc impact' in the PR."
  echo "============================================================"
  exit 1
fi

echo "[docs-impact] All checks passed."
echo ""
