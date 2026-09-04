"use strict";

// `ai-learn docs` — manage local documentation sources.
//
// Learning tracks need reference docs. Fetching them from the network in every
// session is fragile (bad connection, docs moved, upstream reorganized) and
// untraceable (which version did the plan cite?). This command brings docs into
// the project under `docs/sources/<name>/`, records their provenance in
// progress.json, and lets the learner choose online-only mode (URLs recorded,
// zero local files) when they do not want storage in the project.
//
// Sources are "snapshots": copying freezes them at a date, so a doc that
// drifted is a known drift, not a silent one. `docs update <name>` re-copies
// from the recorded origin to refresh.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { log, fail, mkdirp, writeJson, normalizePortable, spawnGit } = require("./util");
const { progressPath, readProgress } = require("./progress");

const MAX_SOURCES = 3;

// Quick shortcuts for the two external complements vetted for ai-learn. They are
// NOT a roadmap — the tool stays free; these are convenience entry points to
// resources that answer "what could deepen this". `clone` presets are regular
// git clones (the resource is small and useful as-is); `regen` presets are
// resources that are a data backend (or otherwise useless as a raw clone) — the
// AI must recreate the doc locally from the online origin, see `--regen` and the
// anti-hallucination rule enforced by `check`.
const SOURCE_PRESETS = {
  "build-your-own-x": {
    title: "Build your own X (codecrafters-io/build-your-own-x)",
    mode: "clone",
    source: "https://github.com/codecrafters-io/build-your-own-x",
  },
  "developer-roadmap": {
    title: "Developer Roadmap (kamranahmedse/developer-roadmap)",
    mode: "regen",
    source: "https://roadmap.sh/backend",
  },
  // Reference material for the git/gh module (see bin/lib/tracks/git.js,
  // templates/commit-msg): neither site is a git-clonable resource, so both
  // are `regen` presets, exactly like developer-roadmap above.
  "conventional-commits": {
    title: "Conventional Commits v1.0.0",
    mode: "regen",
    source: "https://www.conventionalcommits.org/en/v1.0.0/",
  },
  "gh-manual": {
    title: "GitHub CLI manual",
    mode: "regen",
    source: "https://cli.github.com/manual/",
  },
};

function sourcesDir(dir) {
  return path.join(dir, "docs", "sources");
}

function docSourceTarget(dir, name) {
  return path.join(sourcesDir(dir), name);
}

// Normalize a docSource into a list of { name, mode, path?, url?, src?, subpath? }.
// Handles the new `sources` array shape and the legacy single-source shape
// `{ type, value }` (written by older `init`). A missing `mode` is inferred
// from the fields — `path` means a local copy, otherwise remote.
function docSourceList(docSource) {
  if (!docSource) {
    return [];
  }

  if (Array.isArray(docSource.sources)) {
    return docSource.sources.map((source) => ({
      ...source,
      mode: source.mode || (source.path ? "local" : "remote"),
    }));
  }

  if (docSource.value) {
    return [
      {
        name: path.basename(docSource.value) || "source",
        mode: docSource.type === "remote" ? "remote" : "local",
        path: docSource.value,
        url: docSource.type === "remote" ? docSource.value : undefined,
      },
    ];
  }

  return [];
}

function findSource(config, name) {
  return docSourceList(config && config.docSource).find((source) => source.name === name) || null;
}

function assertName(name) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    fail(`invalid source name "${name}": use lowercase letters, digits and hyphens (ex. project-docs)`);
  }
}

// Derive a source name from a path or URL (project-main → project-main,
// https://github.com/org/project.git → project).
function deriveName(source) {
  const base = source.replace(/\/+$/, "").split(/[/:]/).pop();
  const clean = (base || "source")
    .replace(/\.git$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || "source";
}

// Prefer the `trash` CLI (recoverable from the system trash) when it exists;
// fall back to rmSync otherwise, so the tool stays portable.
function removePath(target) {
  const probe = spawnSync("trash", ["--version"], { encoding: "utf8" });

  if (probe.status === 0) {
    const res = spawnSync("trash", [target], { encoding: "utf8" });

    if (res.status === 0) {
      return;
    }
  }

  fs.rmSync(target, { recursive: true, force: true });
}

// Copy a directory tree, skipping the usual noise. `.git` keeps the snapshot
// from being a nested checkout; `node_modules` is deps, not docs.
function copyTree(src, dest) {
  mkdirp(dest);

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }

    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyTree(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

// Copy a local source directory (or one of its subdirectories via `subpath`)
// into the target, so `docs add x /repo --path docs` puts the contents of
// /repo/docs into docs/sources/x (not a nested `docs/docs`).
function copyFromSubdir(src, subpath, dest) {
  const base = subpath ? path.join(src, subpath) : src;

  if (!fs.existsSync(base)) {
    fail(`source "${src}"${subpath ? ` (--path "${subpath}")` : ""} does not exist`);
  }

  copyTree(base, dest);
}

function expandGitUrl(source) {
  if (/^(https?:\/\/|git@|file:\/\/)/.test(source)) {
    return source;
  }

  return `https://github.com/${source}`; // owner/repo shorthand
}

// A real local path wins over the owner/repo shorthand, so `docs add lib ./lib`
// copies the directory instead of trying to clone github.com/lib/lib.
function isGitUrl(source) {
  if (fs.existsSync(source)) {
    return false;
  }

  return /^(https?:\/\/|git@|file:\/\/)/.test(source) || /^[\w.-]+\/[\w.-]+$/.test(source);
}

// The sparse cone materializes the requested subpath AND the repo's root files
// (cone mode always includes `/*`). Move the subpath contents up so `--path`
// gives the same flat layout as a local copy — `docs/sources/x/<contents>`,
// never `docs/sources/x/docs/<contents>` — and drop the root artifacts.
function flattenSubpath(target, subpath) {
  const nested = path.join(target, subpath);

  if (!fs.existsSync(nested)) {
    return;
  }

  // 1. Drop cone-mode root artifacts (README, configs, `.github`…): the
  //    snapshot is the requested subpath only, not the repo root.
  const topDir = subpath.split(path.sep)[0];

  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === topDir) {
      continue;
    }
    removePath(path.join(target, entry.name));
  }

  // 2. Move the subpath contents up into the target root.
  for (const entry of fs.readdirSync(nested, { withFileTypes: true })) {
    if (entry.name === ".git") {
      continue;
    }
    fs.renameSync(path.join(nested, entry.name), path.join(target, entry.name));
  }

  // 3. Remove the now-empty subpath chain (docs/ → docs/reference/…).
  let current = nested;

  while (current !== target && fs.existsSync(current)) {
    fs.rmdirSync(current);
    current = path.dirname(current);
  }
}

// Clone a repo. With a `path` filter we use a sparse checkout so only that
// subdirectory is downloaded — cloning the whole repo just to grab docs/
// would pull megabytes of tests and deps the learner never opens.
function gitClone(url, target, pathFilter = null) {
  mkdirp(path.dirname(target));

  if (pathFilter) {
    const init = spawnGit(["init", target], { encoding: "utf8" });

    if (init.status !== 0) {
      fail(`git init failed for ${target}:\n${(init.stderr || "").slice(-500)}`);
    }

    const remote = spawnGit(["-C", target, "remote", "add", "origin", url], { encoding: "utf8" });
    const config = spawnGit(
      ["-C", target, "config", "extensions.partialClone", "origin"],
      { encoding: "utf8" },
    );
    const sparse = spawnGit(["-C", target, "sparse-checkout", "init", "--cone"], { encoding: "utf8" });
    const set = spawnGit(["-C", target, "sparse-checkout", "set", pathFilter], { encoding: "utf8" });

    const fetch = spawnGit(["-C", target, "fetch", "--depth", "1", "--filter=blob:none", "origin", "HEAD"], {
      encoding: "utf8",
      timeout: 180000,
    });

    if ([remote, config, sparse, set, fetch].some((r) => r.status !== 0)) {
      const msg = [remote, config, sparse, set, fetch]
        .map((r) => (r.stderr || "").trim())
        .filter(Boolean)
        .join("\n")
        .slice(-800);
      removePath(target); // clean partial clone
      fail(`git sparse clone failed for ${url}:\n${msg}`);
    }

    // The checkout lazily downloads blobs of the sparse cone from origin — on a
    // flaky connection that fetch can abort mid-way. Retry once before giving up.
    let checkout;
    let lastErr = "";

    for (let attempt = 0; attempt < 2; attempt += 1) {
      checkout = spawnGit(["-C", target, "checkout", "-b", "ai-learn-docs", "FETCH_HEAD"], {
        encoding: "utf8",
        timeout: 180000,
      });

      if (checkout.status === 0) {
        break;
      }

      lastErr = (checkout.stderr || "").trim();
    }

    if (checkout.status !== 0) {
      removePath(target); // clean partial clone
      fail(`git sparse clone failed for ${url}${lastErr ? `:\n${lastErr.slice(-500)}` : ""}`);
    }

    flattenSubpath(target, pathFilter);
  } else {
    const result = spawnGit(["clone", "--depth", "1", url, target], { encoding: "utf8" });

    if (result.status !== 0) {
      if (fs.existsSync(target)) {
        removePath(target); // clean partial clone
      }

      fail(`git clone failed for ${url}:\n${(result.stderr || "").slice(-500)}`);
    }
  }

  // Keep a snapshot, not a checkout.
  const gitDir = path.join(target, ".git");

  if (fs.existsSync(gitDir)) {
    removePath(gitDir);
  }
}

function writeDocSource(dir, config, entry) {
  const current = docSourceList(config.docSource);
  const sources = current.filter((source) => source.name !== entry.name);
  sources.push(entry);

  const allRemote = sources.every((source) => source.mode === "remote");
  config.docSource = { type: allRemote ? "remote" : "local", sources };
  writeJson(progressPath(dir), config);
}

// The friction bank (.ai-learn/traps.json + docs/plans/pièges.md) is *derived*
// from the embedded docs, so any change to the sources should refresh it.
// Best-effort on purpose: never fail the docs operation because the extraction
// hit a problem — the bank can be regenerated by hand with `ai-learn traps`.
function regenerateTrapsBestEffort(dir) {
  try {
    const { regenerateTraps } = require("./traps"); // lazy: avoid a require cycle
    regenerateTraps(dir);
  } catch {
    log("  ⚠ friction bank not regenerated (best-effort)");
  }
}

function addSource({ dir, name, source, online, subpath, regen }) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    fail(`No progress.json in ${dir}. Run \`ai-learn init\` first.`);
  }

  assertName(name);
  const existing = findSource(config, name);

  if (existing) {
    fail(`source "${name}" already exists. Use \`ai-learn docs update ${name}\` to refresh it.`);
  }

  const sources = docSourceList(config.docSource);

  if (sources.length >= MAX_SOURCES) {
    fail(
      `cannot add "${name}": already ${sources.length}/${MAX_SOURCES} sources. Remove one first:\n` +
        sources.map((source) => `  ai-learn docs remove ${source.name}`).join("\n"),
    );
  }

  // A preset key (build-your-own-x, developer-roadmap) is shorthand for a
  // full source spec. Resolution happens before the regen/online branches so
  // a `regen` preset routes into the recreate-locally flow.
  const preset = SOURCE_PRESETS[source];

  if (preset) {
    if (preset.mode === "regen") {
      regen = true;
    }
    log(`Resolved preset "${source}" → ${preset.source} (${preset.mode})`);
    source = preset.source;
  }

  if (regen) {
    if (!/^https?:\/\//.test(source)) {
      fail(`--regen requires an http(s) URL, got: ${source}`);
    }

    // Not clonable → scaffold a local dir the AI will fill by RECREATING the doc
    // from the verified online content. Provenance is recorded so `check` can
    // enforce the anti-hallucination rule: a generated source must carry its
    // origin URL, a non-empty local doc, and that doc must cite its origin.
    const target = docSourceTarget(dir, name);
    mkdirp(target);
    const rel = normalizePortable(path.relative(dir, target));

    writeDocSource(dir, config, {
      name,
      mode: "local",
      path: rel,
      url: source,
      generated: true,
      generatedAt: new Date().toISOString(),
    });

    log(`Added generated source "${name}" → ${rel}`);
    log(`  La source n'est pas clonable : l'IA doit RECRÉER la doc localement depuis ${source}.`);
    log(`  Anti-hallucination : chaque affirmation cite ${source} — rien d'inventé, rien d'approximatif.`);
    log(`  \`ai-learn check\` exigera une doc non vide qui cite son origine.`);
    regenerateTrapsBestEffort(dir);
    return;
  }

  if (online) {
    if (!/^https?:\/\//.test(source)) {
      fail(`--online requires an http(s) URL, got: ${source}`);
    }

    writeDocSource(dir, config, { name, mode: "remote", url: source });
    log(`Added online source "${name}" → ${source} (URL only, no local files)`);
    regenerateTrapsBestEffort(dir);
    return;
  }

  // A local *file* source (ex. a PDF book): the file is the verified origin,
  // kept whole so the learner can read it fully later. The AI distills only
  // what the plan needs into a .md (essentiel.md) citing pages — same
  // anti-hallucination contract as --regen, enforced by check.
  if (fs.existsSync(source) && fs.statSync(source).isFile()) {
    const target = docSourceTarget(dir, name);
    mkdirp(target);
    const file = path.basename(source);
    fs.copyFileSync(source, path.join(target, file));
    const rel = normalizePortable(path.relative(dir, target));

    writeDocSource(dir, config, {
      name,
      mode: "local",
      path: rel,
      file,
      src: source,
      generated: true,
      generatedAt: new Date().toISOString(),
    });

    log(`Added file source "${name}" → ${rel}/${file}`);
    log(`  La doc complète (${file}) reste disponible hors-ligne : l'IA en RECRÉE l'essentiel.`);
    log(`  Workflow : lis ${file} (outil Read, page par page), repère les sections utiles au plan`);
    log(`  (docs/plans/plan-apprentissage.md), puis écris docs/sources/${name}/essentiel.md — chaque`);
    log(`  affirmation cite \`${file}:page N\`. Pas tout le livre : l'essentiel seulement.`);
    log(`  Anti-hallucination : rien d'inventé — \`ai-learn check\` exigera un .md non vide qui cite \`${file}\`.`);
    regenerateTrapsBestEffort(dir);
    return;
  }

  const target = docSourceTarget(dir, name);
  const rel = normalizePortable(path.relative(dir, target));
  let entry;

  if (isGitUrl(source)) {
    const url = expandGitUrl(source);
    gitClone(url, target, subpath);
    entry = { name, mode: "local", path: rel, url, subpath: subpath || null };
  } else {
    copyFromSubdir(source, subpath, target);
    entry = { name, mode: "local", path: rel, src: source, subpath: subpath || null };
  }

  writeDocSource(dir, config, entry);
  log(`Added local source "${name}" → ${entry.path}`);
  log(`  Point the plan's citations at ${entry.path}/`);
  regenerateTrapsBestEffort(dir);
}

function removeSource({ dir, name }) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    fail(`No progress.json in ${dir}. Run \`ai-learn init\` first.`);
  }

  const source = findSource(config, name);

  if (!source) {
    fail(`no source named "${name}".`);
  }

  if (source.mode === "local" && source.path) {
    const target = path.resolve(dir, source.path);
    const root = path.resolve(sourcesDir(dir));

    // Only ever delete inside docs/sources/ — never a ledger path that escapes it.
    if (target.startsWith(root + path.sep) && fs.existsSync(target)) {
      removePath(target);
      log(`Removed local copy ${source.path}`);
    }
  }

  const remaining = docSourceList(config.docSource).filter((item) => item.name !== name);
  config.docSource =
    remaining.length > 0
      ? { type: remaining.every((item) => item.mode === "remote") ? "remote" : "local", sources: remaining }
      : null;
  writeJson(progressPath(dir), config);
  log(`Removed source "${name}".`);
  regenerateTrapsBestEffort(dir);
}

function updateSource({ dir, name, subpath }) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    fail(`No progress.json in ${dir}. Run \`ai-learn init\` first.`);
  }

  const source = findSource(config, name);

  if (!source) {
    fail(`no source named "${name}".`);
  }

  if (source.mode === "remote") {
    fail(`"${name}" is an online source (URL only) — nothing to refresh locally.`);
  }

  const target = docSourceTarget(dir, name);
  const root = path.resolve(sourcesDir(dir));

  if (path.resolve(target).startsWith(root + path.sep) && fs.existsSync(target)) {
    removePath(target);
  }

  if (source.url) {
    gitClone(source.url, target, subpath || source.subpath || null);
  } else if (source.file && source.src) {
    // A file source (ex. a PDF book): re-copy the single origin file.
    if (!fs.existsSync(source.src) || !fs.statSync(source.src).isFile()) {
      fail(`source "${name}" origin file is missing: ${source.src}`);
    }
    mkdirp(target);
    fs.copyFileSync(source.src, path.join(target, source.file));
  } else if (source.src) {
    copyFromSubdir(source.src, subpath || source.subpath || null, target);
  } else {
    fail(`source "${name}" has no recorded origin — re-add it with \`ai-learn docs remove ${name}\` then \`ai-learn docs add\`.`);
  }

  log(`Refreshed source "${name}" → ${normalizePortable(path.relative(dir, target))}`);
  regenerateTrapsBestEffort(dir);
}

function listSources({ dir }) {
  const { config, exists } = readProgress(dir);

  if (!exists || !config) {
    fail(`No progress.json in ${dir}. Run \`ai-learn init\` first.`);
  }

  const sources = docSourceList(config.docSource);

  if (sources.length === 0) {
    log("No doc sources yet.");
    log("Add one: ai-learn docs add <name> <path|url>   (or --online for URL-only)");
    return;
  }

  log(`Doc sources (${sources.length}/${MAX_SOURCES}):`);

  for (const source of sources) {
    const state =
      source.mode === "remote"
        ? "online"
        : fs.existsSync(path.join(dir, source.path))
          ? "present"
          : "MISSING (run `ai-learn docs update " + source.name + "`)";
    log(`  ${source.name}  [${source.mode}]  ${source.path || source.url}  (${state})`);
  }

  if (sources.length >= MAX_SOURCES) {
    log(`\nSource limit reached (${MAX_SOURCES}). Remove one before adding another.`);
  }
}

// Tiny arg parsing for the subcommand, mirroring the style of bin/ai-learn.js.
function positional(args) {
  return args.filter((arg) => !arg.startsWith("--"));
}

// The global `--dir <value>` is consumed by bin/ai-learn.js's resolveDir before
// dispatch, but it still travels inside `commandArgs`. Without stripping it, a
// short invocation like `docs add <name> --dir <dir>` would swallow <dir> as the
// positional source (and `docs add x --dir=<dir>` would leak the `--dir=` token).
function stripDir(args) {
  const out = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--dir") {
      i += 1; // skip its value
      continue;
    }

    if (arg.startsWith("--dir=")) {
      continue;
    }

    out.push(arg);
  }

  return out;
}

function flagValue(args, name) {
  const index = args.indexOf(name);
  return index !== -1 && args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : null;
}

function docsCommand({ dir, args }) {
  const sub = args[0] || "list";
  const rest = stripDir(args.slice(1));
  const online = rest.includes("--online");
  const regen = rest.includes("--regen");
  const subpath = flagValue(rest, "--path");

  if (sub === "add") {
    const [nameArg, source] = positional(rest);

    if (!source && SOURCE_PRESETS[nameArg]) {
      // Bare preset: `docs add build-your-own-x` — the name IS the preset key.
      addSource({ dir, name: nameArg, source: nameArg, online, subpath, regen });
      return;
    }

    if (!source) {
      fail(
        "usage: ai-learn docs add <name> <path|url|preset> [--path <subdir>] [--online] [--regen]\n" +
          `       presets: ${Object.keys(SOURCE_PRESETS).join(", ")}`,
      );
    }

    addSource({ dir, name: nameArg || deriveName(source), source, online, subpath, regen });
    return;
  }

  if (sub === "remove" || sub === "update") {
    const [name] = positional(rest);

    if (!name) {
      fail(`usage: ai-learn docs ${sub} <name>`);
    }

    if (sub === "remove") {
      removeSource({ dir, name });
    } else {
      updateSource({ dir, name, subpath });
    }
    return;
  }

  if (sub === "list") {
    listSources({ dir });
    return;
  }

  fail(`unknown docs subcommand "${sub}". Try: add | list | remove | update`);
}

module.exports = {
  MAX_SOURCES,
  SOURCE_PRESETS,
  docsCommand,
  addSource,
  removeSource,
  updateSource,
  listSources,
  docSourceList,
};
