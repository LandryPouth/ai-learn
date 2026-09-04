"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  addSource,
  removeSource,
  updateSource,
  listSources,
  docSourceList,
  MAX_SOURCES,
  SOURCE_PRESETS,
  docsCommand,
} = require("../bin/lib/docs");
const { readJson } = require("../bin/lib/util");
const { tmpProject, writeFile, capture, spawnGit } = require("./helpers");

function sourceDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-src-"));
  writeFile(dir, "docs/Reference/Routes.md", "# Routes\n");
  writeFile(dir, "docs/Guides/Getting-Started.md", "# Getting Started\n");
  writeFile(dir, "examples/hello.js", "console.log('hi')\n");
  writeFile(dir, "node_modules/dep/README.md", "junk\n"); // noise, must be skipped
  return dir;
}

test("docSourceList normalizes the new sources[] shape and infers missing mode", () => {
  const list = docSourceList({
    type: "local",
    sources: [
      { name: "a", path: "docs/sources/a" },
      { name: "b", mode: "remote", url: "https://x" },
    ],
  });

  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].mode, "local");
  assert.strictEqual(list[1].mode, "remote");
});

test("docSourceList handles the legacy single-source shape", () => {
  const list = docSourceList({ type: "local", value: "/some/dir" });
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].mode, "local");
  assert.strictEqual(list[0].path, "/some/dir");
});

test("docSourceList returns [] for null", () => {
  assert.deepStrictEqual(docSourceList(null), []);
});

test("add copies a local source, skipping node_modules, and records it", () => {
  const src = sourceDir();
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  const out = capture(() => addSource({ dir, name: "fastify-docs", source: src, online: false, subpath: "docs" }));

  assert.match(out, /Added local source "fastify-docs"/);

  const target = path.join(dir, "docs", "sources", "fastify-docs");
  assert.ok(fs.existsSync(path.join(target, "Reference", "Routes.md")));
  assert.ok(fs.existsSync(path.join(target, "Guides", "Getting-Started.md")));
  assert.ok(!fs.existsSync(path.join(target, "examples"))); // --path docs → only docs/
  assert.ok(!fs.existsSync(path.join(target, "node_modules")));

  const progress = readJson(path.join(dir, "progress.json"), null);
  assert.strictEqual(progress.docSource.type, "local");
  assert.strictEqual(progress.docSource.sources.length, 1);
  assert.strictEqual(progress.docSource.sources[0].name, "fastify-docs");
  assert.strictEqual(progress.docSource.sources[0].path, "docs/sources/fastify-docs");
});

test("add without --path copies the whole tree except noise", () => {
  const src = sourceDir();
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  addSource({ dir, name: "full", source: src, online: false, subpath: null });

  const target = path.join(dir, "docs", "sources", "full");
  assert.ok(fs.existsSync(path.join(target, "examples", "hello.js")));
  assert.ok(!fs.existsSync(path.join(target, "node_modules")));
});

test("add --online records a URL only, no local files", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  const out = capture(() => addSource({ dir, name: "web", source: "https://fastify.dev/docs", online: true }));

  assert.match(out, /Added online source "web"/);
  assert.ok(!fs.existsSync(path.join(dir, "docs", "sources", "web")));

  const progress = readJson(path.join(dir, "progress.json"), null);
  assert.strictEqual(progress.docSource.type, "remote");
  assert.strictEqual(progress.docSource.sources[0].mode, "remote");
  assert.strictEqual(progress.docSource.sources[0].url, "https://fastify.dev/docs");
});

test("add enforces the max number of sources", () => {
  const src = sourceDir();
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  for (let i = 0; i < MAX_SOURCES; i += 1) {
    addSource({ dir, name: `src-${i}`, source: src, online: false, subpath: "docs" });
  }

  assert.throws(
    () => addSource({ dir, name: "too-many", source: src, online: false, subpath: "docs" }),
    /cannot add "too-many": already 3\/3 sources/,
  );
});

test("add refuses a duplicate name", () => {
  const src = sourceDir();
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  addSource({ dir, name: "dup", source: src, online: false, subpath: "docs" });

  assert.throws(() => addSource({ dir, name: "dup", source: src, online: false, subpath: "docs" }), /already exists/);
});

test("remove deletes the local copy and the ledger entry", () => {
  const src = sourceDir();
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  addSource({ dir, name: "gone", source: src, online: false, subpath: "docs" });
  assert.ok(fs.existsSync(path.join(dir, "docs", "sources", "gone")));

  removeSource({ dir, name: "gone" });

  assert.ok(!fs.existsSync(path.join(dir, "docs", "sources", "gone")));
  const progress = readJson(path.join(dir, "progress.json"), null);
  assert.strictEqual(progress.docSource, null);
});

test("update re-copies a local source from its recorded origin", () => {
  const src = sourceDir();
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  addSource({ dir, name: "refreshed", source: src, online: false, subpath: "docs" });

  const target = path.join(dir, "docs", "sources", "refreshed");
  writeFile(target, "Reference/Routes.md", "# changed\n");

  updateSource({ dir, name: "refreshed" });

  assert.strictEqual(fs.readFileSync(path.join(target, "Reference", "Routes.md"), "utf8"), "# Routes\n");
});

test("update on a remote source refuses cleanly", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });
  addSource({ dir, name: "web", source: "https://x.dev", online: true });

  assert.throws(() => updateSource({ dir, name: "web" }), /online source/);
});

// A tiny local git repo used to exercise the sparse-clone path without network.
function localGitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-git-"));
  writeFile(dir, "docs/Reference/Routes.md", "# Routes\n");
  writeFile(dir, "docs/Guides/Getting-Started.md", "# Getting Started\n");
  writeFile(dir, "src/index.js", "console.log('x')\n");

  for (const cmd of [
    ["init", "-b", "main"],
    ["config", "user.email", "test@example.com"],
    ["config", "user.name", "Test"],
    ["add", "-A"],
    ["commit", "-m", "init"],
  ]) {
    const r = spawnGit(["-C", dir, ...cmd], { encoding: "utf8" });

    if (r.status !== 0) {
      throw new Error(`git ${cmd[0]} failed: ${r.stderr}`);
    }
  }

  return dir;
}

test("add clones a git repo sparsely (only the --path subdir, no .git)", (t) => {
  const repo = localGitRepo();
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  t.after(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  addSource({ dir, name: "repo-docs", source: `file://${repo}`, online: false, subpath: "docs" });

  const target = path.join(dir, "docs", "sources", "repo-docs");
  assert.ok(fs.existsSync(path.join(target, "Reference", "Routes.md")));
  assert.ok(fs.existsSync(path.join(target, "Guides", "Getting-Started.md")));
  assert.ok(!fs.existsSync(path.join(target, "src"))); // sparse cone: only docs/
  assert.ok(!fs.existsSync(path.join(target, ".git"))); // snapshot, not a checkout
});

test("list shows the sources and their state", () => {
  const src = sourceDir();
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  addSource({ dir, name: "local-doc", source: src, online: false, subpath: "docs" });
  addSource({ dir, name: "web", source: "https://x.dev", online: true });

  const out = capture(() => listSources({ dir }));

  assert.match(out, /local-doc/);
  assert.match(out, /\[local\]/);
  assert.match(out, /web/);
  assert.match(out, /\[remote\]/);
  assert.match(out, /online/);
});

test("SOURCE_PRESETS maps the two vetted complements", () => {
  assert.strictEqual(SOURCE_PRESETS["build-your-own-x"].mode, "clone");
  assert.match(SOURCE_PRESETS["build-your-own-x"].source, /codecrafters-io\/build-your-own-x/);
  assert.strictEqual(SOURCE_PRESETS["developer-roadmap"].mode, "regen");
  assert.match(SOURCE_PRESETS["developer-roadmap"].source, /roadmap\.sh\/backend/);
});

test("SOURCE_PRESETS maps the git/gh module's two reference docs (regen — neither is clonable)", () => {
  assert.strictEqual(SOURCE_PRESETS["conventional-commits"].mode, "regen");
  assert.match(SOURCE_PRESETS["conventional-commits"].source, /conventionalcommits\.org/);
  assert.strictEqual(SOURCE_PRESETS["gh-manual"].mode, "regen");
  assert.match(SOURCE_PRESETS["gh-manual"].source, /cli\.github\.com\/manual/);
});

test("docsCommand resolves a bare conventional-commits preset to the regen flow", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  const out = capture(() => docsCommand({ dir, args: ["add", "conventional-commits"] }));

  assert.match(out, /Resolved preset "conventional-commits" → https:\/\/www\.conventionalcommits\.org\/en\/v1\.0\.0\/ \(regen\)/);
  assert.match(out, /Added generated source "conventional-commits"/);

  const progress = readJson(path.join(dir, "progress.json"), null);
  assert.strictEqual(progress.docSource.sources[0].generated, true);
  assert.strictEqual(progress.docSource.sources[0].url, "https://www.conventionalcommits.org/en/v1.0.0/");
});

test("add --regen scaffolds a generated source with provenance", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  const out = capture(() => addSource({ dir, name: "gen", source: "https://roadmap.sh/backend", regen: true }));

  assert.match(out, /Added generated source "gen"/);
  assert.match(out, /RECRÉER la doc localement depuis https:\/\/roadmap\.sh\/backend/);

  const target = path.join(dir, "docs", "sources", "gen");
  assert.ok(fs.existsSync(target)); // scaffold dir exists, to be filled by the AI

  const progress = readJson(path.join(dir, "progress.json"), null);
  const source = progress.docSource.sources[0];
  assert.strictEqual(source.name, "gen");
  assert.strictEqual(source.mode, "local");
  assert.strictEqual(source.generated, true);
  assert.strictEqual(source.url, "https://roadmap.sh/backend");
  assert.ok(source.generatedAt);
});

test("add --regen refuses a non-http(s) origin", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  assert.throws(() => addSource({ dir, name: "gen", source: "/local/path", regen: true }), /--regen requires an http\(s\) URL/);
});

function pdfFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-pdf-"));
  writeFile(dir, "book.pdf", "%PDF-1.4 fake content for testing\n");
  return path.join(dir, "book.pdf");
}

test("add embeds a PDF file source whole, recording it as a generated source", () => {
  const pdf = pdfFile();
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  const out = capture(() => addSource({ dir, name: "livre", source: pdf, online: false, subpath: null }));

  assert.match(out, /Added file source "livre"/);

  const target = path.join(dir, "docs", "sources", "livre");
  assert.ok(fs.existsSync(path.join(target, "book.pdf")));

  const progress = readJson(path.join(dir, "progress.json"), null);
  const source = progress.docSource.sources[0];
  assert.strictEqual(source.name, "livre");
  assert.strictEqual(source.mode, "local");
  assert.strictEqual(source.generated, true);
  assert.strictEqual(source.file, "book.pdf");
  assert.strictEqual(source.path, "docs/sources/livre");
  assert.ok(source.generatedAt);
});

test("update re-copies a file source from its recorded origin", () => {
  const pdf = pdfFile();
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  addSource({ dir, name: "livre", source: pdf, online: false, subpath: null });

  const target = path.join(dir, "docs", "sources", "livre");
  fs.writeFileSync(path.join(target, "book.pdf"), "%PDF-1.4 CHANGED\n");

  updateSource({ dir, name: "livre" });

  const content = fs.readFileSync(path.join(target, "book.pdf"), "utf8");
  assert.match(content, /fake content/);
  assert.doesNotMatch(content, /CHANGED/);
});

test("docsCommand resolves a bare developer-roadmap preset to the regen flow", () => {
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  const out = capture(() => docsCommand({ dir, args: ["add", "developer-roadmap"] }));

  assert.match(out, /Resolved preset "developer-roadmap" → https:\/\/roadmap\.sh\/backend \(regen\)/);
  assert.match(out, /Added generated source "developer-roadmap"/);

  const progress = readJson(path.join(dir, "progress.json"), null);
  assert.strictEqual(progress.docSource.sources[0].generated, true);
  assert.strictEqual(progress.docSource.sources[0].url, "https://roadmap.sh/backend");
});

test("docsCommand ignores the global --dir flag inside the subcommand args", () => {
  // bin/ai-learn.js passes commandArgs including `--dir <value>` (consumed
  // globally by resolveDir); it must not leak as the positional source.
  const dir = tmpProject({ version: 1, project: "demo", technology: "X", docSource: null, phases: [] });

  const out = capture(() =>
    docsCommand({ dir, args: ["add", "gen", "https://roadmap.sh/backend", "--dir", "/elsewhere", "--regen"] }),
  );

  assert.match(out, /Added generated source "gen"/);
  assert.match(out, /RECRÉER la doc localement depuis https:\/\/roadmap\.sh\/backend/);
});
