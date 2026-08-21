"use strict";

// Best-effort platform detection for `ai-learn init` when the caller doesn't
// pass `--platform` explicitly. Only Claude Code sets a verified environment
// variable on its own subprocesses (CLAUDECODE=1 — confirmed empirically by
// inspecting `process.env` inside a real Claude Code session). Codex, Gemini
// CLI and OpenCode have no equivalent confirmed here: guessing an unverified
// env var and being wrong (as happened earlier with an assumed Gemini hook
// field) is worse than staying silent. The real source of truth is the agent
// itself — it always knows which platform it is, and should pass `--platform`
// explicitly (see commands/learn.md) rather than relying on this fallback.
function detectPlatform() {
  if (process.env.CLAUDECODE === "1") {
    return "claude";
  }
  return null;
}

module.exports = { detectPlatform };
