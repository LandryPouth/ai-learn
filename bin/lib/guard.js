"use strict";

// `ai-learn guard` — the PreToolUse hook installed in every learning project
// (by `init` / `update`). It enforces the "blocage apprenant" mechanically:
// the AI can never write into the learner's solution files (`src/**` by default,
// configurable in `.ai-learn/guard.json`). The learner types those files in their
// editor; the AI authors the reveal code into `docs/solutions/` instead, where the
// learner reads it and re-types it.
//
// Why a hook and not a line in AGENTS.md: a protocol written as prose can be
// skipped. A tool-call block cannot. For Write/Edit/MultiEdit/NotebookEdit the
// write never happens — that part is a wall. For Bash the guard is a hedge, not
// a wall: it recognises the common ways a shell command writes (redirection,
// tee, cp/mv/ln/install, sed -i / perl -i, python -c / node -e one-liners) and
// fail-opens on anything it cannot identify. This is the same escalation the
// tool already uses for `verify` (executed proof over declared proof), applied
// to "the learner did their part".
//
// Fail-open by design, like any guard that must not break a session: empty stdin,
// unparseable input, an unknown tool, or a missing config ⇒ allow. Only a clearly
// identified write into a learner path is refused, with a reason the agent can
// read and a JSONL denial logged for `ai-learn check`.

const fs = require("fs");
const path = require("path");
const {
  renderConfig: renderCodexConfig,
  findLiteralTestDirs,
  MARKER: CODEX_MARKER,
} = require("./platforms/codex-guard");

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const DEFAULT_LEARNER_FILES = ["src/**"];
const DEFAULT_BLOCKED_COMMANDS = ["git", "gh"];

// The learning mode, stored in `.ai-learn/guard.json`. `apprenti` (default):
// the learner types the implementation (`src/**`), the AI never writes it.
// `dirigeant`: the property inverts — the learner keeps the specification
// (`test/**`, `checkpoint/**`) and the AI writes the implementation.
const MODE_APPRENTI = "apprenti";
const MODE_DIRIGEANT = "dirigeant";
// The learner-owned files in `dirigeant` mode: the block set the guard applies.
// This must cover every test convention `scan.js#detectTests` recognizes, not
// just `test/**`: a project laying its tests out in `tests/`, `__tests__/`, or
// colocated `*.test.ts` files would otherwise let the AI rewrite the very
// specification the learner is supposed to own. `**/` requires a slash in the
// glob matcher, hence the root-level variants.
const DIRIGEANT_LEARNER_FILES = [
  "test/**",
  "tests/**",
  "__tests__/**",
  "**/test/**",
  "**/tests/**",
  "**/__tests__/**",
  // `detectTests` also matches a bare `test`/`spec` basename with any (or no)
  // extension: `test.js`, `spec.ts`, `src/test.py`, `test` itself. Without
  // these, a project using that convention would let the AI rewrite the
  // specification while `scan`/`norm`/`mutate` still classify it as a test.
  "test",
  "spec",
  "test.*",
  "spec.*",
  "**/test",
  "**/spec",
  "**/test.*",
  "**/spec.*",
  "**/*.test.*",
  "*.test.*",
  "**/*.spec.*",
  "*.spec.*",
  "**/test_*",
  "test_*",
  "**/*_test.*",
  "*_test.*",
  "**/*-test.*",
  "*-test.*",
  "**/*_spec.*",
  "*_spec.*",
  "**/*-spec.*",
  "*-spec.*",
  // `detectTests` also accepts the extensionless forms (`foo_test`,
  // `foo-spec`, `foo_spec`): `(?:^|[_-])(?:test|spec)(?:\.|$)`.
  "**/*_test",
  "*_test",
  "**/*-test",
  "*-test",
  "**/*_spec",
  "*_spec",
  "**/*-spec",
  "*-spec",
  "checkpoint/**",
];

// Files that wire the guard itself. An agent that can rewrite its own policy
// can turn `dirigeant` back into `apprenti` (or drop every learner path) in one
// Write, so these are denied in both modes, before the learner-path check. The
// learner edits them by hand; `init`/`update` (the CLI, not the agent) writes
// them normally.
const PROTECTED_FILES = [
  ".ai-learn/guard.json",
  ".claude/settings.json",
  // Outranks `.claude/settings.json` in Claude Code's settings precedence: a
  // single `"disableAllHooks": true` here disables the guard hook for the
  // running session (settings files are watched and reloaded). Must be denied
  // like the shared project file, or the self-protection is one Write away
  // from being turned off.
  ".claude/settings.local.json",
  ".codex/config.toml",
];
const DENIAL_LOG_MAX_BYTES = 256 * 1024;

// Commands that merely wrap another command — unwrapped so `sudo git log` or
// `env FOO=bar git status` still resolve to `git`, not to the wrapper itself.
const WRAPPER_COMMANDS = new Set(["env", "sudo", "command", "nice", "time", "exec"]);
// `npx <bin>` / `pnpm dlx <bin>` / `yarn dlx <bin>` run a binary without it
// being on PATH — the binary name is one token further in.
const DLX_RUNNERS = new Set(["pnpm", "yarn"]);

function normalizePortable(value) {
  return String(value).replace(/\\/g, "/");
}

function stripQuotes(token) {
  if (token.length >= 2) {
    const first = token[0];
    const last = token[token.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return token.slice(1, -1);
    }
  }
  return token;
}

function readHookInput({ inputFile = null } = {}) {
  try {
    if (inputFile) {
      return fs.readFileSync(inputFile, "utf8");
    }
    // fd 0 = stdin. In a hook context, the input is always piped.
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function parseHookInput(raw) {
  if (!raw || !raw.trim()) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Path the tool call targets, depending on the shape of tool_input.
function targetPath(toolInput) {
  if (!toolInput || typeof toolInput !== "object") {
    return null;
  }
  return toolInput.notebook_path || toolInput.file_path || null;
}

// The learner-file policy lives in `.ai-learn/guard.json`
// (`{ version: 1, mode: "apprenti", learnerFiles: ["src/**"] }`). Missing or
// corrupt config falls back to the default — a project that never ran
// `init`/`update` is still guarded against writing into `src/`.
//
// `validateGuardConfig` follows the data-file convention (docs/conventions.md):
// a hand-edited file is signalled, never silently accepted. The one decision
// that must never depend on a valid file is the mode: it falls back to
// `apprenti`, the most restrictive, so a typo cannot open `src/**`.
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// A config array is usable only when every entry is a non-empty string. One
// bad entry poisons the whole list: `matchesLearnerPath` would otherwise throw
// on `globToRegExp(null)`, and `guardCommand` turns that throw into a fail-open
// allow — the guard would silently stop guarding.
function validPatternList(value) {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function validateGuardConfig(config) {
  const issues = [];

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    issues.push({ level: "warning", message: "unreadable or non-object config — falling back to apprenti" });
    return issues;
  }

  if (config.version !== 1) {
    issues.push({ level: "warning", message: `version is ${JSON.stringify(config.version)}, expected 1` });
  }

  if (config.mode !== undefined && config.mode !== MODE_APPRENTI && config.mode !== MODE_DIRIGEANT) {
    issues.push({
      level: "warning",
      message: `mode ${JSON.stringify(config.mode)} is unknown — falling back to "${MODE_APPRENTI}" ` +
        `(expected "${MODE_APPRENTI}" or "${MODE_DIRIGEANT}")`,
    });
  }

  if (config.implementationFiles !== undefined) {
    if (config.mode !== MODE_DIRIGEANT) {
      issues.push({
        level: "warning",
        message: "implementationFiles only applies in mode \"dirigeant\" — ignored in apprenti",
      });
    } else if (!validPatternList(config.implementationFiles) || config.implementationFiles.length === 0) {
      issues.push({
        level: "warning",
        message: "implementationFiles must be a non-empty array of non-empty strings — falling back to src/**",
      });
    }
  }

  for (const field of ["learnerFiles", "blockedCommands", "gitAliases"]) {
    if (config[field] === undefined) {
      continue;
    }

    if (!Array.isArray(config[field])) {
      issues.push({ level: "warning", message: `${field} is not an array — ignored` });
    } else if (!validPatternList(config[field])) {
      issues.push({
        level: "warning",
        message: `${field} contains a non-string or empty entry — the whole field is ignored`,
      });
    }
  }

  return issues;
}

// Issues found in the raw `.ai-learn/guard.json`, for `ai-learn check`. The
// loader itself stays fail-safe and silent (a hot path must not warn), so the
// visibility of a hand-edited or typo'd file lives here. No file → no issue.
function guardConfigIssues(root) {
  const configFile = path.join(root, ".ai-learn", "guard.json");

  if (!fs.existsSync(configFile)) {
    return [];
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  } catch {
    return [{ level: "warning", message: "unreadable or invalid JSON — falling back to apprenti" }];
  }

  return validateGuardConfig(config);
}

function loadGuardConfig(root) {
  const defaults = {
    learnerFiles: DEFAULT_LEARNER_FILES,
    blockedCommands: DEFAULT_BLOCKED_COMMANDS,
    gitAliases: [],
  };
  const configFile = path.join(root, ".ai-learn", "guard.json");

  let config = null;
  try {
    if (fs.existsSync(configFile)) {
      config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    }
  } catch {
    config = null;
  }

  // `dirigeant` is selected only by the exact string. Anything else — absent,
  // misspelled, wrong type, a corrupt file — resolves to `apprenti`, the most
  // restrictive mode: a broken config must never open the implementation
  // (`src/**`) to the AI. `check` surfaces the unknown value (validateGuardConfig).
  const mode = config && config.mode === MODE_DIRIGEANT ? MODE_DIRIGEANT : MODE_APPRENTI;

  // The learner's own scope, used verbatim in `apprenti`; ignored in
  // `dirigeant` (the block set inverts outright). A malformed list falls back
  // to the default rather than crashing the guard.
  const storedLearnerFiles =
    config && validPatternList(config.learnerFiles) && config.learnerFiles.length > 0
      ? config.learnerFiles.slice()
      : null;

  // In `dirigeant` the block set inverts outright to the specification, so a
  // hand-set `learnerFiles` cannot half-apply the inversion.
  const learnerFiles =
    mode === MODE_DIRIGEANT
      ? DIRIGEANT_LEARNER_FILES.slice()
      : storedLearnerFiles || defaults.learnerFiles.slice();

  return {
    mode,
    learnerFiles,
    // The mutation/norm/hash target, kept distinct from `learnerFiles` once the
    // mode inverts it: in `dirigeant` mutation must test the implementation the
    // AI wrote, not the specification the learner now owns; in `apprenti` it
    // stays the learner's own files (a project that scoped `learnerFiles` to
    // `lib/**` must not start mutating `src/**`).
    //
    // `implementationFiles` is accepted only in `dirigeant`, and only as a
    // validated non-empty pattern list: it is how a project whose source is not
    // `src/**` (lib/**, app/**) keeps a real proof scope instead of silently
    // matching zero files. In `apprenti` it is ignored (the learner's own scope
    // is the target) and `check` says so.
    implementationFiles:
      mode === MODE_DIRIGEANT &&
      config &&
      validPatternList(config.implementationFiles) &&
      config.implementationFiles.length > 0
        ? config.implementationFiles.slice()
        : mode === MODE_DIRIGEANT
          ? DEFAULT_LEARNER_FILES.slice()
          : learnerFiles.slice(),
    // Unlike learnerFiles above, an explicit `[]` IS honored here (not treated
    // as "unset") — it is the documented escape valve to turn the git/gh block
    // off entirely for a project where it's genuinely wrong. A malformed list
    // (not an array, or an entry that is not a non-empty string) falls back to
    // the default: a typo must not disable the block.
    blockedCommands:
      config && validPatternList(config.blockedCommands)
        ? config.blockedCommands.slice()
        : defaults.blockedCommands.slice(),
    gitAliases:
      config && validPatternList(config.gitAliases) ? config.gitAliases.slice() : defaults.gitAliases.slice(),
  };
}

// A tiny glob matcher: `**` crosses directories, `*` stays inside one segment.
function globToRegExp(pattern) {
  let out = "";

  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];

    if (c === "*") {
      if (pattern[i + 1] === "*") {
        out += ".*";
        i += 1;
      } else {
        out += "[^/]*";
      }
    } else if (".+^${}()|[]\\".includes(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
  }

  return new RegExp(`^${out}$`);
}

// Windows (NTFS) and macOS (APFS, default) resolve paths case-insensitively:
// `Src/Index.ts` is the same file as `src/index.ts`, and `.Claude/Settings.json`
// is the same file as `.claude/settings.json`. Matching case-sensitively there
// would let one capital letter walk through the guard. On a case-sensitive
// volume the over-match is harmless (it denies a distinct path, never allows a
// protected one).
function caseInsensitiveFs(platform) {
  return platform === "win32" || platform === "darwin";
}

function matchesLearnerPath(relative, learnerFiles, platform = process.platform, options = {}) {
  // `dirigeant` asks whether a path *looks like* the learner's specification,
  // and `scan.js#detectTests` classifies suffixes case-insensitively
  // (`Foo.Test.ts` is a test there). Fold the case even on a case-sensitive
  // volume so the guard cannot be walked around with a capital letter; the
  // over-match can only deny a distinct path, never allow a protected one.
  const fold = options.caseInsensitive === undefined ? caseInsensitiveFs(platform) : options.caseInsensitive;
  const candidate = fold ? relative.toLowerCase() : relative;

  for (const pattern of learnerFiles || []) {
    if (!isNonEmptyString(pattern)) {
      continue;
    }
    if (globToRegExp(fold ? pattern.toLowerCase() : pattern).test(candidate)) {
      return true;
    }
  }
  return false;
}

function isProtectedPath(relative, platform = process.platform) {
  const fold = caseInsensitiveFs(platform);
  const candidate = fold ? relative.toLowerCase() : relative;

  // A nested `.ai-learn/guard.json` (`src/.ai-learn/guard.json`) is a decoy
  // policy: protected at any depth, like the directory that holds it.
  if (/(^|\/)\.ai-learn(\/guard\.json)?$/.test(candidate)) {
    return true;
  }

  return PROTECTED_FILES.some((file) => {
    const protectedFile = fold ? file.toLowerCase() : file;
    // A protected path is also its own directory: `rm -rf .ai-learn` removes
    // `guard.json` just as surely as writing it directly.
    return protectedFile === candidate || protectedFile.startsWith(`${candidate}/`);
  });
}

// Resolve symlinks on the deepest existing ancestor, so a link planted inside
// `src/` that points at `test/` (`ln -s ../test src/t`) cannot launder a write
// to `src/t/a.js`. The not-yet-existing tail is appended unchanged.
function realResolve(abs) {
  const tail = [];
  let current = abs;

  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...tail);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        return abs;
      }
      tail.unshift(path.basename(current));
      current = parent;
    }
  }
}

function toRelative(root, filePath) {
  if (!filePath) {
    return null;
  }
  const lexical = path.isAbsolute(filePath) ? path.normalize(filePath) : path.resolve(root, filePath);
  const abs = realResolve(lexical);
  const realRoot = realResolve(path.resolve(root));
  const rel = normalizePortable(path.relative(realRoot, abs));
  // On Windows, path.relative() across two different drives (e.g. project root
  // on D:, target on C:) can't express the difference as "../.." and instead
  // returns the target path unchanged — which doesn't start with "../" and
  // would silently defeat this check. path.isAbsolute() catches that case
  // (and rel === ".." catches the exact-parent edge case "../" alone misses).
  return rel === ".." || rel.startsWith("../") || path.isAbsolute(rel) ? null : rel;
}

// Write calls inside interpreted one-liners (`python -c`, `node -e`): the path
// is a quoted argument to a known write function, anywhere in the script. Only
// applied when the invocation is actually a one-liner, so a bare `grep` for such
// a call is never denied.
const PYTHON_WRITE_RE = /(?:open\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"](?:w|a))|(?:Path\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\.write_(?:text|bytes)\s*\()/gi;
const NODE_WRITE_RE = /(?:writeFileSync|writeFile|appendFileSync|appendFile|copyFileSync|copyFile)\s*\(\s*['"`]([^'"`]+)['"`]/g;

function execOneLinerWrites(command, tokens) {
  const writes = [];
  const isPyScript = tokens.some((t) => /^python\d*(\.\d+)*$/.test(t)) && tokens.includes("-c");
  const isNodeScript = tokens.some((t) => /^node$/.test(t)) && (tokens.includes("-e") || tokens.includes("--eval"));

  const collect = (re) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(command)) !== null) {
      writes.push(m[1] || m[2]);
    }
  };

  if (isPyScript) {
    collect(PYTHON_WRITE_RE);
  }
  if (isNodeScript) {
    collect(NODE_WRITE_RE);
  }
  return writes.filter(Boolean);
}

// The destinations a shell command would WRITE to. Defense-in-depth, not a wall:
// it catches the common escapes (redirection, tee, cp/mv/ln/install, sed -i /
// perl -i, python -c / node -e one-liners) and fail-opens on anything else. The
// primary guarantee is the Write/Edit block; shell detection only stops the
// obvious ways around it.
// Resolve a write target the way the shell would see it: `cd .ai-learn && ...`
// must not let `guard.json` escape the protected-path check. Absolute paths are
// left alone; relative paths are joined to the current `cd` context.
function resolveShellTarget(cwd, target) {
  if (!target || !cwd) {
    return target;
  }
  if (path.isAbsolute(target) || /^[A-Za-z]:[\\/]/.test(target)) {
    return target;
  }
  return normalizePortable(path.join(cwd, target));
}

// The directory a `cd`/`pushd` leaves the shell in, normalized the same way as
// a write target so the two always compare on the same base. Joining (not
// replacing) is what makes `cd a && cd ..` land back on the project root.
function resolveShellCwd(cwd, next) {
  if (path.isAbsolute(next) || /^[A-Za-z]:[\\/]/.test(next)) {
    return normalizePortable(next);
  }
  return normalizePortable(path.join(cwd || ".", next));
}

function shellWriteTargets(command, depth = 0) {
  const targets = [];

  // `$(...)` and backticks run an inner command whose writes are just as real
  // as the outer one's. Collect them (`collectSubshells` already recurses) and
  // scan each as its own command; the depth guard keeps a pathological input
  // from looping.
  if (depth === 0) {
    const subshells = [];
    collectSubshells(command, subshells);
    for (const sub of subshells) {
      targets.push(...shellWriteTargets(sub, depth + 1));
    }
  }

  let cwd = "";
  let previousCwd = "";
  const dirStack = [];

  // `&&`, `||`, `;`, `&` and newlines delimit commands; a `cd` applies to the
  // following segments. Pipes stay inside a segment so `cmd | tee file` still
  // exposes the `tee` target, while `cp a b | tee c` stops collecting operands
  // at the pipe.
  for (const segment of command.split(/&&|\|\||[;&\n]/)) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);

    if (tokens.length === 0) {
      continue;
    }

    const head = tokens[0].replace(/^\(+/, "");

    // `cd`/`pushd`/`popd` update the directory the next segment resolves
    // against. Joining (not replacing) is what stops `cd a && cd .. && echo x >
    // src/f` from resolving to `../src/f`, which `toRelative` would silently
    // drop — a bypass of both the learner block and the policy self-protection.
    if (head === "cd" || head === "pushd") {
      const next = tokens[1];

      if (next === "-") {
        const swapped = cwd;
        cwd = previousCwd;
        previousCwd = swapped;
      } else if (next && !next.startsWith("-")) {
        if (head === "pushd") {
          dirStack.push(cwd);
        }
        previousCwd = cwd;
        cwd = resolveShellCwd(cwd, stripQuotes(next));
      }
      continue;
    }

    if (head === "popd") {
      const popped = dirStack.pop();
      if (popped !== undefined) {
        previousCwd = cwd;
        cwd = popped;
      }
      continue;
    }

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // Redirection (`> file`, `>> file`, `2> file`, `&> file`) — the next token
      // is the destination. Also catches an inline `echo hi>src/x.ts`.
      if (token.includes(">")) {
        const parts = token.split(">");
        const dest = stripQuotes(parts[parts.length - 1]);

        if (dest && !dest.startsWith("/dev/") && !dest.startsWith("$") && !dest.startsWith("<")) {
          targets.push(resolveShellTarget(cwd, dest));
        }

        const next = tokens[i + 1];

        if (next && !next.startsWith("-") && !next.startsWith("(") && next !== "|") {
          targets.push(resolveShellTarget(cwd, stripQuotes(next)));
        }
        continue;
      }

      // tee [-a] <file> — skip the flags, then take the file operand.
      if (token === "tee") {
        let j = i + 1;
        while (j < tokens.length && tokens[j].startsWith("-")) {
          j += 1;
        }
        if (j < tokens.length && tokens[j] !== "|") {
          targets.push(resolveShellTarget(cwd, stripQuotes(tokens[j])));
        }
        continue;
      }

      // cp|mv|ln|install — `cp`/`install`/`ln` only write the destination, but
      // `mv` also removes its source, so both operands matter for the policy.
      // `-t <dir>` / `--target-directory[=]<dir>` moves the destination into the
      // given directory, so every remaining operand is a source to resolve
      // against `<dir>/<basename>`.
      if (["cp", "mv", "ln", "install"].includes(token)) {
        const operands = [];
        let targetDir = null;

        for (let j = i + 1; j < tokens.length; j++) {
          const operand = tokens[j];

          if (operand === "|" || operand === "&&" || operand === "||" || operand === ";") {
            break;
          }
          if (operand === "-t" || operand === "--target-directory") {
            targetDir = stripQuotes(tokens[j + 1] || "");
            j += 1;
            continue;
          }
          if (operand.startsWith("--target-directory=")) {
            targetDir = stripQuotes(operand.slice("--target-directory=".length));
            continue;
          }
          if (operand.startsWith("-")) {
            continue;
          }
          operands.push(stripQuotes(operand));
        }

        if (targetDir) {
          for (const source of operands) {
            const destination = path.posix.join(
              normalizePortable(targetDir),
              path.posix.basename(normalizePortable(source)),
            );
            targets.push(resolveShellTarget(cwd, destination));
          }
        } else {
          const selected = token === "mv" ? operands : operands.slice(-1);
          for (const operand of selected) {
            targets.push(resolveShellTarget(cwd, operand));
          }
        }

        // `ln -s ../test src/t` plants a link whose later writes land in the
        // link target; a same-command `&& echo x > src/t/a.js` is checked
        // before the link exists. A relative link target resolves against the
        // link's own directory, so a link into a learner path is itself denied.
        if (token === "ln" && !targetDir && operands.length >= 2) {
          const destination = normalizePortable(operands[operands.length - 1]);
          for (const source of operands.slice(0, -1)) {
            const linked = path.posix.isAbsolute(source)
              ? source
              : path.posix.join(path.posix.dirname(destination), normalizePortable(source));
            targets.push(resolveShellTarget(cwd, linked));
          }
        }
        continue;
      }

      // `rm`, `truncate` and `touch` destroy/rewrite/create their operands;
      // `rm -rf .ai-learn` must be caught even though the target is the
      // directory, not guard.json.
      if (token === "rm" || token === "truncate" || token === "touch") {
        for (let j = i + 1; j < tokens.length; j++) {
          const t = tokens[j];
          if (t === "|" || t === "&&" || t === "||" || t === ";") {
            break;
          }
          if (t.startsWith("-")) {
            continue;
          }
          targets.push(resolveShellTarget(cwd, stripQuotes(t)));
        }
        continue;
      }

      // `patch <file>` rewrites its operands (the diff on stdin is the `<`
      // redirection, skipped); `dd of=<file>` writes its target.
      if (token === "patch" || token === "dd") {
        for (let j = i + 1; j < tokens.length; j++) {
          const t = tokens[j];
          if (t === "|" || t.startsWith("<")) {
            break;
          }
          if (token === "dd" && t.startsWith("of=")) {
            targets.push(resolveShellTarget(cwd, stripQuotes(t.slice(3))));
          } else if (token === "patch") {
            // `-i`/`-p` never name a written file (the diff, a strip count);
            // `-o out` does, and `-d dir` is where the diff's files are written.
            if (t === "-d" || t === "--directory") {
              targets.push(resolveShellTarget(cwd, stripQuotes(tokens[j + 1] || "")));
              j += 1;
            } else if (t.startsWith("--directory=")) {
              targets.push(resolveShellTarget(cwd, stripQuotes(t.slice("--directory=".length))));
            } else if (/^-d.+/.test(t)) {
              targets.push(resolveShellTarget(cwd, stripQuotes(t.slice(2))));
            } else if (t === "-o" || t === "--output") {
              targets.push(resolveShellTarget(cwd, stripQuotes(tokens[j + 1] || "")));
              j += 1;
            } else if (t.startsWith("--output=")) {
              targets.push(resolveShellTarget(cwd, stripQuotes(t.slice("--output=".length))));
            } else if (t === "-i" || t === "--input" || t === "-p" || t === "--strip") {
              j += 1;
            } else if (!t.startsWith("-")) {
              targets.push(resolveShellTarget(cwd, stripQuotes(t)));
            }
          }
        }
        continue;
      }

      // Extractors/syncers drop files under a directory operand: `tar -C dir`,
      // `unzip -d dir`, `rsync src dest` (destination = last operand). The
      // directory itself is the target, so `test` matches the `test` pattern.
      if (token === "tar" || token === "unzip" || token === "rsync") {
        const operands = [];
        for (let j = i + 1; j < tokens.length; j++) {
          const t = tokens[j];
          if (t === "|") {
            break;
          }
          // `-C dir`, `-Cdir`, `--directory dir`, `--directory=dir`, and bundled
          // short flags (`-xCf dir`, `xCf dir`) where the next word is the
          // directory. Over-collecting a neighbour is harmless: it only denies
          // when it matches a learner pattern.
          const tarBundle = token === "tar" && (/^-[a-zA-Z]*C/.test(t) || (j === i + 1 && /^[a-zA-Z]*C[a-zA-Z]*$/.test(t)));
          const dirFlag = (token === "tar" && (t === "--directory" || t === "--one-top-level")) || (token === "unzip" && t === "-d");
          if (tarBundle || dirFlag) {
            const attached = token === "tar" && /^-C.+/.test(t) ? t.slice(2) : null;
            const dir = attached !== null ? attached : tokens[j + 1] || "";
            targets.push(resolveShellTarget(cwd, stripQuotes(dir)));
            if (attached === null) {
              j += 1;
            }
          } else if (token === "unzip" && /^-d.+/.test(t)) {
            targets.push(resolveShellTarget(cwd, stripQuotes(t.slice(2))));
          } else if (t.startsWith("--directory=") || t.startsWith("--one-top-level=")) {
            targets.push(resolveShellTarget(cwd, stripQuotes(t.slice(t.indexOf("=") + 1))));
          } else if (!t.startsWith("-")) {
            operands.push(t);
          }
        }
        if (token === "rsync" && operands.length > 1) {
          targets.push(resolveShellTarget(cwd, stripQuotes(operands[operands.length - 1])));
        }
        continue;
      }

      // In-place editors: `sed -i` / `perl -i` rewrite their file operands in
      // place. Every non-flag operand after the in-place flag is a file that gets
      // rewritten. Over-collecting the expression (e.g. `s/a/b/`) is harmless —
      // it can never match a learnerFiles pattern like `src/**`.
      if (token === "sed" || token === "perl") {
        let inPlace = false;

        for (let j = i + 1; j < tokens.length; j++) {
          const t = tokens[j];
          if (t === "|") {
            break;
          }
          if (/^-[a-zA-Z]*i/.test(t) || t === "--in-place" || t.startsWith("--in-place=")) {
            inPlace = true;
            continue;
          }
          if (inPlace && !t.startsWith("-")) {
            targets.push(resolveShellTarget(cwd, stripQuotes(t)));
          }
        }
        continue;
      }
    }

    // Interpreted one-liners (`python -c`, `node -e`) write through a quoted
    // argument, not a redirection — resolve each against the `cd` in force.
    for (const write of execOneLinerWrites(segment, tokens)) {
      targets.push(resolveShellTarget(cwd, write));
    }
  }

  return targets.filter(Boolean);
}

// Split a raw command string into independent segments to scan for a git/gh
// invocation: top-level `&&`/`||`/`;`/`|`/newline chains, plus the inner
// content of every `$(...)` / backtick span found anywhere (recursively, so a
// subshell nested inside a subshell is still scanned) — `echo $(git rev-parse
// HEAD)` must be caught even though the outer command is `echo`. This is the
// same "hedge, not a full shell parser" stance as `shellWriteTargets` above:
// naive on purpose, defense-in-depth on top of the mechanical Write/Edit wall.
function collectSubshells(str, out) {
  for (const m of str.matchAll(/\$\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
    out.push(m[1]);
    collectSubshells(m[1], out);
  }
  for (const m of str.matchAll(/`([^`]*)`/g)) {
    out.push(m[1]);
    collectSubshells(m[1], out);
  }
}

function splitSegments(command) {
  const subshells = [];
  collectSubshells(command, subshells);

  const segments = [];
  for (const str of [command, ...subshells]) {
    segments.push(...str.split(/&&|\|\||[;|]|\n/));
  }
  return segments.map((s) => s.trim()).filter(Boolean);
}

// Reduce a raw token to the binary name it would exec: strip quotes, drop any
// leading path (`/usr/bin/git` → `git`), drop a Windows `.exe` suffix.
function normalizeBinaryToken(token) {
  const stripped = stripQuotes(token);
  return path.basename(stripped).replace(/\.exe$/i, "");
}

// Full block (read + write) on any git/gh invocation the AI's own Bash tool
// would run — this is a distinct question from `shellWriteTargets` above
// ("does this write into src/**"): here a *match on the binary name alone* is
// enough, unconditional, no path/argument parsing needed. `git`/`gh` never
// pass through, regardless of subcommand or flags (`git -C dir log`, `gh pr
// view` — reads included, per the learner's explicit choice to type every
// git/gh command themselves, exactly like their code). Does NOT — and cannot
// — see `ai-learn`'s own internal `spawnGit(…)` calls (scan.js, docs.js,
// tracks/git.js, git-hooks.js, check.js): this hook only intercepts the AI agent's own
// PreToolUse-mediated Bash calls, never the CLI's own child processes.
function detectGitOrGh(command, blockedCommands) {
  // An explicit empty array IS respected (the block-off escape valve) — only
  // a genuinely absent argument (undefined/null) falls back to the default.
  const blocked = new Set(Array.isArray(blockedCommands) ? blockedCommands : DEFAULT_BLOCKED_COMMANDS);

  for (const segment of splitSegments(command)) {
    const tokens = segment.split(/\s+/).filter(Boolean);
    let i = 0;

    // Leading `VAR=value` assignments don't change which binary runs.
    while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) {
      i += 1;
    }

    // Unwrap wrapper commands (`sudo git log`, `env FOO=1 git status`).
    while (i < tokens.length && WRAPPER_COMMANDS.has(normalizeBinaryToken(tokens[i]))) {
      i += 1;
    }

    if (i >= tokens.length) {
      continue;
    }

    let head = normalizeBinaryToken(tokens[i]);

    // `npx gh pr view` / `pnpm dlx gh …` / `yarn dlx gh …` — the real binary
    // is the next non-flag token.
    if (head === "npx" || (DLX_RUNNERS.has(head) && tokens[i + 1] === "dlx")) {
      let j = head === "npx" ? i + 1 : i + 2;
      while (j < tokens.length && tokens[j].startsWith("-")) {
        j += 1;
      }
      if (j < tokens.length) {
        head = normalizeBinaryToken(tokens[j]);
      }
    }

    if (blocked.has(head)) {
      return { binary: head, segment };
    }
  }

  return null;
}

// The denial text is read by the agent verbatim, so it must name the right
// remedy for the mode: in `apprenti` the refused path is the implementation
// (`src/**`) and the reveal goes to `docs/solutions/`; in `dirigeant` it is the
// specification (`test/**`, `checkpoint/**`) and the AI is expected to write
// the implementation instead. A mode-blind message would send a dirigeant
// agent to deposit a "reveal" for tests the learner is supposed to own.
function learnerDenialReason({ mode, rel, learnerFiles, implementationFiles, viaShell }) {
  // In `dirigeant` the block set is the long parity list with `detectTests`;
  // joining all of it into every denial buries the remedy. Name the directory
  // conventions instead and let the guard.json list stay the exhaustive source.
  const scope =
    mode === MODE_DIRIGEANT
      ? "test/**, tests/**, __tests__/**, checkpoint/** (et les fichiers test/spec reconnus)"
      : learnerFiles.join(", ");

  if (mode === MODE_DIRIGEANT) {
    const implementation = (implementationFiles && implementationFiles.length > 0
      ? implementationFiles
      : DEFAULT_LEARNER_FILES
    ).join(", ");

    return viaShell
      ? `cette commande écrit dans ${rel}, un fichier de la spécification de l'apprenant (${scope}). ` +
          `En mode dirigeant, l'IA écrit l'implémentation (${implementation}), pas les tests ni les checkpoints : ` +
          "propose la modification à l'apprenant, qui met à jour sa spécification lui-même (cf. AGENTS.md §3)."
      : `${rel} appartient à la spécification de l'apprenant (${scope}). ` +
          `En mode dirigeant, l'IA écrit l'implémentation (${implementation}), pas les tests ni les checkpoints : ` +
          "propose la modification à l'apprenant, qui met à jour sa spécification lui-même (cf. AGENTS.md §3).";
  }

  return viaShell
    ? `cette commande écrit dans ${rel}, un fichier solution de l'apprenant (${scope}). ` +
        "`ai-learn guard` refuse l'écriture de l'IA ici : l'apprenant tape ce code (cf. AGENTS.md §3)."
    : `${rel} est un fichier solution de l'apprenant (${scope}). ` +
        "L'IA n'écrit pas ici : déposer le code de révélation dans `docs/solutions/`, " +
        "l'apprenant tape le vrai code (cf. AGENTS.md §3).";
}

function protectedPathReason(rel, viaShell) {
  return viaShell
    ? `cette commande écrit dans ${rel}, un fichier qui configure le garde-fou lui-même. ` +
        "L'IA ne modifie pas sa propre policy (mode, chemins, hooks) : demande à l'apprenant de le faire."
    : `${rel} configure le garde-fou lui-même (mode, chemins, hooks). ` +
        "L'IA ne modifie pas sa propre policy : demande à l'apprenant de le faire.";
}

// In `dirigeant` the learner-owned set is a set of *test conventions*, and
// `detectTests` matches those case-insensitively. Fold case for that check even
// on Linux (see `matchesLearnerPath`). `apprenti` keeps the historical
// platform-sensitive behavior, including for a custom `learnerFiles`.
function matchesGuardPath(rel, config) {
  // `apprenti` must keep the historical platform behavior: folding only where
  // the filesystem does (win32/darwin). Passing an explicit `false` here would
  // disable the fold on those platforms and let `Src/Index.ts` walk past
  // `src/**`. `dirigeant` folds everywhere so a capital letter cannot hide a
  // test file on a case-sensitive volume either.
  return matchesLearnerPath(rel, config.learnerFiles, process.platform, {
    caseInsensitive: config.mode === MODE_DIRIGEANT || caseInsensitiveFs(process.platform),
  });
}

function decide(hook, root) {
  if (!hook || typeof hook !== "object") {
    return { decision: "allow", reason: "no parseable hook input" };
  }

  const toolName = hook.tool_name;
  const toolInput = hook.tool_input;

  if (toolName === "Bash") {
    const command = toolInput && typeof toolInput.command === "string" ? toolInput.command : "";

    if (!command.trim()) {
      return { decision: "allow", reason: "no command to inspect" };
    }

    const config = loadGuardConfig(root);
    const blockedCommands = [...config.blockedCommands, ...config.gitAliases];

    const gitGh = detectGitOrGh(command, blockedCommands);

    if (gitGh) {
      return {
        decision: "deny",
        command: gitGh.segment,
        reason:
          `cette commande invoque \`${gitGh.binary}\` (\`${gitGh.segment}\`). ` +
          "`ai-learn guard` bloque toute commande git/gh, lecture incluse : demande à l'apprenant " +
          "de lancer la commande lui-même et de te rapporter ce qu'il voit (cf. AGENTS.md §4 « Reality checks »).",
      };
    }

    for (const target of shellWriteTargets(command)) {
      const rel = toRelative(root, target);

      if (rel && isProtectedPath(rel)) {
        return {
          decision: "deny",
          reason: protectedPathReason(rel, true),
          path: rel,
        };
      }

      if (rel && matchesGuardPath(rel, config)) {
        return {
          decision: "deny",
          reason: learnerDenialReason({
            mode: config.mode,
            rel,
            learnerFiles: config.learnerFiles,
            implementationFiles: config.implementationFiles,
            viaShell: true,
          }),
          path: rel,
        };
      }
    }

    return { decision: "allow", reason: "no learner write target detected" };
  }

  if (!WRITE_TOOLS.has(toolName)) {
    return { decision: "allow", reason: `tool ${toolName || "?"} is not a write tool` };
  }

  const config = loadGuardConfig(root);
  const filePath = targetPath(toolInput);
  const rel = filePath ? toRelative(root, filePath) : null;

  if (rel && isProtectedPath(rel)) {
    return {
      decision: "deny",
      reason: protectedPathReason(rel, false),
      path: rel,
    };
  }

  if (rel && matchesGuardPath(rel, config)) {
    return {
      decision: "deny",
      reason: learnerDenialReason({
        mode: config.mode,
        rel,
        learnerFiles: config.learnerFiles,
        implementationFiles: config.implementationFiles,
        viaShell: false,
      }),
      path: rel,
    };
  }

  return { decision: "allow", reason: "not a learner file" };
}

// One JSONL line per denial, read back by `ai-learn check` so the block is not
// just enforced but visible. Never throws (a full disk must not turn a deny into
// a crash), never delays the decision, bounded to a diagnostic tail.
function recordDenial({ root, hook, result }) {
  try {
    const logPath = path.join(root, ".ai-learn", "guard.log");
    fs.mkdirSync(path.dirname(logPath), { recursive: true });

    if (fs.existsSync(logPath) && fs.statSync(logPath).size > DENIAL_LOG_MAX_BYTES) {
      const kept = fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean).slice(-200);
      fs.writeFileSync(logPath, kept.length ? `${kept.join("\n")}\n` : "");
    }

    const input = (hook && hook.tool_input) || {};
    const target = result.path || input.file_path || input.notebook_path || null;

    fs.appendFileSync(
      logPath,
      `${JSON.stringify({
        at: new Date().toISOString(),
        tool: (hook && hook.tool_name) || null,
        path: target ? normalizePortable(path.isAbsolute(target) ? path.relative(root, target) : target) : null,
        command: result.command || null,
        reason: result.reason,
      })}\n`,
    );
  } catch {
    // a denial log is never worth failing a denial over
  }
}

// The hook's `cwd` is the session's directory, not necessarily the project
// root: after a `cd src` it is `<project>/src`, where no `.ai-learn/guard.json`
// exists and the guard would resolve to the `apprenti` defaults with every
// path outside `src/` dropped by `toRelative` (a bypass of the `dirigeant`
// wall and of the policy self-protection). Walk up to the OUTERMOST directory
// holding the guard config, never the nearest: in `dirigeant` the AI may write
// `src/**`, so it could plant `src/.ai-learn/guard.json` (mode `apprenti`) and
// make that fake file the root. Fall back to `start` when there is none.
function findProjectRoot(start) {
  let dir = path.resolve(start);
  let found = null;

  for (;;) {
    try {
      if (fs.existsSync(path.join(dir, ".ai-learn", "guard.json"))) {
        found = dir;
      }
    } catch {
      return found || start;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return found || start;
    }
    dir = parent;
  }
}

// The hook entry point. Root comes from the hook's `cwd` when present — the
// project where Claude Code runs — otherwise the process cwd. Any error inside
// the guard itself is a fail-open allow: a broken guard must not break a session.
function guardCommand({ inputFile = null } = {}) {
  let hook = null;
  let root = process.cwd();

  const raw = readHookInput({ inputFile });
  hook = parseHookInput(raw);

  if (hook && typeof hook.cwd === "string" && hook.cwd) {
    root = findProjectRoot(hook.cwd);
  }

  let result;

  try {
    result = decide(hook, root);
  } catch {
    result = { decision: "allow", reason: "guard error — fail open" };
  }

  if (result.decision === "deny") {
    process.stdout.write(
      `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: result.reason,
        },
        systemMessage: result.reason,
      })}\n`,
    );
    process.stderr.write(`ai-learn guard: ${result.reason}\n`);
    recordDenial({ root, hook, result });
    process.exit(2);
  }

  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" },
      reason: result.reason,
    })}\n`,
  );
}

// --- wiring (used by `init` and `update`, not the hot path) -----------------

// The generated README describes the mode's property. It is refreshed on
// `update` (title marker), so a project that switches mode gets prose matching
// its guard — leaving the apprenti text in a dirigeant project would document
// the exact opposite of what the hook enforces.
const SOLUTIONS_README_TITLE = "# Solutions de référence";

function renderSolutionsReadme(mode) {
  if (mode === MODE_DIRIGEANT) {
    return `${SOLUTIONS_README_TITLE} — ce que l'IA écrit, ce que l'apprenant garde

En mode **dirigeant**, la propriété est inversée : **l'apprenant garde la
spécification** (\`test/**\`, \`checkpoint/**\`) et **l'IA écrit l'implémentation**
(\`src/**\`). Le hook PreToolUse \`ai-learn guard\` refuse mécaniquement toute
écriture de l'IA dans les fichiers de spécification (\`test/**\`, \`tests/**\`,
\`__tests__/**\`, \`checkpoint/**\` et les fichiers test/spec reconnus — cette
liste est **dérivée du mode**, le champ \`learnerFiles\` de
\`.ai-learn/guard.json\` est ignoré en dirigeant). Si ton code vit hors de
\`src/**\`, déclare son périmètre dans \`implementationFiles\`.

Ce dossier reste la référence de révélation : l'IA y dépose le code qu'elle a
écrit, expliqué brique par brique, pour que l'apprenant puisse **juger** le diff
plutôt que le taper.

- **L'IA écrit** : \`src/**\` (l'implémentation), ce dossier, \`docs/\`, la config
  de support (tsconfig, package.json, docker-compose.yml, migrations, scripts).
- **L'apprenant écrit seul** : \`test/**\` et \`checkpoint/**\` — la spécification
  que l'IA ne peut pas réécrire pour faire passer son code.
- **La référence reste non-collable** : \`docs/solutions/<brique>.md\` est écrit
  **avec des trous** à compléter (\`[...]\`, lignes incomplètes, commentaires à
  finir). L'apprenant la lit pour juger, pas pour recopier.
- **Debug** : l'apprenant lit le test rouge, le checkpoint qui échoue, la stack
  trace et décide de la correction attendue ; l'IA implémente dans \`src/**\`.
- **Échappatoire visible** : si l'apprenant est vraiment coincé, noter
  \`Corrigé par : IA\` dans le journal — une exception enregistrée que
  \`ai-learn check\` signale, jamais un saut silencieux.
`;
  }

  return `${SOLUTIONS_README_TITLE} — où l'IA dépose le code, jamais dans \`src/\`

Dans ce parcours, **l'apprenant tape tout le code de son projet** (\`src/**\`). L'IA
en est mécaniquement empêchée : le hook PreToolUse \`ai-learn guard\` refuse toute
écriture de l'IA dans ces fichiers (liste configurable dans \`.ai-learn/guard.json\`).

À la place, le code de révélation de chaque brique est déposé ici, dans
\`docs/solutions/<brique>.md\` — la référence que l'apprenant lit puis **retape**
dans son éditeur.

- **L'IA écrit** : ce dossier, \`docs/\`, \`checkpoint/\`, la config de support
  (tsconfig, package.json, docker-compose.yml, migrations, scripts).
- **L'apprenant écrit seul** : \`src/**\` (et tout chemin listé dans
  \`.ai-learn/guard.json\` → \`learnerFiles\`).
- **La référence est non-collable** : \`docs/solutions/<brique>.md\` est écrit
  **avec des trous** à compléter (\`[...]\`, lignes incomplètes, commentaires à
  finir). Un Cmd+A aveugle produit un code qui échoue au checkpoint — l'apprenant
  doit retaper et compléter pour que ça passe. C'est le second garde-fou, après
  le guard : le guard prouve « pas l'IA », les trous forcent « l'apprenant a
  refait ».
- **Debug** : mené par l'apprenant — test rouge, checkpoint qui échoue, stack
  trace → l'apprenant lit, diagnostique, corrige. L'IA guide, ne touche pas aux
  fichiers.
- **Échappatoire visible** : si l'apprenant est vraiment coincé, noter
  \`Corrigé par : IA\` dans le journal — une exception enregistrée que
  \`ai-learn check\` signale, jamais un saut silencieux.
`;
}

// Wire the guard into a learning project: write the learner-file policy, the
// solutions directory, and merge the PreToolUse hook into `.claude/settings.json`
// without clobbering any existing hooks. Non-destructive and idempotent.
//
// The solutions README is a *generated* file (recognized by its title marker):
// when it drifts from the current template it is refreshed so `ai-learn update`
// propagates protocol changes to installed projects — just like AGENTS.md. A
// README with a different title is treated as customized and never touched.
function ensureGuardHook(dir) {
  const created = [];
  const refreshed = [];
  const guardJsonPath = path.join(dir, ".ai-learn", "guard.json");
  const solutionsReadme = path.join(dir, "docs", "solutions", "README.md");
  const settingsPath = path.join(dir, ".claude", "settings.json");

  if (!fs.existsSync(guardJsonPath)) {
    fs.mkdirSync(path.dirname(guardJsonPath), { recursive: true });
    fs.writeFileSync(
      guardJsonPath,
      `${JSON.stringify(
        {
          version: 1,
          mode: MODE_APPRENTI,
          learnerFiles: DEFAULT_LEARNER_FILES,
          blockedCommands: DEFAULT_BLOCKED_COMMANDS,
          gitAliases: [],
        },
        null,
        2,
      )}\n`,
    );
    created.push(normalizePortable(path.relative(dir, guardJsonPath)));
  }

  const config = loadGuardConfig(dir);
  // Codex keys are literal paths. In `dirigeant`, add existing nested test
  // directories (`src/test`, `src/__tests__`, …) that the glob list cannot
  // express; new directories and colocated tests remain a documented limit.
  const extraCodexPaths = config.mode === MODE_DIRIGEANT ? findLiteralTestDirs(dir) : [];
  const codexResult = ensureCodexGuard(dir, config.learnerFiles, extraCodexPaths);
  created.push(...codexResult.created);
  refreshed.push(...codexResult.refreshed);

  // guard.json is learner-customizable (learnerFiles) — never overwritten here.
  // The solutions README is pure generated content (its title is the marker),
  // and its body follows the mode: switching to dirigeant must flip the prose.
  const readmeText = fs.existsSync(solutionsReadme) ? fs.readFileSync(solutionsReadme, "utf8") : null;
  const readme = renderSolutionsReadme(config.mode);
  const isGeneratedReadme = readmeText === null || readmeText.trimStart().startsWith(SOLUTIONS_README_TITLE);

  if (isGeneratedReadme && readmeText !== readme) {
    fs.mkdirSync(path.dirname(solutionsReadme), { recursive: true });
    fs.writeFileSync(solutionsReadme, readme);
    const rel = normalizePortable(path.relative(dir, solutionsReadme));
    (readmeText === null ? created : refreshed).push(rel);
  }

  const toolBin = path.join(__dirname, "..", "ai-learn.js");
  const command = `node ${toolBin} guard`;
  const matcher = "Write|Edit|MultiEdit|NotebookEdit|Bash";

  let settings = null;

  try {
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    }
  } catch {
    settings = null; // corrupt settings — start fresh rather than failing the project
  }

  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    settings = {};
  }

  const preToolUse = (settings.hooks && Array.isArray(settings.hooks.PreToolUse) && settings.hooks.PreToolUse) || [];
  const alreadyWired = preToolUse.some(
    (entry) =>
      entry &&
      Array.isArray(entry.hooks) &&
      entry.hooks.some((h) => h && typeof h.command === "string" && h.command.includes("ai-learn.js guard")),
  );

  if (!alreadyWired) {
    settings.hooks = settings.hooks || {};
    settings.hooks.PreToolUse = [...preToolUse, { matcher, hooks: [{ type: "command", command, timeout: 60 }] }];
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
    created.push(normalizePortable(path.relative(dir, settingsPath)));
  }

  return { created, refreshed, wired: alreadyWired, codex: codexResult };
}

// Codex CLI's mechanical guard: a `.codex/config.toml` permissions profile
// (see platforms/codex-guard.js). Generated content is recognized by its
// marker comment, exactly like the solutions README and AGENTS.md — refreshed
// when it drifts from the current template, never touched if the learner (or
// a pre-existing project) wrote their own `.codex/config.toml` without it.
function ensureCodexGuard(dir, learnerFiles, extraLiteralPaths = []) {
  const configPath = path.join(dir, ".codex", "config.toml");
  const content = renderCodexConfig(learnerFiles, extraLiteralPaths);
  const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : null;
  const isGenerated = existing === null || existing.startsWith(CODEX_MARKER);

  if (!isGenerated) {
    return { created: [], refreshed: [], skipped: true };
  }

  if (existing === content) {
    return { created: [], refreshed: [], skipped: false };
  }

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, content);
  const rel = normalizePortable(path.relative(dir, configPath));

  return existing === null ? { created: [rel], refreshed: [], skipped: false } : { created: [], refreshed: [rel], skipped: false };
}

module.exports = {
  guardCommand,
  ensureGuardHook,
  ensureCodexGuard,
  decide,
  loadGuardConfig,
  validateGuardConfig,
  guardConfigIssues,
  matchesLearnerPath,
  isProtectedPath,
  shellWriteTargets,
  detectGitOrGh,
  splitSegments,
  toRelative,
  findProjectRoot,
  DEFAULT_BLOCKED_COMMANDS,
};
