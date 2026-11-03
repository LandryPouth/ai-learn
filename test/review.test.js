"use strict";

// Story 12.03 — `ai-learn review` : un kata de revue sur un diff piégé.
// `home` et le générateur aléatoire sont injectés.

const { test, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { execFileSync } = require("child_process");
const { reviewCommand, revealCommand, giveupCommand, readKata, kataDue, kataFact } = require("../bin/lib/review");
const { tracksPath, readOrDefaultReviewTracks } = require("../bin/lib/tracks/review");
const { buildNextReport } = require("../bin/lib/next");
const { capture, sampleProgress, tmpProject, writeFile } = require("./helpers");

beforeEach(() => {
  process.exitCode = 0;
});

const FIRST = () => 0;

// Quatre sites distincts : deux défauts (await, throw) et deux leurres.
const CODE = [
  "async function load(client, id, list) {",
  "  const row = await client.fetch(id);",
  "  if (row === null) {",
  "    throw new Error('missing');",
  "  }",
  "  if (list.length > 0) {",
  "    return row;",
  "  }",
  "  const other = await client.fetch(id + 1);",
  "  if (other === row) {",
  "    return other;",
  "  }",
  "  return null;",
  "}",
  "module.exports = { load };",
  "",
].join("\n");

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-kata-home-"));
}

function project({ status = "done", phaseExtra = {} } = {}) {
  const dir = tmpProject(sampleProgress({ phases: [{ id: 0, name: "P", status, checkpoint: "true", artifacts: [], predictionsRequired: 0, ...phaseExtra }] }));
  writeFile(dir, "src/load.js", CODE);
  return dir;
}

function start(dir, home, options = {}) {
  capture(() => reviewCommand({ dir, home, random: FIRST, defects: 2, decoys: 2, ...options }));
  return readKata(dir);
}

function secretOf(dir, home) {
  const store = path.join(home, ".ai-learn", "katas");
  return JSON.parse(fs.readFileSync(path.join(store, fs.readdirSync(store)[0]), "utf8"));
}

function writeReview(dir, id, text) {
  fs.writeFileSync(path.join(dir, "katas", id, "revue.md"), `# Revue\n\n${text}\n`);
}

test("review writes a diff of defects and decoys and leaves src untouched", () => {
  const dir = project();
  const home = tmpHome();
  const before = fs.readFileSync(path.join(dir, "src/load.js"));
  const state = start(dir, home);
  const diff = fs.readFileSync(path.join(dir, "katas", state.id, "kata.diff"), "utf8");

  assert.deepStrictEqual(fs.readFileSync(path.join(dir, "src/load.js")), before);
  assert.strictEqual(diff.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++")).length, 4);
  assert.deepStrictEqual(Object.keys(state).sort(), ["active", "id", "startedAt"]);
  assert.ok(fs.existsSync(path.join(dir, "katas", state.id, "revue.md")));
  assert.strictEqual(secretOf(dir, home).defects.length, 2);
  assert.ok(!fs.readFileSync(path.join(dir, ".ai-learn", "kata.json"), "utf8").includes("load.js"));
});

test("review refuses out-of-range counts and a project without a finished phase", () => {
  assert.throws(() => reviewCommand({ dir: project(), home: tmpHome(), defects: 7 }), /--defects/);
  assert.throws(() => reviewCommand({ dir: project(), home: tmpHome(), decoys: 11 }), /--decoys/);
  assert.throws(() => reviewCommand({ dir: project({ status: "pending" }), home: tmpHome() }), /phase terminée/);
});

test("review refuses when fewer defects exist than asked", () => {
  assert.throws(() => reviewCommand({ dir: project(), home: tmpHome(), random: FIRST, defects: 6, decoys: 0 }), /défaut\(s\) possible/);
});

test("a second kata is refused while one is active", () => {
  const dir = project();
  const home = tmpHome();
  start(dir, home);

  assert.throws(() => reviewCommand({ dir, home, random: FIRST }), /déjà actif/);
});

test("reveal refuses an empty review and keeps the kata active", () => {
  const dir = project();
  const home = tmpHome();
  const { id } = start(dir, home);

  assert.throws(() => revealCommand({ dir, home }), /ne cite aucun défaut/);
  assert.strictEqual(readKata(dir).active, true);
  assert.strictEqual(fs.readdirSync(path.join(home, ".ai-learn", "katas")).length, 1, "le secret reste");
  assert.ok(id);
});

test("a full review with a flagged decoy reaches tier 2", () => {
  const dir = project();
  const home = tmpHome();
  const { id } = start(dir, home);
  const secret = secretOf(dir, home);
  const cites = secret.defects.map((d) => `- ${d.file}:${d.line} — défaut`);
  cites.push(`- ${secret.decoys[0].file}:${secret.decoys[0].line} — suspect`);
  writeReview(dir, id, cites.join("\n"));

  const out = capture(() => revealCommand({ dir, home }));
  const ledger = readOrDefaultReviewTracks({ home });

  assert.match(out, /trouvés : 2\/2/);
  assert.match(out, /leurre signalé/);
  assert.match(out, /Palier 2/);
  assert.strictEqual(ledger.tiers["2"].achieved, true);
  assert.strictEqual(readKata(dir).active, false);
  assert.deepStrictEqual(fs.readdirSync(path.join(home, ".ai-learn", "katas")), [], "le secret est supprimé");
});

test("a missed defect is shown with its mechanism", () => {
  const dir = project();
  const home = tmpHome();
  const { id } = start(dir, home);
  const secret = secretOf(dir, home);
  const missed = secret.defects[1];
  const taken = [...secret.defects, ...secret.decoys].map((site) => site.line);
  const neighbour = [secret.defects[0].line - 1, secret.defects[0].line + 1].find((line) => line > 0 && !taken.includes(line));
  writeReview(dir, id, `- ${secret.defects[0].file}:${neighbour} — un défaut (ligne voisine)`);

  const out = capture(() => revealCommand({ dir, home }));
  const ledger = readOrDefaultReviewTracks({ home });

  assert.match(out, /trouvés : 1\/2/);
  assert.ok(out.includes(`${missed.file}:${missed.line}`));
  assert.ok(out.includes(missed.mechanism));
  assert.match(out, /Palier 1/);
  assert.deepStrictEqual([ledger.tiers["1"].achieved, ledger.tiers["2"].achieved], [true, false]);
});

test("two false positives block tier 2 even when every defect is found", () => {
  const dir = project();
  const home = tmpHome();
  const { id } = start(dir, home);
  const secret = secretOf(dir, home);
  writeReview(dir, id, [...secret.defects.map((d) => `- ${d.file}:${d.line}`), "- src/load.js:14", "- src/load.js:15"].join("\n"));

  capture(() => revealCommand({ dir, home }));

  assert.strictEqual(readOrDefaultReviewTracks({ home }).tiers["2"].achieved, false);
});

test("giveup reveals without score or tier", () => {
  const dir = project();
  const home = tmpHome();
  start(dir, home);

  const out = capture(() => giveupCommand({ dir, home }));

  assert.match(out, /Défauts cachés/);
  assert.strictEqual(readKata(dir).active, false);
  assert.strictEqual(fs.existsSync(tracksPath({ home })), false);
});

test("an unreadable review ledger is never overwritten", () => {
  const dir = project();
  const home = tmpHome();
  const { id } = start(dir, home);
  const secret = secretOf(dir, home);
  writeReview(dir, id, `- ${secret.defects[0].file}:${secret.defects[0].line}`);
  fs.mkdirSync(path.dirname(tracksPath({ home })), { recursive: true });
  fs.writeFileSync(tracksPath({ home }), "{ pas du json");

  assert.throws(() => capture(() => revealCommand({ dir, home })));
  assert.strictEqual(readKata(dir).active, true, "le kata reste actif");
  assert.strictEqual(fs.readFileSync(tracksPath({ home }), "utf8"), "{ pas du json");
});

test("a proven kata phase makes a kata due once per proof", () => {
  const dir = project({ phaseExtra: { kata: true } });
  const home = tmpHome();
  const at = "2026-11-03T10:00:00.000Z";
  writeFile(dir, `.ai-learn/runs/${at.replace(/[:.]/g, "-")}-phase-0-verify.json`, JSON.stringify({ phaseId: 0, ok: true, generatedAt: at }));

  assert.strictEqual(buildNextReport(dir, { home }).kata.due, true);
  assert.strictEqual(buildNextReport(dir, { home }).kata.due, false);
});

test("an active kata is public without any site", () => {
  const dir = project();
  start(dir, tmpHome());

  assert.deepStrictEqual(Object.keys(kataFact(dir)).sort(), ["active", "id", "startedAt"]);
});

test("a decoy next to a defect never counts as that defect", () => {
  const dir = project();
  const home = tmpHome();
  const { id } = start(dir, home);
  const secret = secretOf(dir, home);
  writeReview(dir, id, secret.decoys.map((d) => `- ${d.file}:${d.line}`).join("\n"));

  const out = capture(() => revealCommand({ dir, home }));

  assert.match(out, /trouvés : 0\/2/);
  assert.match(out, /leurre signalé/);
});

test("a citation copied with the diff header prefix still matches", () => {
  const dir = project();
  const home = tmpHome();
  const { id } = start(dir, home);
  const secret = secretOf(dir, home);
  writeReview(dir, id, secret.defects.map((d) => `- b/${d.file}:${d.line}`).join("\n"));

  assert.match(capture(() => revealCommand({ dir, home })), /trouvés : 2\/2/);
});

test("tier 2 needs at least two decoys, and nothing is printed when the ledger refuses", () => {
  const dir = project();
  const home = tmpHome();
  const { id } = start(dir, home, { defects: 1, decoys: 0 });
  const secret = secretOf(dir, home);
  writeReview(dir, id, `- ${secret.defects[0].file}:${secret.defects[0].line}`);
  fs.mkdirSync(path.dirname(tracksPath({ home })), { recursive: true });
  fs.writeFileSync(tracksPath({ home }), "{ cassé");

  const printed = [];
  assert.throws(() => capture(() => { try { revealCommand({ dir, home }); } catch (error) { printed.push(error); throw error; } }));
  assert.strictEqual(readKata(dir).active, true);

  fs.rmSync(tracksPath({ home }));
  capture(() => revealCommand({ dir, home }));

  assert.strictEqual(readOrDefaultReviewTracks({ home }).tiers["2"].achieved, false);
  assert.strictEqual(readOrDefaultReviewTracks({ home }).tiers["1"].achieved, true);
});

test("a reveal leaves a corrigé the AI can read", () => {
  const dir = project();
  const home = tmpHome();
  const { id } = start(dir, home);
  const secret = secretOf(dir, home);
  writeReview(dir, id, `- ${secret.defects[0].file}:${secret.defects[0].line}`);
  capture(() => revealCommand({ dir, home }));

  assert.match(fs.readFileSync(path.join(dir, "katas", id, "corrige.md"), "utf8"), new RegExp(secret.defects[1].mechanism.slice(0, 20)));
});

test("giveup still closes the kata when the secret is lost", () => {
  const dir = project();
  const home = tmpHome();
  start(dir, home);
  fs.rmSync(path.join(home, ".ai-learn", "katas"), { recursive: true });

  assert.match(capture(() => giveupCommand({ dir, home })), /introuvable/);
  assert.strictEqual(readKata(dir).active, false);
});

test("the diff of a file without a trailing newline applies", () => {
  const dir = project();
  writeFile(dir, "src/load.js", CODE.replace(/\n$/, ""));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  const home = tmpHome();
  const { id } = start(dir, home, { defects: 2, decoys: 2 });
  const diff = path.join(dir, "katas", id, "kata.diff");

  execFileSync("git", ["apply", "--check", diff], { cwd: dir });
  assert.strictEqual(fs.readFileSync(path.join(dir, "src/load.js"), "utf8"), CODE.replace(/\n$/, ""));
});

test("review is refused in dirigeant mode and during an incident, and break during a kata", () => {
  const dir = project();
  writeFile(dir, ".ai-learn/incident.json", JSON.stringify({ active: true, level: 1 }));
  assert.throws(() => reviewCommand({ dir, home: tmpHome(), random: FIRST }), /incident/);

  const second = project();
  start(second, tmpHome());
  const { breakCommand } = require("../bin/lib/incident");
  assert.throws(() => breakCommand({ dir: second, home: tmpHome(), random: FIRST }), /kata/);
});

test("a proven kata phase is not due in dirigeant mode, nor when untagged", () => {
  const at = "2026-11-03T10:00:00.000Z";
  const evidence = JSON.stringify({ phaseId: 0, ok: true, generatedAt: at });
  const dirigeant = project({ phaseExtra: { kata: true } });
  writeFile(dirigeant, ".ai-learn/guard.json", JSON.stringify({ version: 1, mode: "dirigeant" }));
  writeFile(dirigeant, `.ai-learn/runs/${at.replace(/[:.]/g, "-")}-phase-0-verify.json`, evidence);
  const untagged = project();
  writeFile(untagged, `.ai-learn/runs/${at.replace(/[:.]/g, "-")}-phase-0-verify.json`, evidence);

  assert.strictEqual(kataDue(dirigeant, { home: tmpHome() }), false);
  assert.strictEqual(kataDue(untagged, { home: tmpHome() }), false);
});

test("a new proof offers a new kata", () => {
  const dir = project({ phaseExtra: { kata: true } });
  const home = tmpHome();
  const prove = (at) => writeFile(dir, `.ai-learn/runs/${at.replace(/[:.]/g, "-")}-phase-0-verify.json`, JSON.stringify({ phaseId: 0, ok: true, generatedAt: at }));

  prove("2026-11-03T10:00:00.000Z");
  assert.strictEqual(kataDue(dir, { home }), true);
  prove("2026-11-04T10:00:00.000Z");
  assert.strictEqual(kataDue(dir, { home }), true);
});

test("review handles CRLF files: four changed lines, src untouched", () => {
  const dir = project();
  writeFile(dir, "src/load.js", CODE.replace(/\n/g, "\r\n"));
  const home = tmpHome();
  const before = fs.readFileSync(path.join(dir, "src/load.js"));
  const state = start(dir, home);
  const diff = fs.readFileSync(path.join(dir, "katas", state.id, "kata.diff"), "utf8");

  assert.deepStrictEqual(fs.readFileSync(path.join(dir, "src/load.js")), before);
  assert.strictEqual(diff.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++")).length, 4);
});

// Story 12.04 — le kata sur du code d'autrui.
function foreignDir(files = { "a.js": CODE, "b.js": CODE }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-foreign-"));

  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }

  return root;
}

function snapshot(root) {
  return Object.fromEntries(fs.readdirSync(root, { recursive: true }).filter((rel) => fs.statSync(path.join(root, rel)).isFile()).map((rel) => [rel, fs.readFileSync(path.join(root, rel), "utf8")]));
}

test("review from a foreign folder leaves it untouched", () => {
  const dir = project();
  const root = foreignDir();
  const before = snapshot(root);
  const state = start(dir, tmpHome(), { from: root, defects: 2, decoys: 2 });
  const diff = fs.readFileSync(path.join(dir, "katas", state.id, "kata.diff"), "utf8");

  assert.deepStrictEqual(snapshot(root), before);
  assert.match(diff, /^Source : /);
  assert.ok(/^--- a\/[ab]\.js$/m.test(diff), "chemins relatifs à --from");
  assert.ok(!diff.split("\n").slice(1).join("\n").includes(root), "seule la ligne Source cite le chemin");
  assert.match(fs.readFileSync(path.join(dir, "katas", state.id, "revue.md"), "utf8"), /Source : /);
});

test("minified files and nested node_modules are skipped", () => {
  const dir = project();
  const minified = `${CODE}var x = ${"a + b;".repeat(120)}\n`;
  const root = foreignDir({ "a.js": CODE, "min.js": minified, "node_modules/x/index.js": CODE, "a.test.js": CODE });
  const state = start(dir, tmpHome(), { from: root, defects: 2, decoys: 2 });
  const diff = fs.readFileSync(path.join(dir, "katas", state.id, "kata.diff"), "utf8");
  const files = [...diff.matchAll(/^--- a\/(.+)$/gm)].map((match) => match[1]);

  assert.deepStrictEqual([...new Set(files)], ["a.js"]);
});

test("review from a missing path is refused and creates nothing", () => {
  const dir = project();

  assert.throws(() => reviewCommand({ dir, home: tmpHome(), from: "/nope/absent", random: FIRST }), /n'existe pas/);
  assert.strictEqual(fs.existsSync(path.join(dir, "katas")), false);
  assert.strictEqual(fs.existsSync(path.join(dir, ".ai-learn", "kata.json")), false);
});

test("a source without any supported file is refused with the extensions", () => {
  const root = foreignDir({ "main.go": "package main\n" });

  assert.throws(() => reviewCommand({ dir: project(), home: tmpHome(), from: root, random: FIRST }), /extensions prises en charge \.js/);
});

test("half the defects on foreign code reaches tier 3", () => {
  const dir = project();
  const home = tmpHome();
  const { id } = start(dir, home, { from: foreignDir(), defects: 3, decoys: 1 });
  const secret = secretOf(dir, home);

  assert.strictEqual(secret.foreign, true);
  writeReview(dir, id, secret.defects.slice(0, 2).map((d) => `- ${d.file}:${d.line} — défaut`).join("\n"));
  const out = capture(() => revealCommand({ dir, home }));
  const ledger = readOrDefaultReviewTracks({ home });

  assert.match(out, /trouvés : 2\/3/);
  assert.match(out, /Palier 3/);
  assert.deepStrictEqual([1, 2, 3].map((tier) => ledger.tiers[String(tier)].achieved), [true, false, true]);
});

test("under half the defects on foreign code misses tier 3", () => {
  const dir = project();
  const home = tmpHome();
  const { id } = start(dir, home, { from: foreignDir(), defects: 3, decoys: 1 });
  writeReview(dir, id, `- ${secretOf(dir, home).defects[0].file}:1 — rien ici`);

  capture(() => revealCommand({ dir, home }));

  assert.strictEqual(readOrDefaultReviewTracks({ home }).tiers["3"].achieved, false);
});

test("review from the learner's own code earns no tier 3", () => {
  const dir = project();
  const home = tmpHome();
  const { id } = start(dir, home, { from: "src" });
  const secret = secretOf(dir, home);

  assert.strictEqual(secret.foreign, false);
  writeReview(dir, id, secret.defects.map((d) => `- ${d.file}:${d.line}`).join("\n"));
  capture(() => revealCommand({ dir, home }));

  assert.strictEqual(readOrDefaultReviewTracks({ home }).tiers["3"].achieved, false);
});

test("a kata tag with a path makes a foreign kata due", () => {
  const dir = project({ phaseExtra: { kata: "node_modules/x/lib" } });
  const at = "2026-11-03T10:00:00.000Z";
  writeFile(dir, `.ai-learn/runs/${at.replace(/[:.]/g, "-")}-phase-0-verify.json`, JSON.stringify({ phaseId: 0, ok: true, generatedAt: at }));
  const home = tmpHome();

  const first = buildNextReport(dir, { home }).kata;

  assert.deepStrictEqual([first.due, first.from], [true, "node_modules/x/lib"]);
  assert.strictEqual(buildNextReport(dir, { home }).kata.due, false);
});

test("--from expands ~/ and caps the kata at 20 files", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-home-"));
  const files = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`lib/f${String(i).padStart(2, "0")}.js`, CODE]));
  const root = path.join(home, "pkg");

  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }

  const dir = project();
  const state = start(dir, home, { from: "~/pkg/lib", defects: 2, decoys: 2 });
  const diff = fs.readFileSync(path.join(dir, "katas", state.id, "kata.diff"), "utf8");

  assert.ok(new Set([...diff.matchAll(/^--- a\/(.+)$/gm)].map((m) => m[1])).size <= 20);
});

test("a source path holding :digits is not read as a citation", () => {
  const dir = project();
  const root = foreignDir();
  const named = path.join(path.dirname(root), `${path.basename(root)}:12`);

  fs.renameSync(root, named);
  const state = start(dir, tmpHome(), { from: named, defects: 2, decoys: 2 });
  const revue = fs.readFileSync(path.join(dir, "katas", state.id, "revue.md"), "utf8");

  assert.doesNotMatch(revue, /[^\s]:12\b/);
});
