#!/usr/bin/env bash
# install-claude.sh — thin wrapper kept for backward compatibility.
# The install logic lives in `ai-learn install claude` (bin/lib/install.js),
# reachable for any platform via `ai-learn install <platform>`.
set -euo pipefail

AI_LEARN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node "$AI_LEARN_DIR/bin/ai-learn.js" install claude
