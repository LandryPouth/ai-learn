"use strict";

// Codex CLI custom prompts: markdown files under ~/.codex/prompts/, frontmatter
// close to Claude Code's (description, argument-hint). Namespaced with an
// `ai-learn-` prefix so they cannot collide with the user's own prompts, and
// invoked as /prompts:ai-learn-<name>.
//
// Codex has no pre-write hook equivalent to Claude Code's PreToolUse — the
// mechanical learner-file guard cannot be ported here (see install.js /
// README). Only the commands travel; the guard stays a documented gap.

function escapeQuotes(value) {
  return String(value).replace(/"/g, '\\"');
}

function renderCommand({ name, description, argumentHint, body }) {
  const lines = ["---", `description: "${escapeQuotes(description)}"`];

  if (argumentHint) {
    lines.push(`argument-hint: "${escapeQuotes(argumentHint)}"`);
  }

  lines.push("---", "");

  return {
    filename: `ai-learn-${name}.md`,
    content: `${lines.join("\n")}\n${body}`,
  };
}

module.exports = { renderCommand };
