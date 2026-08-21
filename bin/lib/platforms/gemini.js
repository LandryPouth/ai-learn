"use strict";

// Gemini CLI custom commands: TOML files under ~/.gemini/commands/ai-learn/,
// invoked as /ai-learn:<name>. Format confirmed against the docs bundled with
// the installed package (@google/gemini-cli, docs/cli/custom-commands.md):
// required `prompt`, optional `description`, no other fields. ai-learn's
// commands take no arguments, so neither `{{args}}` nor `!{...}` (Gemini's
// argument-injection / inline-shell syntax) is used — the body just instructs
// the agent to run a fixed `ai-learn <cmd>`, same as the other adapters.

function escapeToml(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function renderCommand({ name, description, body }) {
  const lines = [`description = "${escapeToml(description)}"`, 'prompt = """', body.trim(), '"""', ""];

  return {
    filename: `${name}.toml`,
    content: lines.join("\n"),
  };
}

module.exports = { renderCommand };
