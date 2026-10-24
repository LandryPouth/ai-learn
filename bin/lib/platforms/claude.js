"use strict";

// Claude Code reads skills from ~/.claude/skills/<name>/SKILL.md and invokes
// them as /<name>, so the command names stay bare (`learn-next`, `next`, …) —
// no prefix. The old ~/.claude/commands/*.md files are migrated by install.js
// (content fingerprint), not rendered here.

const { renderSkill } = require("./skills");
const { serializeClaudeCommand } = require("./commands");

function renderCommand(command) {
  return renderSkill(command);
}

// The pre-08.03 Claude alias format. Only install.js's migration reads it, to
// decide whether an old generated alias is still byte-identical to what
// ai-learn wrote. Canonical commands were symlinks/copies of commands/*.md, so
// their expected content comes from the source file instead.
function renderLegacyCommand(command) {
  return {
    filename: `${command.name}.md`,
    content: serializeClaudeCommand(command),
  };
}

module.exports = { renderCommand, renderLegacyCommand };
