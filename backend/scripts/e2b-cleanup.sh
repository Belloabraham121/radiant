#!/usr/bin/env bash
# Kill all running E2B sandboxes for the current account (dev/staging safety net).
# Prefer npm run e2b:cleanup:radiant in production to only kill Radiant-tagged sandboxes.
set -euo pipefail

if ! command -v e2b >/dev/null 2>&1; then
  echo "e2b CLI not found. Install: npm i -g @e2b/cli" >&2
  exit 1
fi

echo "Killing all running E2B sandboxes..."
e2b sandbox kill --all --state=running
echo "Done."
