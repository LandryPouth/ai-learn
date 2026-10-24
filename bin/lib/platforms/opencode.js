"use strict";

// OpenCode skills: ~/.config/opencode/skills/<name>/SKILL.md, discovered by
// `opencode debug skill` (confirmed against opencode 1.19.x). The old
// ~/.config/opencode/command/ai-learn/*.md commands are migrated by install.js
// (content fingerprint), not written anymore.

const { renderSkill } = require("./skills");

function renderCommand(command) {
  return renderSkill(command);
}

// The pre-08.03 OpenCode command format. Only install.js's migration reads it,
// to decide whether an old file is still byte-identical to what ai-learn wrote.
function renderLegacyCommand({ name, description, body }) {
  const lines = ["---", `description: "${description.replace(/"/g, '\\"')}"`, "---", ""];

  return {
    filename: `${name}.md`,
    content: `${lines.join("\n")}\n${body}`,
  };
}

module.exports = { renderCommand, renderLegacyCommand };
