"use strict";

// Gemini CLI skills: ~/.gemini/skills/<name>/SKILL.md. Proven against the
// installed package (@google/gemini-cli 0.39.1, bundle/docs/cli/skills.md):
// "User Skills: Located in ~/.gemini/skills/ or the ~/.agents/skills/ alias."
// The `ai-learn-` prefix keeps these out of the learner's own skill namespace.
// The old TOML commands under ~/.gemini/commands/ai-learn/ are migrated by
// install.js (content fingerprint), not written anymore.

const { renderSkill } = require("./skills");

function renderCommand(command) {
  return renderSkill(command, { namePrefix: "ai-learn-" });
}

// The pre-08.03 Gemini command format. Only install.js's migration reads it,
// to decide whether an old file is still byte-identical to what ai-learn wrote.
function escapeToml(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function renderLegacyCommand({ name, description, body }) {
  const lines = [
    `description = "${escapeToml(description)}"`,
    'prompt = """',
    body.trim(),
    '"""',
    "",
  ];

  return {
    filename: `${name}.toml`,
    content: lines.join("\n"),
  };
}

module.exports = { renderCommand, renderLegacyCommand };
