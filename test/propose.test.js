"use strict";

// `ai-learn propose` — suggest projects when the learner has no idea what to
// build. The contract under test is the one that keeps proposals honest: every
// project must be fully backed by verifiable resources (no step on thin air),
// and an invented project without a resource per stage is refused.

const { test, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { writeFile, capture } = require("./helpers");
const { PROJECTS, stageCoverage, stageResource, validateProject, proposeCommand } = require("../bin/lib/propose");

const BIN = path.join(__dirname, "..", "bin", "ai-learn.js");

afterEach(() => {
  process.exitCode = 0;
});

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-propose-"));
}

test("the project bank is internally consistent: every stage is backed by a resource", () => {
  assert.ok(PROJECTS.length >= 5, `expected a real catalogue, got ${PROJECTS.length}`);

  for (const project of PROJECTS) {
    assert.ok(project.id, `project missing id: ${project.title}`);
    assert.ok(project.title, `${project.id} missing title`);
    assert.ok(Number.isInteger(project.difficulty) && project.difficulty >= 1 && project.difficulty <= 5, `${project.id} bad difficulty`);
    assert.ok(Array.isArray(project.stages) && project.stages.length >= 3, `${project.id} needs at least 3 stages`);
    assert.ok(project.doc && project.doc.trim(), `${project.id} needs a doc line`);
    assert.strictEqual(stageCoverage(project), 1, `${project.id} must be fully backed`);
    assert.strictEqual(validateProject(project).ok, true, `${project.id} must pass validation`);

    for (const stage of project.stages) {
      assert.ok(stage.title, `${project.id} has a stage without a title`);
      assert.ok(stage.checkpoint, `${project.id}:${stage.title} has no checkpoint`);
      const resource = stageResource(stage);
      assert.ok(resource, `${project.id}:${stage.title} has no verifiable resource`);
      assert.match(resource, /^(https?:\/\/|man \d|RFC \d)/, `${project.id}:${stage.title} resource not obviously verifiable: ${resource}`);
    }
  }
});

test("stageResource accepts a {name, ref} object or a bare URL string, rejects empty", () => {
  assert.strictEqual(stageResource({ resource: { name: "RFC 9110", ref: "https://rfc-editor.org/rfc/rfc9110" } }), "https://rfc-editor.org/rfc/rfc9110");
  assert.strictEqual(stageResource({ resource: "https://man7.org/linux/man-pages/man2/pipe.2.html" }), "https://man7.org/linux/man-pages/man2/pipe.2.html");
  // Sans dir, une ref non-URL ne peut pas être vérifiée (existence locale inconnue).
  assert.strictEqual(stageResource({ resource: "man 2 pipe" }), null);
  assert.strictEqual(stageResource({ resource: { name: "x", ref: "   " } }), null);
  assert.strictEqual(stageResource({ resource: null }), null);
  assert.strictEqual(stageResource(undefined), null);
});

test("validateProject refuses an invented project with an unsourced stage", () => {
  const result = validateProject({
    title: "Truc inventé",
    stages: [{ title: "Étape sans source", checkpoint: "x" }],
  });

  assert.strictEqual(result.ok, false);
  assert.ok(result.missing.some((m) => /sans source/.test(m.stage)));
});

test("validateProject refuses a project with no stages at all", () => {
  const result = validateProject({ title: "Vide" });
  assert.strictEqual(result.ok, false);
  assert.ok(result.missing.some((m) => /aucune étape/.test(m.reason)));
});

test("validateProject accepts an invented project with every stage sourced", () => {
  const result = validateProject({
    title: "Mini-traceroute",
    stages: [{ title: "ICMP echo", checkpoint: "ping marche", resource: { name: "man 7 raw", ref: "https://man7.org/linux/man-pages/man7/raw.7.html" } }],
  });

  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.missing, []);
});

test("validateProject rejects a plausible URL without a scheme", () => {
  // `redis.io/topics/protocol-v99` reads like a citation but has no http(s)
  // scheme — a bare string that cannot be checked is not a sourced stage.
  const result = validateProject({
    title: "Mini-Redis",
    stages: [{ title: "RESP", checkpoint: "x", resource: { name: "Redis protocol", ref: "redis.io/topics/protocol-v99" } }],
  });

  assert.strictEqual(result.ok, false);
  assert.ok(result.missing.some((m) => /URL http/.test(m.reason)));
});

test("stageResource accepts an existing local path under dir, rejects a missing one", () => {
  const dir = tmpDir();
  writeFile(dir, "docs/sources/rfc/index.md", "# RFC 9110\n");

  assert.strictEqual(stageResource({ resource: { ref: "docs/sources/rfc/index.md" } }, dir), "docs/sources/rfc/index.md");
  assert.strictEqual(stageResource({ resource: { ref: "docs/sources/rfc/missing.md" } }, dir), null);
  // Absolute paths and ../ escapes are not sourced local refs.
  assert.strictEqual(stageResource({ resource: { ref: "/etc/passwd" } }, dir), null);
  assert.strictEqual(stageResource({ resource: { ref: "../outside.md" } }, dir), null);
});

test("validateProject uses the dir for local refs: a present file passes, an absent one is refused", () => {
  const dir = tmpDir();
  writeFile(dir, "docs/sources/rfc/index.md", "# RFC 9110\n");

  const ok = validateProject(
    { title: "X", stages: [{ title: "S", checkpoint: "x", resource: { ref: "docs/sources/rfc/index.md" } }] },
    dir,
  );
  assert.strictEqual(ok.ok, true);

  const bad = validateProject(
    { title: "X", stages: [{ title: "S", checkpoint: "x", resource: { ref: "docs/sources/rfc/missing.md" } }] },
    dir,
  );
  assert.strictEqual(bad.ok, false);
});

test("proposeCommand prints the shortlist and writes proposals.json (no progress.json needed)", () => {
  const dir = tmpDir(); // no progress.json — propose works before init

  const out = capture(() => proposeCommand({ dir, limit: 3 }));

  assert.match(out, /Projets à construire/);
  assert.match(out, /ressource  :/);
  assert.match(out, /Chaque étape est adossée à une ressource vérifiable/);

  const report = JSON.parse(fs.readFileSync(path.join(dir, ".ai-learn", "proposals.json"), "utf8"));
  assert.strictEqual(report.schemaVersion, 1);
  assert.ok(report.projects.length <= 3);
  assert.ok(report.projects.every((p) => p.stages.every((s) => s.resource && s.resource.ref)));
});

test("proposeCommand filters by stack and level", () => {
  const dir = tmpDir();

  capture(() => proposeCommand({ dir, level: 5 }));
  const five = JSON.parse(fs.readFileSync(path.join(dir, ".ai-learn", "proposals.json"), "utf8"));
  assert.ok(five.projects.length > 0);
  assert.ok(five.projects.every((p) => p.difficulty === 5), `got ${five.projects.map((p) => p.id)}`);

  const cDir = tmpDir();
  capture(() => proposeCommand({ dir: cDir, stack: "c", limit: 10 }));
  const cStack = JSON.parse(fs.readFileSync(path.join(cDir, ".ai-learn", "proposals.json"), "utf8"));
  assert.ok(cStack.projects.some((p) => p.id === "sqlite"), "sqlite (C) should appear for --stack c");
  assert.ok(!cStack.projects.some((p) => p.id === "redis"), "redis is not offered in C");

  const none = tmpDir();
  capture(() => proposeCommand({ dir: none, stack: "nonexistent" }));
  const empty = JSON.parse(fs.readFileSync(path.join(none, ".ai-learn", "proposals.json"), "utf8"));
  assert.deepStrictEqual(empty.projects, []);
});

test("the bank serves the web/API persona: JS projects include a REST API and a WebSocket", () => {
  const dir = tmpDir();
  capture(() => proposeCommand({ dir, stack: "javascript", limit: 10 }));

  const report = JSON.parse(fs.readFileSync(path.join(dir, ".ai-learn", "proposals.json"), "utf8"));
  const ids = report.projects.map((p) => p.id);
  assert.ok(ids.includes("rest-api"), `expected rest-api among ${ids.join(", ")}`);
  assert.ok(ids.includes("websocket"), `expected websocket among ${ids.join(", ")}`);
  assert.ok(report.projects.every((p) => p.stack.includes("javascript")));
});

test("propose --validate refuses an unsourced invented project via CLI (exit 1)", () => {
  const dir = tmpDir();
  const badFile = path.join(dir, "invented.json");
  writeFile(dir, "invented.json", JSON.stringify({ title: "Vide", stages: [{ title: "Sans ressource", checkpoint: "x" }] }));

  const result = spawnSync(process.execPath, [BIN, "propose", "--validate", badFile, "--dir", dir], { encoding: "utf8" });
  assert.strictEqual(result.status, 1);
  assert.match(result.stdout, /propose FAILED/);
  assert.match(result.stdout, /aucune ressource vérifiable/);
});

test("propose --validate accepts a fully sourced invented project via CLI", () => {
  const dir = tmpDir();
  const goodFile = path.join(dir, "invented.json");
  writeFile(dir, "invented.json", JSON.stringify({
    title: "Mini-traceroute",
    stages: [{ title: "ICMP echo", checkpoint: "ping marche", resource: { name: "man 7 raw", ref: "https://man7.org/linux/man-pages/man7/raw.7.html" } }],
  }));

  const result = spawnSync(process.execPath, [BIN, "propose", "--validate", goodFile, "--dir", dir], { encoding: "utf8" });
  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /Projet valide/);
});
