"use strict";

// Antigravity skills: flat directories under
// ~/.gemini/antigravity/skills/<name>/SKILL.md, invoked implicitly by the
// agent (skills are description-matched, not typed like a slash command).
//
// Confirmed on-disk, not guessed from docs: this machine has real skills
// installed at ~/.gemini/antigravity/skills/<name>/SKILL.md, byte-identical
// to the corresponding ~/.gemini/skills/<name>/SKILL.md — Antigravity shares
// Gemini CLI's skill mechanism (same binary system prompt requires a
// SKILL.md with YAML frontmatter `name` + `description`, found embedded in
// the installed language server). Antigravity's public docs also mention a
// richer plugin.json/hooks.json format, but no trace of it was found on this
// install — only the flat skills/ directory, so that's what's targeted here.
// If a future Antigravity version requires the plugin wrapper, this will
// need revisiting (flag it in .ai-learn/dogfood.md if commands don't load).

// YAML plain scalars break on a bare `:` mid-value (confirmed empirically —
// two real command descriptions contain one, e.g. "docs.md": "Gère les
// sources de doc : embarquées..."), so the description is always quoted.
function escapeYamlDoubleQuoted(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function renderCommand({ name, description, body }) {
  const skillName = `ai-learn-${name}`;
  const frontmatter = ["---", `name: ${skillName}`, `description: "${escapeYamlDoubleQuoted(description)}"`, "---", ""];

  return {
    // A directory, not a single file — install.js's installRendered() writes
    // "filename" directly under targetDir, so this signals a nested path.
    filename: `${skillName}/SKILL.md`,
    content: `${frontmatter.join("\n")}\n${body}`,
  };
}

module.exports = { renderCommand };
