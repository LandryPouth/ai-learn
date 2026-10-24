"use strict";

// Antigravity skills: flat directories under
// ~/.gemini/antigravity/skills/<name>/SKILL.md, invoked implicitly by the
// agent (skills are description-matched, not typed like a slash command).
//
// The path is inherited from the previous adapter, which reported real skills
// installed at ~/.gemini/antigravity/skills/<name>/SKILL.md on its machine,
// byte-identical to the corresponding ~/.gemini/skills/<name>/SKILL.md —
// Antigravity shares Gemini CLI's skill mechanism (same binary system prompt
// requires a SKILL.md with YAML frontmatter `name` + `description`). It is not
// re-verified here: this machine has no Antigravity install, so the README
// says so explicitly rather than claiming a live discovery. Antigravity's
// public docs also mention a richer plugin.json/hooks.json format, but no
// trace of it was found on the previous install — only the flat skills/
// directory, so that's what's targeted here. If a future Antigravity version
// requires the plugin wrapper, this will need revisiting (flag it in
// .ai-learn/dogfood.md if commands don't load).
//
// The `ai-learn-` prefix keeps these out of the learner's own skill namespace.

const { renderSkill } = require("./skills");

function renderCommand(command) {
  return renderSkill(command, { namePrefix: "ai-learn-" });
}

module.exports = { renderCommand };
