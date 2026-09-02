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

module.exports = { parseCommandFile, listCommandFiles };
