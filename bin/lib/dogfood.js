"use strict";

// Auto-written dogfood entries: `ai-learn check` calls this directly when it
// detects a broken platform integration (guard not wired, etc.) so the
// friction journal is filled by the *tool*, not by an agent that has to
// remember to transcribe a warning it saw in stdout. Deduplicated by a hidden
// `<!-- auto:<signature> -->` marker so re-running check every phase doesn't
// spam the same finding — a fresh entry only appears once the signature
// itself changes (a different platform, a different missing mechanism).

const fs = require("fs");
const path = require("path");

function appendAutoEntry(dir, { platform, surface, expected, problem, severity = "medium" }) {
  const dogfoodPath = path.join(dir, ".ai-learn", "dogfood.md");

  if (!fs.existsSync(dogfoodPath)) {
    return false; // no journal to write into (pre-init project, or removed)
  }

  const content = fs.readFileSync(dogfoodPath, "utf8");
  const signature = `${platform}:${surface}:${expected}`;
  const marker = `<!-- auto:${signature} -->`;

  if (content.includes(marker)) {
    return false; // already logged — never duplicate a live finding
  }

  const version = require("../../package.json").version;
  const entry = `### ${severity} — ${surface} non câblé (${platform})
${marker}
- Plateforme : ${platform}
- Surface : ${surface}
- Attendu vs réel : ${expected}
- Problème : ${problem}
- Workaround : aucun — entrée écrite automatiquement par \`ai-learn check\`, pas par l'agent
- Version de l'outil : ${version}
`;

  const insertMarker = "<!-- Nouvelle entrée en haut, sous cette ligne. -->";
  const idx = content.indexOf(insertMarker);

  if (idx === -1) {
    fs.appendFileSync(dogfoodPath, `\n${entry}`);
  } else {
    const insertAt = idx + insertMarker.length;
    fs.writeFileSync(dogfoodPath, `${content.slice(0, insertAt)}\n\n${entry.trim()}\n${content.slice(insertAt)}`);
  }

  return true;
}

module.exports = { appendAutoEntry };
