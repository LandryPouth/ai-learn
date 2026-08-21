"use strict";

// OpenCode custom commands: markdown files with frontmatter under
// ~/.config/opencode/command/ai-learn/, invoked as /ai-learn/<name>. Format
// triangulated from opencode.ai's public docs (description/agent/model
// frontmatter + prompt body) — confirmed against opencode 1.18.18 installed
// locally: after `ai-learn install opencode`, `opencode debug config` (no
// model call) resolves all 7 commands under "command": {"ai-learn/<name>":
// {description, template}}, template being the markdown body verbatim.

function renderCommand({ name, description, body }) {
  const lines = ["---", `description: "${description.replace(/"/g, '\\"')}"`, "---", ""];

  return {
    filename: `${name}.md`,
    content: `${lines.join("\n")}\n${body}`,
  };
}

module.exports = { renderCommand };
