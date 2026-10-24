"use strict";

// Codex CLI skills: $CODEX_HOME/skills/<name>/SKILL.md (default ~/.codex).
// Proven against the installed codex-cli 0.138.0: the binary contains the
// `$CODEX_HOME/skills` discovery path and the TUI's `/skills` command, and this
// machine already has real skills in ~/.codex/skills/. The `ai-learn-` prefix
// keeps these out of the learner's own skill namespace.
//
// The old ~/.codex/prompts/ai-learn-*.md prompts are migrated by install.js
// (content fingerprint), not written anymore.

const { renderSkill } = require("./skills");

function renderCommand(command) {
  return renderSkill(command, { namePrefix: "ai-learn-" });
}

// The pre-08.03 Codex prompt format. Only install.js's migration reads it, to
// decide whether an old file is still byte-identical to what ai-learn wrote.
function escapeQuotes(value) {
  return String(value).replace(/"/g, '\\"');
}

function renderLegacyCommand({ name, description, argumentHint, body }) {
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

module.exports = { renderCommand, renderLegacyCommand };
