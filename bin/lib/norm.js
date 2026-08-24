"use strict";

// `ai-learn norm` — a mechanical, heuristic, zero-dependency clean-code
// checker. Inspired by École 42's Norminette (and rejected as a hosted
// service, see docs/plans for that decision) but scoped to what a
// zero-dependency, language-agnostic CLI can measure without a real
// parser: file length, function length, nesting depth, parameter count.
//
// Like every heuristic in this codebase (scan.js's concept markers,
// mandatoryAt), a false negative (a violation that slips through) is always
// preferable to a false positive — this mechanism HARD BLOCKS `verify`/
// `check`, so an over-eager detector would punish correct code. Ambiguous
// cases resolve toward not flagging (see detectFunctionsBrace's `balanced`
// flag and analyzeFile's skip-on-unbalanced behavior).

const fs = require("fs");
const path = require("path");
const { log, readJson, writeJson } = require("./util");
const { walkSources, detectStack, detectTests, loadStack, stackKey, ALL_SOURCE_EXTS } = require("./scan");
const { loadGuardConfig, matchesLearnerPath } = require("./guard");

const FALLBACK_NORM = { maxFileLines: 400, maxFunctionLines: 50, maxNestingDepth: 4, maxParams: 5 };

// ---------------------------------------------------------------------------
// Source cleaning — blank out string/comment interiors so brace/paren
// scanning never trips on a `{` inside a string literal or a comment. Same
// length as the input (newlines preserved) so line numbers stay aligned.
// ---------------------------------------------------------------------------

function stripStringsAndComments(source) {
  let out = "";
  let i = 0;
  const n = source.length;

  while (i < n) {
    const c = source[i];
    const c2 = source[i + 1];

    if (c === "/" && c2 === "/") {
      while (i < n && source[i] !== "\n") {
        out += " ";
        i += 1;
      }
      continue;
    }

    if (c === "/" && c2 === "*") {
      out += "  ";
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        out += source[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      if (i < n) {
        out += "  ";
        i += 2;
      }
      continue;
    }

    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += " ";
      i += 1;
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\" && i + 1 < n) {
          out += source[i] === "\n" ? "\n" : " ";
          out += source[i + 1] === "\n" ? "\n" : " ";
          i += 2;
          continue;
        }
        out += source[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      if (i < n) {
        out += " ";
        i += 1;
      }
      continue;
    }

    out += c;
    i += 1;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Function-boundary detection — brace strategy (C, C++, JS/TS, and the
// universal fallback for any other brace-delimited language).
// ---------------------------------------------------------------------------

const CONTROL_KEYWORDS = new Set(["if", "else", "for", "while", "switch", "catch", "try", "finally", "do"]);
const TYPE_KEYWORDS = new Set(["class", "struct", "enum", "interface", "namespace", "impl", "trait", "union", "module"]);
const MODIFIER_PREFIX_RE = /^(export|default|public|private|protected|static|abstract|final|readonly|virtual|override|async)\s+/;
const RESERVED_CALL_LIKE = new Set([
  "return", "new", "typeof", "delete", "instanceof", "sizeof", "yield", "in", "of", "await", "throw",
]);

function firstToken(stmt) {
  let s = stmt;
  let guard = 0;

  while (guard < 6) {
    const m = MODIFIER_PREFIX_RE.exec(s);
    if (!m) break;
    s = s.slice(m[0].length);
    guard += 1;
  }

  const m2 = /^([A-Za-z_$][\w$]*)/.exec(s);
  return m2 ? m2[1] : null;
}

// Finds the last balanced `(...)` group anchored at the very end of `text`
// (after trimming trailing whitespace). Returns null if `text` doesn't end
// with `)` or the parens never balance.
function trailingParenContent(text) {
  const t = text.trimEnd();
  if (!t.endsWith(")")) return null;

  let depth = 0;
  for (let i = t.length - 1; i >= 0; i--) {
    if (t[i] === ")") {
      depth += 1;
    } else if (t[i] === "(") {
      depth -= 1;
      if (depth === 0) {
        return { params: t.slice(i + 1, t.length - 1), before: t.slice(0, i).trimEnd() };
      }
    }
  }
  return null;
}

// A typed return annotation (`: Type` or Rust/C++-style `-> Type`) sits
// between the signature's closing paren and the `{`/`=>`, which would
// otherwise break the "ends with )" assumption trailingParenContent relies
// on — and TypeScript's javascript.js pack makes this the common case, not
// an edge case. Conservative charset: bails out (returns the input
// unchanged) rather than risk eating something that isn't actually a type.
function stripTrailingReturnType(stmt) {
  const m = /^(.*\))\s*(?::|->)\s*[\w$.<>[\],\s|&*]+$/s.exec(stmt);
  return m ? m[1] : stmt;
}

// A generic parameter list (`<T>`, `<K, V>`) directly before the signature's
// `(` breaks plain identifier extraction the same way. Bails out (leaves
// `text` untouched) on the first character that isn't plausibly part of a
// generic parameter list, so a stray `>=`/`=>` is never misread as a closer.
function stripTrailingGenerics(text) {
  const t = text.trimEnd();
  if (!t.endsWith(">")) return t;

  let depth = 0;
  for (let i = t.length - 1; i >= 0; i--) {
    const ch = t[i];
    if (ch === ">") {
      depth += 1;
    } else if (ch === "<") {
      depth -= 1;
      if (depth === 0) return t.slice(0, i).trimEnd();
    } else if (!/[\w\s,.$[\]]/.test(ch)) {
      return t;
    }
  }
  return t;
}

function findTrailingCall(stmt) {
  const trailing = trailingParenContent(stripTrailingReturnType(stmt));
  if (!trailing) return null;

  const before = stripTrailingGenerics(trailing.before);
  const idMatch = /([A-Za-z_$][\w$]*)$/.exec(before);
  if (!idMatch || RESERVED_CALL_LIKE.has(idMatch[1])) return null;

  return { name: idMatch[1], params: trailing.params };
}

// Classifies the statement text immediately preceding a `{` — the core of
// the brace strategy. Every branch is a deliberate under-detection choice:
// unrecognized shapes fall through to "other" rather than being guessed as
// a function (see the module header on false-negative-over-false-positive).
function classifyStatement(stmtRaw) {
  const stmt = stmtRaw.trim();
  if (!stmt) return { kind: "other", name: null, params: null };

  if (stmt.endsWith("=>")) {
    const beforeArrow = stripTrailingReturnType(stmt.slice(0, -2).trimEnd());
    const trailing = trailingParenContent(beforeArrow);
    let params = "";

    if (trailing) {
      params = trailing.params;
    } else {
      const idMatch = /([A-Za-z_$][\w$]*)$/.exec(beforeArrow);
      if (idMatch) params = idMatch[1];
    }

    const nameMatch = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(stmt);
    return { kind: "function", name: nameMatch ? nameMatch[1] : null, params };
  }

  const tok = firstToken(stmt);
  if (tok && CONTROL_KEYWORDS.has(tok)) return { kind: "control", name: null, params: null };
  if (tok && TYPE_KEYWORDS.has(tok)) return { kind: "type", name: null, params: null };

  const call = findTrailingCall(stmt);
  if (call) return { kind: "function", name: call.name, params: call.params };

  return { kind: "other", name: null, params: null };
}

function paramCountFromText(paramsText) {
  const trimmed = (paramsText || "").trim();
  if (trimmed === "" || trimmed === "void") return 0;
  return splitTopLevelParams(trimmed).length;
}

function detectFunctionsBrace(source) {
  const clean = stripStringsAndComments(source);
  const functions = [];
  const stack = [];
  const activeFunctions = [];
  let line = 1;
  let stmtStart = 0;
  // A destructured param (`{ a, b }`) or an inline object type
  // (`{ a: number }`) inside a signature's parens contains its own `{`/`}`
  // pair — without this, that inner brace would be mistaken for the
  // function's own body opening and the real signature text would be lost.
  // Only brace-delimited blocks at paren depth 0 are real statement/frame
  // boundaries.
  let parenDepth = 0;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];

    if (ch === "\n") {
      line += 1;
      continue;
    }

    if (ch === "(") {
      parenDepth += 1;
      continue;
    }
    if (ch === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }

    if (ch === "{" && parenDepth === 0) {
      const stmtText = clean.slice(stmtStart, i);
      const { kind, name, params } = classifyStatement(stmtText);
      const frame = { kind, name, params, startLine: line, curNesting: 0, maxNesting: 0 };

      if (kind === "function") {
        if (activeFunctions.length > 0) {
          const parent = activeFunctions[activeFunctions.length - 1];
          parent.curNesting += 1;
          parent.maxNesting = Math.max(parent.maxNesting, parent.curNesting);
        }
        activeFunctions.push(frame);
      } else if (activeFunctions.length > 0) {
        const parent = activeFunctions[activeFunctions.length - 1];
        parent.curNesting += 1;
        parent.maxNesting = Math.max(parent.maxNesting, parent.curNesting);
      }

      stack.push(frame);
      stmtStart = i + 1;
    } else if (ch === "}" && parenDepth === 0) {
      const frame = stack.pop();
      stmtStart = i + 1;
      if (!frame) continue;

      if (frame.kind === "function") {
        activeFunctions.pop();
        functions.push({
          name: frame.name,
          startLine: frame.startLine,
          endLine: line,
          lengthLines: line - frame.startLine + 1,
          maxNestingDepth: frame.maxNesting,
          paramCount: paramCountFromText(frame.params),
        });
        if (activeFunctions.length > 0) {
          activeFunctions[activeFunctions.length - 1].curNesting -= 1;
        }
      } else if (activeFunctions.length > 0) {
        activeFunctions[activeFunctions.length - 1].curNesting -= 1;
      }
    } else if (ch === ";") {
      stmtStart = i + 1;
    }
  }

  return { functions, balanced: stack.length === 0 };
}

// ---------------------------------------------------------------------------
// Function-boundary detection — indentation strategy (Python).
// ---------------------------------------------------------------------------

function expandIndent(line) {
  let n = 0;
  for (const ch of line) {
    if (ch === " ") n += 1;
    else if (ch === "\t") n += 8 - (n % 8);
    else break;
  }
  return n;
}

const PY_DEF_START_RE = /^([ \t]*)(?:async\s+def|def)\s+([A-Za-z_]\w*)\s*\(/;

function detectFunctionsPython(source) {
  const lines = source.split("\n");
  const functions = [];

  for (let i = 0; i < lines.length; i++) {
    const m = PY_DEF_START_RE.exec(lines[i]);
    if (!m) continue;

    const defIndent = expandIndent(lines[i]);
    let sigText = lines[i];
    let depth = 0;
    for (const ch of lines[i]) {
      if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
    }

    let j = i;
    while (depth > 0 && j + 1 < lines.length) {
      j += 1;
      sigText += `\n${lines[j]}`;
      for (const ch of lines[j]) {
        if (ch === "(") depth += 1;
        else if (ch === ")") depth -= 1;
      }
    }

    const paramsMatch = /\(([\s\S]*)\)\s*(?:->[\s\S]*)?:\s*$/.exec(sigText.trim());
    let paramCount = 0;
    if (paramsMatch) {
      paramCount = splitTopLevelParams(paramsMatch[1]).filter(
        (p) => p !== "self" && p !== "cls" && !/^(self|cls)\s*:/.test(p),
      ).length;
    }

    let bodyEnd = j;
    let indentUnit = null;
    let maxIndent = defIndent;

    for (let k = j + 1; k < lines.length; k++) {
      const line = lines[k];
      if (line.trim() === "") {
        bodyEnd = k;
        continue;
      }
      const indent = expandIndent(line);
      if (indent <= defIndent) break;
      if (indentUnit === null) indentUnit = indent - defIndent;
      maxIndent = Math.max(maxIndent, indent);
      bodyEnd = k;
    }

    const unit = indentUnit || 4;
    const maxNestingDepth = Math.max(0, Math.round((maxIndent - defIndent) / unit) - 1);

    functions.push({
      name: m[2],
      startLine: i + 1,
      endLine: bodyEnd + 1,
      lengthLines: bodyEnd - i + 1,
      maxNestingDepth,
      paramCount,
    });
  }

  return { functions, balanced: true };
}

function detectFunctions(source, language) {
  if (language === "Python") return detectFunctionsPython(source);
  return detectFunctionsBrace(source);
}

// Depth-aware split on top-level commas — shared by both strategies so a
// function-pointer param (C) or a destructured param (JS) with its own
// internal commas is never wrongly split.
function splitTopLevelParams(text) {
  const parts = [];
  let depth = 0;
  let current = "";
  let inString = null;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      current += ch;
      if (ch === "\\" && i + 1 < text.length) {
        current += text[i + 1];
        i += 1;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth += 1;
      current += ch;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth -= 1;
      current += ch;
      continue;
    }
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }

  if (current.trim() !== "") parts.push(current.trim());
  return parts.filter((p) => p !== "");
}

// ---------------------------------------------------------------------------
// Per-file analysis + violation formatting.
// ---------------------------------------------------------------------------

function formatViolation(v) {
  return `${v.file}:${v.line} — ${v.message} [${v.rule}]`;
}

function analyzeFile(file, thresholds, language) {
  const violations = [];
  let source;

  try {
    source = fs.readFileSync(file.abs, "utf8");
  } catch {
    return { violations, skipped: true, skipReason: "unreadable" };
  }

  if (file.loc > thresholds.maxFileLines) {
    violations.push({
      rule: "file-length",
      file: file.rel,
      line: 1,
      function: null,
      actual: file.loc,
      threshold: thresholds.maxFileLines,
      message: `file is ${file.loc} lines (max ${thresholds.maxFileLines})`,
    });
  }

  const detection = detectFunctions(source, language);

  if (!detection.balanced) {
    return { violations, skipped: true, skipReason: "unbalanced braces" };
  }

  for (const fn of detection.functions) {
    const label = fn.name ? `\`${fn.name}\`` : "(anonymous)";

    if (fn.lengthLines > thresholds.maxFunctionLines) {
      violations.push({
        rule: "function-length",
        file: file.rel,
        line: fn.startLine,
        function: fn.name,
        actual: fn.lengthLines,
        threshold: thresholds.maxFunctionLines,
        message: `function ${label} is ${fn.lengthLines} lines (max ${thresholds.maxFunctionLines})`,
      });
    }

    if (fn.maxNestingDepth > thresholds.maxNestingDepth) {
      violations.push({
        rule: "nesting-depth",
        file: file.rel,
        line: fn.startLine,
        function: fn.name,
        actual: fn.maxNestingDepth,
        threshold: thresholds.maxNestingDepth,
        message: `function ${label} nests ${fn.maxNestingDepth} levels deep (max ${thresholds.maxNestingDepth})`,
      });
    }

    if (fn.paramCount != null && fn.paramCount > thresholds.maxParams) {
      violations.push({
        rule: "param-count",
        file: file.rel,
        line: fn.startLine,
        function: fn.name,
        actual: fn.paramCount,
        threshold: thresholds.maxParams,
        message: `function ${label} takes ${fn.paramCount} params (max ${thresholds.maxParams})`,
      });
    }
  }

  return { violations, skipped: false, skipReason: null };
}

// ---------------------------------------------------------------------------
// Project-level config — `.ai-learn/norm.json`, same fallback-merge
// philosophy as guard.json (per-field defaulting, created once, never
// clobbered — see ensureNormConfig).
// ---------------------------------------------------------------------------

function normConfigPath(dir) {
  return path.join(dir, ".ai-learn", "norm.json");
}

function loadNormConfig(dir) {
  const config = readJson(normConfigPath(dir), null);

  return {
    thresholds: {
      maxFileLines: config && Number.isFinite(config.maxFileLines) ? config.maxFileLines : null,
      maxFunctionLines: config && Number.isFinite(config.maxFunctionLines) ? config.maxFunctionLines : null,
      maxNestingDepth: config && Number.isFinite(config.maxNestingDepth) ? config.maxNestingDepth : null,
      maxParams: config && Number.isFinite(config.maxParams) ? config.maxParams : null,
    },
    ignore: config && Array.isArray(config.ignore) ? config.ignore : [],
    includeTests: config && typeof config.includeTests === "boolean" ? config.includeTests : false,
  };
}

function resolveThresholds(dir, language) {
  const stack = loadStack(stackKey(language));
  const stackDefaults = stack.norm || FALLBACK_NORM;
  const { thresholds: overrides } = loadNormConfig(dir);

  return {
    maxFileLines: overrides.maxFileLines ?? stackDefaults.maxFileLines ?? FALLBACK_NORM.maxFileLines,
    maxFunctionLines: overrides.maxFunctionLines ?? stackDefaults.maxFunctionLines ?? FALLBACK_NORM.maxFunctionLines,
    maxNestingDepth: overrides.maxNestingDepth ?? stackDefaults.maxNestingDepth ?? FALLBACK_NORM.maxNestingDepth,
    maxParams: overrides.maxParams ?? stackDefaults.maxParams ?? FALLBACK_NORM.maxParams,
  };
}

// Auto-created once by init/update, mirroring ensureGuardHook's guard.json
// creation exactly: concrete resolved numbers written so the file is
// immediately discoverable/editable, never rewritten once present.
function ensureNormConfig(dir, language) {
  const configPath = normConfigPath(dir);
  if (fs.existsSync(configPath)) return { created: false };

  const stack = loadStack(stackKey(language));
  const thresholds = stack.norm || FALLBACK_NORM;

  writeJson(configPath, {
    version: 1,
    maxFileLines: thresholds.maxFileLines,
    maxFunctionLines: thresholds.maxFunctionLines,
    maxNestingDepth: thresholds.maxNestingDepth,
    maxParams: thresholds.maxParams,
    ignore: [],
    includeTests: false,
  });

  return { created: true };
}

// ---------------------------------------------------------------------------
// Project scan — scoped to the learner's own files (same `learnerFiles`
// glob the guard uses), test files excluded by default (setup-heavy test
// code produces noisy false positives on these metrics).
// ---------------------------------------------------------------------------

function normProject(dir) {
  const walked = walkSources(dir);
  const stack = detectStack(dir, walked.files);
  const tests = detectTests(walked.files);
  const testRels = new Set(tests.files.map((f) => f.rel));
  const { learnerFiles } = loadGuardConfig(dir);
  const { ignore, includeTests } = loadNormConfig(dir);
  const thresholds = resolveThresholds(dir, stack.language);

  const candidates = walked.files.filter((f) => {
    if (f.binary) return false;
    if (!ALL_SOURCE_EXTS.has(f.ext)) return false;
    if (!matchesLearnerPath(f.rel, learnerFiles)) return false;
    if (ignore.length > 0 && matchesLearnerPath(f.rel, ignore)) return false;
    if (!includeTests && testRels.has(f.rel)) return false;
    return true;
  });

  const violations = [];
  const skippedFunctionParse = [];

  for (const file of candidates) {
    const result = analyzeFile(file, thresholds, stack.language);
    violations.push(...result.violations);
    if (result.skipped) {
      skippedFunctionParse.push({ file: file.rel, reason: result.skipReason });
    }
  }

  return { scanned: candidates.length, violations, skippedFunctionParse, thresholds, ignored: ignore };
}

// ---------------------------------------------------------------------------
// Standalone CLI: `ai-learn norm [--dir <dir>]` — read-only, fast local
// feedback loop, mirrors `ai-learn traps`.
// ---------------------------------------------------------------------------

function normCommand({ dir }) {
  const report = normProject(dir);

  log(`Checked ${report.scanned} file(s) against the clean-code norm:`);

  if (report.violations.length === 0) {
    log("  ✓ no violation");
  } else {
    for (const v of report.violations) {
      log(`  ✗ ${formatViolation(v)}`);
    }
  }

  for (const skip of report.skippedFunctionParse) {
    log(`  ⚠ ${skip.file}: function-level checks skipped (${skip.reason}) — file-length check still ran`);
  }

  process.exitCode = report.violations.length > 0 ? 1 : 0;
}

module.exports = {
  normProject,
  normCommand,
  analyzeFile,
  detectFunctions,
  detectFunctionsBrace,
  detectFunctionsPython,
  splitTopLevelParams,
  loadNormConfig,
  resolveThresholds,
  formatViolation,
  ensureNormConfig,
  FALLBACK_NORM,
};
