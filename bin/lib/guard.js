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
const { renderConfig: renderCodexConfig, MARKER: CODEX_MARKER } = require("./platforms/codex-guard");

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const DEFAULT_LEARNER_FILES = ["src/**"];
const DENIAL_LOG_MAX_BYTES = 256 * 1024;

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
// (`{ version: 1, learnerFiles: ["src/**"] }`). Missing or corrupt config falls
// back to the default — a project that never ran `init`/`update` is still guarded
// against writing into `src/`.
function loadGuardConfig(root) {
  const defaults = { learnerFiles: DEFAULT_LEARNER_FILES };
  const configFile = path.join(root, ".ai-learn", "guard.json");

  let config = null;
  try {
    if (fs.existsSync(configFile)) {
      config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    }
  } catch {
    config = null;
  }

  return {
    learnerFiles:
      config && Array.isArray(config.learnerFiles) && config.learnerFiles.length > 0
        ? config.learnerFiles
        : defaults.learnerFiles,
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

function matchesLearnerPath(relative, learnerFiles) {
  for (const pattern of learnerFiles || []) {
    if (globToRegExp(pattern).test(relative)) {
      return true;
    }
  }
  return false;
}

function toRelative(root, filePath) {
  if (!filePath) {
    return null;
  }
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);
  const rel = normalizePortable(path.relative(root, abs));
  return rel.startsWith("../") ? null : rel;
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
function shellWriteTargets(command) {
  const targets = [];
  const tokens = command.split(/\s+/);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Redirection (`> file`, `>> file`, `2> file`, `&> file`) — the next token
    // is the destination. Also catches an inline `echo hi>src/x.ts`.
    if (token.includes(">")) {
      const parts = token.split(">");
      const dest = stripQuotes(parts[parts.length - 1]);

      if (dest && !dest.startsWith("/dev/") && !dest.startsWith("$") && !dest.startsWith("<")) {
        targets.push(dest);
      }

      const next = tokens[i + 1];

      if (next && !next.startsWith("-") && !next.startsWith("(")) {
        targets.push(stripQuotes(next));
      }
      continue;
    }

    // tee <file>
    if (token === "tee") {
      const next = tokens[i + 1];

      if (next && !next.startsWith("-")) {
        targets.push(stripQuotes(next));
      }
      continue;
    }

    // cp|mv|ln|install — the last non-flag argument is the destination.
    if (["cp", "mv", "ln", "install"].includes(token)) {
      let destination = null;

      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].startsWith("-")) {
          continue;
        }
        destination = stripQuotes(tokens[j]);
      }

      if (destination) {
        targets.push(destination);
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
        if (t.startsWith("-i")) {
          inPlace = true;
          continue;
        }
        if (inPlace && !t.startsWith("-")) {
          targets.push(stripQuotes(t));
        }
      }
      continue;
    }
  }

  targets.push(...execOneLinerWrites(command, tokens));
  return targets.filter(Boolean);
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

    for (const target of shellWriteTargets(command)) {
      const rel = toRelative(root, target);

      if (rel && matchesLearnerPath(rel, config.learnerFiles)) {
        return {
          decision: "deny",
          reason:
            `cette commande écrit dans ${rel}, un fichier solution de l'apprenant ` +
            `(${config.learnerFiles.join(", ")}). \`ai-learn guard\` refuse l'écriture de l'IA ici : ` +
            "l'apprenant tape ce code (cf. AGENTS.md §3).",
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

  if (rel && matchesLearnerPath(rel, config.learnerFiles)) {
    return {
      decision: "deny",
      reason:
        `${rel} est un fichier solution de l'apprenant (${config.learnerFiles.join(", ")}). ` +
        "L'IA n'écrit pas ici : déposer le code de révélation dans `docs/solutions/`, " +
        "l'apprenant tape le vrai code (cf. AGENTS.md §3).",
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
        reason: result.reason,
      })}\n`,
    );
  } catch {
    // a denial log is never worth failing a denial over
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
    root = hook.cwd;
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

const SOLUTIONS_README = `# Solutions de référence — où l'IA dépose le code, jamais dans \`src/\`

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
    fs.writeFileSync(guardJsonPath, `${JSON.stringify({ version: 1, learnerFiles: DEFAULT_LEARNER_FILES }, null, 2)}\n`);
    created.push(normalizePortable(path.relative(dir, guardJsonPath)));
  }

  const learnerFiles = loadGuardConfig(dir).learnerFiles;
  const codexResult = ensureCodexGuard(dir, learnerFiles);
  created.push(...codexResult.created);

  // guard.json is learner-customizable (learnerFiles) — never overwritten here.
  // The solutions README is pure generated content (its title is the marker).
  const readmeText = fs.existsSync(solutionsReadme) ? fs.readFileSync(solutionsReadme, "utf8") : null;
  const isGeneratedReadme = readmeText === null || readmeText.trimStart().startsWith("# Solutions de référence");

  if (isGeneratedReadme && readmeText !== SOLUTIONS_README) {
    fs.mkdirSync(path.dirname(solutionsReadme), { recursive: true });
    fs.writeFileSync(solutionsReadme, SOLUTIONS_README);
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
function ensureCodexGuard(dir, learnerFiles) {
  const configPath = path.join(dir, ".codex", "config.toml");
  const content = renderCodexConfig(learnerFiles);
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
  matchesLearnerPath,
  shellWriteTargets,
  toRelative,
};
