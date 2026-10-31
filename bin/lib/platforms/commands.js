"use strict";

// Parses commands/*.md — the canonical source for every slash command,
// written in Claude Code's format (frontmatter: description, argument-hint,
// allowed-tools). Platform adapters (./codex.js, etc.) read this shape and
// re-render it into each target platform's native format. The frontmatter is
// flat by design (3 fields, no nesting) so a hand-rolled parser is enough —
// no YAML dependency needed, consistent with the rest of the zero-dep CLI.

const fs = require("fs");
const path = require("path");

function parseValue(value) {
  if (value.startsWith("[")) {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value.slice(1, -1);
  }
  return value;
}

function parseCommandFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

  if (!match) {
    throw new Error(`${filePath}: missing frontmatter (expected --- ... --- at the top)`);
  }

  const [, frontmatter, rest] = match;
  const fields = {};

  for (const line of frontmatter.split(/\r?\n/)) {
    const lineMatch = line.match(/^([a-zA-Z-]+):\s*(.*)$/);

    if (lineMatch) {
      fields[lineMatch[1]] = parseValue(lineMatch[2].trim());
    }
  }

  return {
    name: path.basename(filePath, ".md"),
    description: typeof fields.description === "string" ? fields.description : "",
    argumentHint: typeof fields["argument-hint"] === "string" ? fields["argument-hint"] : "",
    allowedTools: Array.isArray(fields["allowed-tools"]) ? fields["allowed-tools"] : [],
    body: rest.replace(/^\n+/, "").replace(/\s+$/, "\n"),
  };
}

function listCommandFiles(commandsDir) {
  return fs
    .readdirSync(commandsDir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => path.join(commandsDir, name));
}

// Commands that story 10.01 retired as slash commands. Their flows now live in
// commands/references/<flux>.md, installed inside the `learn` skill. They are
// kept here only to rebuild what older ai-learn versions wrote, so
// install.js#migrateLegacyCommands can still recognise (and remove) a
// pre-08.03 command file by its bytes. Nothing here is ever installed.
const LEGACY_REFERENCE_COMMANDS = ["scan", "propose", "check", "docs"];

// Old slash names that were thin aliases (story 04.05) of a canonical command.
const LEGACY_ALIASES = {
  check: "learn-check",
  docs: "learn-docs",
  next: "learn-next",
  propose: "learn-propose",
  scan: "learn-scan",
  status: "learn-status",
};

const LEGACY_DEPRECATION_MARKER = "Nom déprécié";

function legacyDeprecationNote(canonicalName) {
  return `> ⚠ ${LEGACY_DEPRECATION_MARKER} — cette commande s'appelle désormais \`/${canonicalName}\`.`;
}

function legacyAliasCommand(name, canonical) {
  return {
    name,
    aliasOf: canonical.name,
    description: canonical.description,
    argumentHint: canonical.argumentHint,
    allowedTools: canonical.allowedTools,
    body: `${legacyDeprecationNote(canonical.name)}\n\n${canonical.body}`,
  };
}

// The three commands a learner sees: commands/*.md, nothing derived.
function listCommands(commandsDir) {
  return listCommandFiles(commandsDir).map((filePath) => ({
    ...parseCommandFile(filePath),
    filePath,
  }));
}

// The flows the `learn` skill routes to: commands/references/*.md. Each is
// installed as a plain file next to the skill's SKILL.md — never as a skill of
// its own — so it carries no `name` and no frontmatter once installed.
function listReferences(commandsDir) {
  const dir = path.join(commandsDir, "references");

  return listCommandFiles(dir).map((filePath) => ({
    ...parseCommandFile(filePath),
    filePath,
  }));
}

// Every command an older ai-learn installed: the canonical commands, the four
// reference flows under their former `learn-<flux>` names, and one generated
// alias per pre-04.05 name. Used by the legacy migration only.
function listLegacyCommands(commandsDir) {
  const canonical = listCommands(commandsDir).concat(
    listReferences(commandsDir)
      .filter((reference) => LEGACY_REFERENCE_COMMANDS.includes(reference.name))
      .map((reference) => ({ ...reference, name: `learn-${reference.name}` })),
  );
  const byName = new Map(canonical.map((command) => [command.name, command]));
  const aliases = Object.entries(LEGACY_ALIASES)
    .map(([name, canonicalName]) => {
      const source = byName.get(canonicalName);
      return source ? legacyAliasCommand(name, source) : null;
    })
    .filter(Boolean);

  return canonical.concat(aliases);
}

// Pre-08.03 Claude commands were symlinks of commands/*.md; a generated alias
// could not be, so it was serialized into the same frontmatter + body shape.
// Only the legacy migration reads this.
function serializeClaudeCommand({ description, argumentHint, allowedTools, body }) {
  return [
    "---",
    `description: ${JSON.stringify(description)}`,
    `argument-hint: ${JSON.stringify(argumentHint || "")}`,
    `allowed-tools: ${JSON.stringify(allowedTools || [])}`,
    "---",
    "",
    body,
  ].join("\n");
}

module.exports = {
  parseCommandFile,
  listCommandFiles,
  listCommands,
  listReferences,
  listLegacyCommands,
  serializeClaudeCommand,
};
