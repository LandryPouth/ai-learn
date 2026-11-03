"use strict";

// Story 10.04 — `ai-learn break` : un incident de code que l'outil injecte sans
// dire où. Projets temporaires avec un vrai `git init` et des checkpoints
// `node -e` ; générateur aléatoire et `home` injectés.

const { test, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { breakCommand, resolveCommand, giveupCommand, readIncident, incidentRecordPath } = require("../bin/lib/incident");
const { mutateLockPath, findAllSites } = require("../bin/lib/mutate");
const { readGitTracks } = require("../bin/lib/tracks/git");
const { tracksPath } = require("../bin/lib/tracks/debug");
const { buildNextReport } = require("../bin/lib/next");
const { recordPrediction } = require("../bin/lib/predictions");
const { readProgress } = require("../bin/lib/progress");
const { capture, sampleProgress, tmpProject, writeFile, spawnGit } = require("./helpers");

beforeEach(() => {
  process.exitCode = 0;
});

const FIRST = () => 0;
const CHECKPOINT_A = "node -e \"const { isReady } = require('./src/a.js'); if (isReady() !== true) process.exit(1)\"";
// Prints the culprit's path on failure: a level-2 fault must avoid this file.
const CHECKPOINT_AB =
  "node -e \"const a = require('./src/a.js'); const b = require('./src/b.js'); " +
  "if (a.isReady() !== true) { console.error('FAIL src/a.js'); process.exit(1) } " +
  "if (b.isOk() !== true) { console.error('FAIL'); process.exit(1) }\"";

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-incident-home-"));
}

function git(dir, ...args) {
  const res = spawnGit(["-C", dir, ...args], { encoding: "utf8" });
  assert.strictEqual(res.status, 0, res.stderr);
}

function commitAll(dir) {
  git(dir, "init", "-q");
  git(dir, "add", "-A");
  git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init");
}

function project({ checkpoint = CHECKPOINT_A, files = null, status = "done", extra = {} } = {}) {
  const dir = tmpProject(
    sampleProgress({
      phases: [{ id: 0, name: "Phase zero", status, checkpoint, artifacts: [], predictionsRequired: 0 }],
      ...extra,
    }),
  );
  const sources = files || { "src/a.js": "function isReady() {\n  return true;\n}\n\nmodule.exports = { isReady };\n" };
  for (const [rel, content] of Object.entries(sources)) {
    writeFile(dir, rel, content);
  }
  commitAll(dir);
  return dir;
}

function twoFiles() {
  return {
    "src/a.js": "function isReady() {\n  return true;\n}\n\nmodule.exports = { isReady };\n",
    "src/b.js": "function isOk() {\n  return true;\n}\n\nmodule.exports = { isOk };\n",
  };
}

function snapshot(dir, rels) {
  return Object.fromEntries(rels.map((rel) => [rel, fs.readFileSync(path.join(dir, rel), "utf8")]));
}

test("break refuses a dirty git tree", () => {
  const dir = project();
  const home = tmpHome();
  writeFile(dir, "notes.txt", "untracked\n");
  const before = snapshot(dir, ["src/a.js"]);

  assert.throws(() => breakCommand({ dir, home, random: FIRST }), /arbre git non propre/);
  assert.deepStrictEqual(snapshot(dir, ["src/a.js"]), before);
  assert.strictEqual(readIncident(dir), null);
});

test("break refuses without a done phase carrying a checkpoint", () => {
  const dir = project({ status: "pending" });

  assert.throws(() => breakCommand({ dir, home: tmpHome(), random: FIRST }), /phase terminée/);
});

test("break refuses in dirigeant mode", () => {
  const dir = project({ files: { "src/a.js": "function isReady() {\n  return true;\n}\nmodule.exports = { isReady };\n", ".ai-learn/guard.json": JSON.stringify({ version: 1, mode: "dirigeant" }) } });

  assert.throws(() => breakCommand({ dir, home: tmpHome(), random: FIRST }), /dirigeant/);
});

test("break injects one detectable fault and keeps the site secret", () => {
  const dir = project();
  const home = tmpHome();
  const original = fs.readFileSync(path.join(dir, "src/a.js"), "utf8");

  const out = capture(() => breakCommand({ dir, level: 1, home, random: FIRST }));

  assert.notStrictEqual(fs.readFileSync(path.join(dir, "src/a.js"), "utf8"), original);
  const incident = readIncident(dir);
  assert.strictEqual(incident.active, true);
  assert.strictEqual(incident.level, 1);
  assert.deepStrictEqual(incident.failingPhases, [0]);
  const raw = fs.readFileSync(path.join(dir, ".ai-learn", "incident.json"), "utf8");
  assert.ok(!raw.includes("a.js"), "le fichier ne doit pas figurer dans le projet");
  assert.ok(!out.includes("a.js:"), "la sortie ne révèle pas la ligne");
  assert.ok(fs.existsSync(incidentRecordPath(dir, { home })), "le secret vit dans le home");
  assert.ok(!fs.existsSync(mutateLockPath(dir)), "aucun verrou ne reste après l'injection");
});

test("no detectable site restores every file byte for byte", () => {
  // Checkpoint insensible au code : aucune panne n'est détectable.
  const dir = project({ checkpoint: 'node -e "require(\'./src/a.js\')"' });
  const before = snapshot(dir, ["src/a.js"]);

  assert.throws(() => breakCommand({ dir, home: tmpHome(), random: FIRST }), /aucune panne détectable/);
  assert.deepStrictEqual(snapshot(dir, ["src/a.js"]), before);
  assert.strictEqual(readIncident(dir), null);
});

test("level 2 fault file is absent from the failing output", () => {
  const dir = project({ checkpoint: CHECKPOINT_AB, files: twoFiles() });
  const out = capture(() => breakCommand({ dir, level: 2, home: tmpHome(), random: FIRST }));

  const changed = ["src/a.js", "src/b.js"].filter((rel) => fs.readFileSync(path.join(dir, rel), "utf8").includes("false"));
  assert.deepStrictEqual(changed, ["src/b.js"]);
  assert.ok(!out.includes("src/a.js"));
});

test("break refuses while an incident is already active", () => {
  const dir = project();
  const home = tmpHome();
  capture(() => breakCommand({ dir, home, random: FIRST }));

  assert.throws(() => breakCommand({ dir, home, random: FIRST }), /incident actif/);
});

test("resolve keeps a red incident active", () => {
  const dir = project();
  const home = tmpHome();
  capture(() => breakCommand({ dir, home, random: FIRST }));

  capture(() => resolveCommand({ dir, home }));

  assert.strictEqual(process.exitCode, 1);
  assert.strictEqual(readIncident(dir).active, true);
});

test("resolve closes a repaired incident and reaches tier 1", () => {
  const dir = project();
  const home = tmpHome();
  capture(() => breakCommand({ dir, home, random: FIRST }));
  writeFile(dir, "src/a.js", "function isReady() {\n  return true;\n}\n\nmodule.exports = { isReady };\n");

  const out = capture(() => resolveCommand({ dir, home }));

  assert.strictEqual(process.exitCode, 0);
  assert.strictEqual(readIncident(dir).active, false);
  assert.match(out, /src\/a\.js:2/);
  const ledger = JSON.parse(fs.readFileSync(tracksPath({ home }), "utf8"));
  assert.strictEqual(ledger.tiers["1"].achieved, true);
  assert.strictEqual(ledger.tiers["3"].achieved, false);
  assert.ok(!fs.existsSync(incidentRecordPath(dir, { home })));
});

test("a debug prediction within two lines is exact and reaches tier 3", () => {
  const dir = project();
  const home = tmpHome();
  capture(() => breakCommand({ dir, home, random: FIRST }));
  const { config } = readProgress(dir);
  // Le site réel est a.js:2 ; la prédiction vise la ligne voisine.
  recordPrediction(dir, config, { phaseId: 0, type: "debug", prediction: "boolean inversé dans isReady", file: "src/a.js", line: 3 });
  writeFile(dir, "src/a.js", "function isReady() {\n  return true;\n}\n\nmodule.exports = { isReady };\n");

  const out = capture(() => resolveCommand({ dir, home }));

  assert.match(out, /exact/);
  const ledger = JSON.parse(fs.readFileSync(tracksPath({ home }), "utf8"));
  assert.strictEqual(ledger.tiers["3"].achieved, true);
});

test("a prediction in the right file but far away is only 'fichier'", () => {
  const dir = project();
  const home = tmpHome();
  capture(() => breakCommand({ dir, home, random: FIRST }));
  const { config } = readProgress(dir);
  recordPrediction(dir, config, { phaseId: 0, type: "debug", prediction: "quelque part", file: "src/a.js", line: 40 });
  writeFile(dir, "src/a.js", "function isReady() {\n  return true;\n}\n\nmodule.exports = { isReady };\n");

  const out = capture(() => resolveCommand({ dir, home }));

  assert.match(out, /fichier/);
  const ledger = JSON.parse(fs.readFileSync(tracksPath({ home }), "utf8"));
  assert.strictEqual(ledger.tiers["3"].achieved, false);
});

test("resolve compares learner and ai predictions to the real site", () => {
  const dir = project({ files: twoFiles() });
  const home = tmpHome();
  capture(() => breakCommand({ dir, home, random: FIRST }));
  const { config } = readProgress(dir);
  const site = JSON.parse(fs.readFileSync(incidentRecordPath(dir, { home }), "utf8"));
  const other = site.file === "src/a.js" ? "src/b.js" : "src/a.js";
  recordPrediction(dir, config, { phaseId: 0, type: "debug", prediction: "ici", file: site.file, line: site.line + 1 });
  recordPrediction(dir, config, { phaseId: 0, type: "debug", by: "ia", prediction: "plutôt là", file: other, line: 4 });
  writeFile(dir, "src/a.js", twoFiles()["src/a.js"]);
  writeFile(dir, "src/b.js", twoFiles()["src/b.js"]);

  const out = capture(() => resolveCommand({ dir, home }));

  assert.match(out, /Ta prédiction : exact/);
  assert.match(out, /Second avis de l'IA : manqué/);
  const { secondOpinion } = JSON.parse(fs.readFileSync(tracksPath({ home }), "utf8"));
  assert.strictEqual(secondOpinion.incidents, 1);
  assert.strictEqual(secondOpinion.learnerExactAiMissed, 1);
});

test("resolve without an ai prediction says there is no second opinion", () => {
  const dir = project();
  const home = tmpHome();
  capture(() => breakCommand({ dir, home, random: FIRST }));
  writeFile(dir, "src/a.js", "function isReady() {\n  return true;\n}\n\nmodule.exports = { isReady };\n");

  const out = capture(() => resolveCommand({ dir, home }));

  assert.match(out, /pas de second avis/);
  assert.strictEqual(JSON.parse(fs.readFileSync(tracksPath({ home }), "utf8")).secondOpinion, undefined);
});

test("giveup shows both comparisons but records no second opinion", () => {
  const dir = project();
  const home = tmpHome();
  capture(() => breakCommand({ dir, home, random: FIRST }));
  const { config } = readProgress(dir);
  recordPrediction(dir, config, { phaseId: 0, type: "debug", prediction: "ici", file: "src/zzz.js", line: 1 });
  recordPrediction(dir, config, { phaseId: 0, type: "debug", by: "ia", prediction: "là", file: "src/a.js", line: 2 });

  const out = capture(() => giveupCommand({ dir, home }));

  assert.match(out, /Ta prédiction : manqué/);
  assert.match(out, /Second avis de l'IA : exact/);
  assert.ok(!fs.existsSync(tracksPath({ home })));
});

test("giveup restores the original and saves the learner version", () => {
  const dir = project();
  const home = tmpHome();
  const original = fs.readFileSync(path.join(dir, "src/a.js"), "utf8");
  capture(() => breakCommand({ dir, home, random: FIRST }));
  writeFile(dir, "src/a.js", "// ma tentative\nmodule.exports = {};\n");

  capture(() => giveupCommand({ dir, home }));

  assert.strictEqual(fs.readFileSync(path.join(dir, "src/a.js"), "utf8"), original);
  assert.strictEqual(fs.readFileSync(path.join(dir, ".ai-learn", "incident-giveup", "src", "a.js"), "utf8"), "// ma tentative\nmodule.exports = {};\n");
  const incident = readIncident(dir);
  assert.strictEqual(incident.active, false);
  assert.strictEqual(incident.outcome, "abandon");
  assert.ok(!fs.existsSync(tracksPath({ home })), "aucun palier n'est atteint");
});

test("an orphan lock is repaired on the next command", () => {
  // Checkpoint insensible : le run suivant s'arrête sur « aucune panne détectable »
  // après avoir réparé, et laisse le fichier à son état d'origine.
  const dir = project({ checkpoint: 'node -e "require(\'./src/a.js\')"' });
  const original = fs.readFileSync(path.join(dir, "src/a.js"), "utf8");
  // État laissé par un `kill -9` en plein essai : fichier cassé + verrou.
  writeFile(dir, "src/a.js", original.replace("true", "false"));
  writeFile(dir, ".ai-learn/mutate.lock.json", JSON.stringify({ file: "src/a.js", original }));

  assert.throws(() => breakCommand({ dir, home: tmpHome(), random: FIRST }), /aucune panne détectable/);

  assert.strictEqual(fs.readFileSync(path.join(dir, "src/a.js"), "utf8"), original);
});

test("next reports an active incident before the next phase", () => {
  const dir = project({
    extra: {
      phases: [
        { id: 0, name: "Phase zero", status: "done", checkpoint: CHECKPOINT_A, artifacts: [], predictionsRequired: 0 },
        { id: 1, name: "Phase un", status: "pending", checkpoint: "node -e \"process.exit(0)\"", artifacts: [], predictionsRequired: 0 },
      ],
    },
  });
  const home = tmpHome();
  capture(() => breakCommand({ dir, home, random: FIRST }));

  const report = buildNextReport(dir);

  assert.strictEqual(report.incident.active, true);
  assert.strictEqual(report.next.id, 1);
});

test("a corrupted debug ledger is never overwritten", () => {
  const dir = project();
  const home = tmpHome();
  fs.mkdirSync(path.dirname(tracksPath({ home })), { recursive: true });
  fs.writeFileSync(tracksPath({ home }), "{ pas du json");
  capture(() => breakCommand({ dir, home, random: FIRST }));
  writeFile(dir, "src/a.js", "function isReady() {\n  return true;\n}\n\nmodule.exports = { isReady };\n");

  assert.throws(() => capture(() => resolveCommand({ dir, home })));
  assert.strictEqual(fs.readFileSync(tracksPath({ home }), "utf8"), "{ pas du json");
  assert.ok(readGitTracks({ home }).config === null);
});

test("check warns about an active incident instead of staying silent", () => {
  const { checkProject } = require("../bin/lib/check");
  const dir = project();
  capture(() => breakCommand({ dir, home: tmpHome(), random: FIRST }));

  const result = checkProject(dir);

  assert.ok(result.issues.warnings.some((w) => /code incident is active/.test(w.message)));
});

test("a prediction written as ./src/a.js is compared like src/a.js", () => {
  const dir = project({ checkpoint: CHECKPOINT_AB, files: twoFiles() });
  const home = tmpHome();
  capture(() => breakCommand({ dir, home, random: FIRST }));
  const { config } = readProgress(dir);
  recordPrediction(dir, config, { phaseId: 0, type: "debug", prediction: "b", file: "./src/a.js", line: 2 });
  writeFile(dir, "src/a.js", twoFiles()["src/a.js"]);
  const out = capture(() => resolveCommand({ dir, home }));
  assert.match(out, /exact/);
});

test("a fully recorded incident survives a stale lock (crash before the lock removal)", () => {
  const dir = project();
  const home = tmpHome();
  capture(() => breakCommand({ dir, home, random: FIRST }));
  const broken = fs.readFileSync(path.join(dir, "src/a.js"), "utf8");
  writeFile(dir, ".ai-learn/mutate.lock.json", JSON.stringify({ file: "src/a.js", original: "// x" }));

  assert.throws(() => breakCommand({ dir, home, random: FIRST }), /incident actif/);
  assert.strictEqual(fs.readFileSync(path.join(dir, "src/a.js"), "utf8"), broken);
  assert.ok(!fs.existsSync(mutateLockPath(dir)));
});

test("giveup never overwrites an earlier backup", () => {
  const dir = project();
  const home = tmpHome();
  capture(() => breakCommand({ dir, home, random: FIRST }));
  writeFile(dir, "src/a.js", "// v1\n");
  capture(() => giveupCommand({ dir, home }));
  const saved = path.join(dir, ".ai-learn", "incident-giveup", "src", "a.js");
  assert.strictEqual(fs.readFileSync(saved, "utf8"), "// v1\n");
});

const AWAIT_SOURCES = {
  "src/a.js":
    "async function f() {\n  return true;\n}\n\nasync function isReady() {\n  const r = await f();\n  return r === true;\n}\n\nmodule.exports = { isReady };\n",
};
const CHECKPOINT_AWAIT = "node -e \"require('./src/a.js').isReady().then((v) => { if (v !== true) process.exit(1) })\"";

test("break injects a semantic fault and keeps the site secret", () => {
  const dir = project({ checkpoint: CHECKPOINT_AWAIT, files: AWAIT_SOURCES });
  const out = capture(() => breakCommand({ dir, level: 1, home: tmpHome(), random: FIRST }));

  assert.match(fs.readFileSync(path.join(dir, "src/a.js"), "utf8"), /const r = f\(\);/);
  assert.ok(!out.includes("await"), "the output must not reveal the fault");
  assert.ok(!out.includes("a.js:"), "the output must not reveal the site");
});

test("break falls back to mutators when no semantic site is detectable", () => {
  const dir = project();
  const home = tmpHome();

  capture(() => breakCommand({ dir, level: 1, home, random: FIRST }));

  assert.strictEqual(readIncident(dir, { home }).active, true);
  assert.match(fs.readFileSync(path.join(dir, "src/a.js"), "utf8"), /return false;/);
});

test("resolve names the fault mechanism", () => {
  const dir = project({ checkpoint: CHECKPOINT_AWAIT, files: AWAIT_SOURCES });
  const home = tmpHome();

  capture(() => breakCommand({ dir, level: 1, home, random: FIRST }));
  fs.writeFileSync(path.join(dir, "src/a.js"), AWAIT_SOURCES["src/a.js"]);
  const out = capture(() => resolveCommand({ dir, home }));

  assert.match(out, /await oublié/);
  assert.match(out, /promesse au lieu de sa valeur/);
});

test("giveup names the fault mechanism too", () => {
  const dir = project({ checkpoint: CHECKPOINT_AWAIT, files: AWAIT_SOURCES });
  const home = tmpHome();

  capture(() => breakCommand({ dir, level: 1, home, random: FIRST }));

  assert.match(capture(() => giveupCommand({ dir, home })), /await oublié/);
});

test("a pack without faults behaves as before", () => {
  const dir = project();

  assert.deepStrictEqual(findAllSites(dir, { bank: "faults" }), []);
});

test("a fault whose rewrite would not parse is rejected when drawn", () => {
  const { breaksSyntax } = require("../bin/lib/mutate");
  const original = "function f() {\n  foo();\n}\n";
  const site = { index: 15, length: 3, matchedText: "foo", mutate: () => "(" };

  assert.strictEqual(breaksSyntax(".js", original, site), true);
  assert.strictEqual(breaksSyntax(".js", original, { ...site, mutate: () => "bar" }), false);
  assert.strictEqual(breaksSyntax(".ts", original, site), false, "TypeScript is not parse-gated");
});

test("a release under a control header is rejected, one after a statement is not", () => {
  const dir = project({
    files: {
      "src/a.js": "function f(c, err) {\n  if (err)\n    c.release();\n  return 1;\n}\nfunction g(c) {\n  work();\n  c.release();\n}\n",
    },
  });
  const sites = findAllSites(dir, { bank: "faults" }).filter((s) => s.operator === "release-removal");

  assert.deepStrictEqual(sites.map((s) => s.rejects()), [true, false]);
});

test("throw-to-return is not drawn in ES modules", () => {
  const dir = project({ files: { "src/a.js": "import x from 'y';\nif (!x) {\n  throw new Error('no');\n}\n" } });

  assert.deepStrictEqual(findAllSites(dir, { bank: "faults" }), []);
});

test("gating a large file with many sites stays fast", () => {
  const body = Array.from({ length: 3000 }, (_, i) => `  const v${i} = a && b;`).join("\n");
  const dir = project({ files: { "src/a.js": `function f(a, b) {\n${body}\n}\n` } });
  const started = Date.now();
  const sites = findAllSites(dir, { bank: "faults" });

  assert.ok(sites.length >= 3000);
  assert.ok(Date.now() - started < 2000, "listing sites must not parse the file per site");
});

test("prose-prone faults are not drawn from JSX files", () => {
  const dir = project({ files: { "src/a.jsx": "export const A = () => <p>Please await   confirmation</p>;\n" } });

  assert.deepStrictEqual(findAllSites(dir, { bank: "faults" }), []);
});

test("throw-to-return is never drawn in an .mjs file, even without import/export", () => {
  const dir = project({ files: { "src/a.mjs": "if (!x) {\n  throw new Error('no');\n}\nawait go();\n" } });

  assert.deepStrictEqual(findAllSites(dir, { bank: "faults" }).filter((site) => site.operator === "throw-to-return"), []);
});

test("throw-to-return is not drawn in TypeScript files", () => {
  const dir = project({ files: { "src/a.ts": "export function f(x: number): number {\n  if (!x) {\n    throw new Error('no');\n  }\n  return x;\n}\n" } });

  assert.deepStrictEqual(findAllSites(dir, { bank: "faults" }).filter((s) => s.operator === "throw-to-return"), []);
});

test("break falls back to mutators when every semantic site is rejected", () => {
  const dir = project({
    files: { "src/a.js": "function isReady(c, err) {\n  if (err)\n    c.release();\n  return true;\n}\n\nmodule.exports = { isReady };\n" },
  });
  const home = tmpHome();

  capture(() => breakCommand({ dir, level: 1, home, random: FIRST }));

  assert.match(fs.readFileSync(path.join(dir, "src/a.js"), "utf8"), /return false;/);
  assert.match(fs.readFileSync(path.join(dir, "src/a.js"), "utf8"), /c\.release\(\)/);
});
