"use strict";

// The learner's .gitignore: the tool advises `git add -A`, so a missing
// .gitignore means node_modules or a .env gets committed (story 09.04).
// Only absent lines are added, under a marked block; nothing the learner wrote
// is ever removed or reordered.

const fs = require("fs");
const path = require("path");

const MARKER = "# ai-learn";
const LINES = [
  "node_modules/",
  "dist/",
  "build/",
  ".env",
  ".env.*",
  "!.env.example",
  ".ai-learn/runs/",
  ".ai-learn/guard.log",
  ".ai-learn/revisit/",
  ".ai-learn/revisit.lock.json",
  "__pycache__/",
  ".venv/",
  "target/",
  "*.o",
];

// Returns "created" | "updated" | "unchanged".
function ensureGitignore(dir) {
  const file = path.join(dir, ".gitignore");
  const exists = fs.existsSync(file);
  const text = exists ? fs.readFileSync(file, "utf8") : "";
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const present = new Set(text.split(/\r?\n/).map((line) => line.trim()));
  const missing = LINES.filter((line) => !present.has(line));

  if (exists && missing.length === 0) {
    return "unchanged";
  }

  if (present.has(MARKER)) {
    fs.writeFileSync(file, appendToBlock(text, missing, eol));
    return "updated";
  }

  const gap = text === "" ? "" : text.endsWith("\n") ? eol : eol + eol;
  fs.writeFileSync(file, `${text}${gap}${[MARKER, ...missing].join(eol)}${eol}`);
  return exists ? "updated" : "created";
}

// Missing lines join the existing marked block (right after its last line)
// rather than trailing at the end of the file, so the block stays in one place.
function appendToBlock(text, missing, eol) {
  const lines = text.split(/\r?\n/);
  let index = lines.findIndex((line) => line.trim() === MARKER) + 1;

  while (index < lines.length && lines[index].trim() !== "") {
    index += 1;
  }

  lines.splice(index, 0, ...missing);
  return lines.join(eol);
}

module.exports = { ensureGitignore, GITIGNORE_LINES: LINES };
