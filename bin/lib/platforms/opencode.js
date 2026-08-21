"use strict";

// OpenCode custom commands: markdown files with frontmatter under
// ~/.config/opencode/command/ai-learn/, invoked as /ai-learn/<name>. Format
// triangulated from opencode.ai's public docs (description/agent/model
// frontmatter + prompt body) — not independently confirmed against a live
// config on this machine (opencode was installed but had no pre-existing
// custom commands to compare against), unlike the Codex and Gemini adapters.

function renderCommand({ name, description, body }) {
  const lines = ["---", `description: "${description.replace(/"/g, '\\"')}"`, "---", ""];

  return {
    filename: `${name}.md`,
    content: `${lines.join("\n")}\n${body}`,
  };
}

module.exports = { renderCommand };
