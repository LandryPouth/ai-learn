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

// Old slash names kept as thin aliases (story 04.05): `/next` still resolves,
// but points to `/learn-next`. Additive only — dropping an old name is a
// breaking change that waits for a major version, so projects scaffolded
// before the rename keep working untouched.
const COMMAND_ALIASES = {
  check: "learn-check",
  docs: "learn-docs",
  next: "learn-next",
  propose: "learn-propose",
  scan: "learn-scan",
  status: "learn-status",
};

// The one-line deprecation note every alias carries, above the canonical body
// it forwards to — same content, so the alias can never drift from the real
// command.
const DEPRECATION_MARKER = "Nom déprécié";

function deprecationNote(canonicalName) {
  return `> ⚠ ${DEPRECATION_MARKER} — cette commande s'appelle désormais \`/${canonicalName}\`.`;
}

function aliasCommand(name, canonical) {
  return {
    name,
    aliasOf: canonical.name,
    description: canonical.description,
    argumentHint: canonical.argumentHint,
    allowedTools: canonical.allowedTools,
    body: `${deprecationNote(canonical.name)}\n\n${canonical.body}`,
  };
}

// Every command an installer must write: the canonical commands/*.md files
// plus one generated alias per old name. Aliases are derived here, never a
// second copy on disk — the canonical body stays the single source of truth,
// so renaming or editing a command cannot leave an alias behind.
function listCommands(commandsDir) {
  const canonical = listCommandFiles(commandsDir).map((filePath) => ({
    ...parseCommandFile(filePath),
    filePath,
  }));
  const byName = new Map(canonical.map((command) => [command.name, command]));
  const aliases = Object.entries(COMMAND_ALIASES)
    .map(([name, canonicalName]) => {
      const source = byName.get(canonicalName);
      return source ? aliasCommand(name, source) : null;
    })
    .filter(Boolean);

  return canonical.concat(aliases);
}

// Claude Code reads commands/*.md natively, so canonical files are symlinked.
// A generated alias cannot be, so its content is re-serialized into the exact
// same frontmatter + body shape instead of a second source file.
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
  serializeClaudeCommand,
  COMMAND_ALIASES,
  DEPRECATION_MARKER,
};
