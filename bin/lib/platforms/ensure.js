"use strict";

// Mechanical, not agent-remembered: a learner resuming a project on a
// different platform than it was `init`ed on must not depend on the agent
// choosing to run a documented command — a prose instruction in AGENTS.md can
// always be skipped or forgotten (the exact failure mode this tool exists to
// eliminate everywhere else: verify, guard, dogfood). So this runs
// unconditionally before *every* `ai-learn <command>` (see bin/ai-learn.js),
// not as a separate step someone has to remember.
//
// The honest limit: this can only self-heal for a platform it can actually
// identify. `--platform` (the caller passes its own identity — an agent
// always knows this) is the reliable path. Auto-detection without it only
// works for Claude Code (CLAUDECODE=1, the one verified signal — see
// detect.js). For Codex/Gemini/OpenCode with no --platform given, there is
// no way around the agent needing to supply it; the fallback is that the raw
// `ai-learn <command>` always works regardless, so nothing is ever actually
// broken, only the /… shortcuts are missing.
//
// Cheap by design: checked via a single marker file per platform (one of the
// 7 commands each installer writes) rather than re-writing all 7 files on
// every single CLI invocation — a no-op once installed.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { detectPlatform } = require("./detect");
const { PLATFORMS, INSTALLERS } = require("../install");

const MARKER_FILE = {
  claude: (home) => path.join(home, ".claude", "commands", "next.md"),
  codex: (home) => path.join(home, ".codex", "prompts", "ai-learn-next.md"),
  gemini: (home) => path.join(home, ".gemini", "commands", "ai-learn", "next.toml"),
  opencode: (home) => path.join(home, ".config", "opencode", "command", "ai-learn", "next.md"),
  antigravity: (home) => path.join(home, ".gemini", "antigravity", "skills", "ai-learn-next", "SKILL.md"),
};

// A platform that does not read AGENTS.md on its own gets a one-line native
// memory file importing it, so a generalist session loads the learning protocol
// without going through /learn. Codex and OpenCode already read AGENTS.md at the
// project root — writing them a second file would be a second source of truth.
const NATIVE_MEMORY_FILE = {
  claude: "CLAUDE.md",
  gemini: "GEMINI.md",
};

const NATIVE_MEMORY_IMPORT = "@AGENTS.md";
const NATIVE_MEMORY_IMPORT_RE = /^\s*@AGENTS\.md\s*$/m;

function hasNativeMemoryImport(content) {
  return NATIVE_MEMORY_IMPORT_RE.test(content);
}

// Append-only by design: the native memory file belongs to the learner. The
// only thing ever written is the missing import line; existing lines are never
// rewritten or reordered. Returns null for a platform that needs no stub, and
// never throws — an unwritable file must not break `init`.
function ensureNativeMemoryFile(dir, platform) {
  const filename = NATIVE_MEMORY_FILE[platform];

  if (!filename) {
    return null;
  }

  const file = path.join(dir, filename);
  let existing = null;

  try {
    // A symlink could redirect the write outside the project: refuse it.
    if (fs.lstatSync(file).isSymbolicLink()) {
      return { file: filename, action: "failed", error: new Error("symlink") };
    }

    existing = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") {
      return { file: filename, action: "failed", error };
    }
  }

  if (existing !== null && hasNativeMemoryImport(existing)) {
    return { file: filename, action: "kept" };
  }

  const separator = existing === null || existing.length === 0 || existing.endsWith("\n") ? "" : "\n";

  try {
    // appendFileSync never re-encodes the learner's existing bytes.
    fs.appendFileSync(file, `${separator}${NATIVE_MEMORY_IMPORT}\n`);
  } catch (error) {
    return { file: filename, action: "failed", error };
  }

  return { file: filename, action: existing === null ? "created" : "appended" };
}

// Which platforms have their /… commands installed in this home. This is the
// only signal `check` has: a project cannot know which agents open it, but an
// installed platform is proof the learner means to use it.
function detectedPlatforms(home = os.homedir()) {
  return Object.entries(MARKER_FILE)
    .filter(([, marker]) => {
      try {
        return fs.existsSync(marker(home));
      } catch {
        return false;
      }
    })
    .map(([platform]) => platform);
}

// Never throws — a broken self-heal must not break the command that
// triggered it. Returns the platform it acted on, or null if it did nothing
// (unidentified platform, or already installed).
function ensurePlatformCommands(explicitPlatform) {
  const platform = explicitPlatform || detectPlatform();

  if (!platform || !PLATFORMS[platform]) {
    return null;
  }

  try {
    const home = os.homedir();

    if (fs.existsSync(MARKER_FILE[platform](home))) {
      return null;
    }

    INSTALLERS[platform]({ home });
    return platform;
  } catch {
    return null;
  }
}

module.exports = {
  ensurePlatformCommands,
  ensureNativeMemoryFile,
  detectedPlatforms,
  hasNativeMemoryImport,
  MARKER_FILE,
  NATIVE_MEMORY_FILE,
};
