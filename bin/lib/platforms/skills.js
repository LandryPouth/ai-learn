"use strict";

// Shared SKILL.md renderer for every platform that reads Agent Skills
// (Claude Code, OpenCode, Gemini CLI, Codex CLI, Antigravity). The canonical
// source stays commands/*.md: this module only re-renders that one shape into
// the `name`/`description` frontmatter every skill loader expects.
//
// Two platform-specific details are deliberate:
//
// - The description is always double-quoted. Two real command descriptions
//   contain a bare `:` ("Gère les sources de doc : embarquées…"), which breaks
//   a YAML plain scalar — the same bug already hit Antigravity (story 08.03).
// - The directory name is the skill name, because every loader (OpenCode's
//   `**/SKILL.md` scan, Codex's skills validator, Claude's skill loader)
//   treats a mismatch as an invalid or undiscoverable skill.

const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SKILL_NAME = 64;

function escapeYamlDoubleQuoted(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function validateSkillName(name, label = "skill") {
  if (typeof name !== "string" || !name) {
    throw new Error(`${label}: name must be a non-empty string`);
  }
  if (name.length > MAX_SKILL_NAME) {
    throw new Error(`${label}: name "${name}" is longer than ${MAX_SKILL_NAME} characters`);
  }
  if (!SKILL_NAME_RE.test(name)) {
    throw new Error(
      `${label}: name "${name}" must be lowercase alphanumeric words separated by hyphens`,
    );
  }
}

// `namePrefix` namespaces a skill inside a platform's shared skills directory
// (Codex/Gemini/Antigravity use `ai-learn-` so they cannot collide with a
// learner's own skills). Claude/OpenCode keep the bare command name so the
// historical `/learn-*` and alias names still resolve.
function renderSkill({ name, description, body }, { namePrefix = "" } = {}) {
  const skillName = `${namePrefix}${name}`;
  validateSkillName(skillName);

  if (typeof description !== "string" || !description.trim()) {
    throw new Error(`${skillName}: description must be a non-empty string`);
  }

  const frontmatter = [
    "---",
    `name: ${skillName}`,
    `description: "${escapeYamlDoubleQuoted(description)}"`,
    "---",
    "",
  ];

  return {
    filename: `${skillName}/SKILL.md`,
    content: `${frontmatter.join("\n")}\n${body}`,
  };
}

// A strict parser for the exact subset we write, used by the tests so a
// malformed or silently-dropped field fails the build. It intentionally
// rejects unknown fields: a loader that ignores them would hide a typo.
function parseSkillFrontmatter(content, { file = "SKILL.md" } = {}) {
  const match = String(content).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

  if (!match) {
    throw new Error(`${file}: missing frontmatter (expected --- ... --- at the top)`);
  }

  const [, frontmatter, rawBody] = match;
  // The renderer puts one conventional blank line after the closing `---`;
  // strip exactly that, so the parsed body is the canonical command body.
  const body = rawBody.replace(/^\r?\n/, "");
  const fields = {};

  for (const rawLine of frontmatter.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, "");
    if (!line.trim()) {
      continue;
    }

    const lineMatch = line.match(/^([a-z-]+):\s*(.*)$/);
    if (!lineMatch) {
      throw new Error(`${file}: invalid frontmatter line: ${JSON.stringify(line)}`);
    }

    const [, key, rawValue] = lineMatch;

    if (key !== "name" && key !== "description") {
      throw new Error(`${file}: unexpected frontmatter field "${key}"`);
    }
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      throw new Error(`${file}: duplicate frontmatter field "${key}"`);
    }

    fields[key] = parseScalar(rawValue, file, key);
  }

  if (!fields.name) {
    throw new Error(`${file}: frontmatter field "name" is required`);
  }
  validateSkillName(fields.name, file);
  if (!fields.description) {
    throw new Error(`${file}: frontmatter field "description" is required`);
  }

  return { name: fields.name, description: fields.description, body };
}

function parseScalar(rawValue, file, key) {
  const value = rawValue.trim();

  if (value.startsWith('"')) {
    if (!value.endsWith('"') || value.length < 2) {
      throw new Error(`${file}: ${key} has an unterminated double-quoted value`);
    }

    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`${file}: ${key} has an invalid double-quoted value`);
    }
  }

  if (value.includes(":")) {
    throw new Error(`${file}: ${key} contains ":" and must be double-quoted`);
  }

  return value;
}

module.exports = {
  renderSkill,
  parseSkillFrontmatter,
  escapeYamlDoubleQuoted,
  validateSkillName,
  SKILL_NAME_RE,
  MAX_SKILL_NAME,
};
