"use strict";

// Story 10.05 — incidents automatiques (`next --json` → incident.due) et pannes
// d'environnement (niveau 3). Vrais projets git temporaires, `home`, hasard et
// shell Docker injectés ; les processus de panne de port sont de vrais enfants.

const { test, beforeEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const { breakCommand, resolveCommand, giveupCommand, chooseLevel, incidentNotice, readIncident, incidentRecordPath } = require("../bin/lib/incident");
const { applicableFaults, stopRecordedProcess, isAlive } = require("../bin/lib/incidents/env");
const { buildNextReport } = require("../bin/lib/next");
const { defaultDebugTracks, tracksPath: debugTracksPath, readOrDefaultDebugTracks } = require("../bin/lib/tracks/debug");
const { defaultPlatformTracks, tracksPath: platformTracksPath } = require("../bin/lib/tracks/platform");
const { recordPrediction } = require("../bin/lib/predictions");
const { readProgress } = require("../bin/lib/progress");
const { capture, sampleProgress, tmpProject, writeFile, spawnGit } = require("./helpers");

beforeEach(() => {
  process.exitCode = 0;
});

const FIRST = () => 0;
const NO_DOCKER = () => ({ status: 1, stdout: "" });
const CODE_CHECKPOINT = "node -e \"const { isReady } = require('./src/a.js'); if (isReady() !== true) process.exit(1)\"";
const ENV_CHECKPOINT = "node -e \"if (!/^GREETING=hello\\s*$/m.test(require('fs').readFileSync('.env', 'utf8'))) process.exit(1)\"";
const A_JS = "function isReady() {\n  return true;\n}\n\nmodule.exports = { isReady };\n";

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-incident-env-home-"));
}

function git(dir, ...args) {
  const res = spawnGit(["-C", dir, ...args], { encoding: "utf8" });
  assert.strictEqual(res.status, 0, res.stderr);
}

function project({ checkpoint = CODE_CHECKPOINT, files = {} } = {}) {
  const dir = tmpProject(sampleProgress({ phases: [{ id: 0, name: "Phase zero", status: "done", checkpoint, artifacts: [], predictionsRequired: 0 }] }));
  const all = { "src/a.js": A_JS, ".gitignore": ".env\n.ai-learn/\n", "compose.yaml": "services: {}\n", ...files };

  for (const [rel, content] of Object.entries(all)) {
    writeFile(dir, rel, content);
  }

  git(dir, "init", "-q");
  git(dir, "add", "-A");
  git(dir, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init");
  return dir;
}

function prove(dir, at = new Date().toISOString()) {
  writeFile(dir, `.ai-learn/runs/${at.replace(/[:.]/g, "-")}-phase-0-verify.json`, JSON.stringify({ phaseId: 0, ok: true, generatedAt: at }));
}

function writeLedgers(home, { debug = [], platform = [] }) {
  const d = defaultDebugTracks();
  const p = defaultPlatformTracks();
  debug.forEach((tier) => (d.tiers[String(tier)].achieved = true));
  platform.forEach((tier) => (p.tiers[String(tier)].achieved = true));
  fs.mkdirSync(path.dirname(debugTracksPath({ home })), { recursive: true });
  fs.writeFileSync(debugTracksPath({ home }), JSON.stringify(d));
  fs.writeFileSync(platformTracksPath({ home }), JSON.stringify(p));
}

function freePort() {
  return new Promise((resolve) => {
    const server = net.createServer().listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function setChance(dir, chance) {
  writeFile(dir, ".ai-learn/tutor.json", JSON.stringify({ version: 1, assistance: "indices", proof: "explication", incidents: { chance } }));
}

// ---- next: incident.due ---------------------------------------------------

test("next offers an incident after a fresh proof", () => {
  const dir = project();
  const home = tmpHome();
  prove(dir);

  const report = buildNextReport(dir, { random: () => 0.1, home });

  assert.strictEqual(report.incident.due, true);
});

test("chance zero never offers an incident", () => {
  const dir = project();
  const home = tmpHome();
  setChance(dir, 0);
  prove(dir);

  assert.strictEqual(buildNextReport(dir, { random: () => 0, home }).incident.due, false);
});

test("one incident per proven phase", () => {
  const dir = project();
  const home = tmpHome();
  prove(dir, "2026-10-01T10:00:00.000Z");

  assert.strictEqual(buildNextReport(dir, { random: () => 0, home }).incident.due, true);
  assert.strictEqual(buildNextReport(dir, { random: () => 0, home }).incident.due, false);

  prove(dir, "2026-10-02T10:00:00.000Z");
  assert.strictEqual(buildNextReport(dir, { random: () => 0, home }).incident.due, true);
});

test("a roll above the chance is spent for that proof", () => {
  const dir = project();
  const home = tmpHome();
  prove(dir);

  assert.strictEqual(buildNextReport(dir, { random: () => 0.9, home }).incident.due, false);
  assert.strictEqual(buildNextReport(dir, { random: () => 0, home }).incident.due, false);
});

test("no incident is offered on a dirty tree, without proof, or while one is active", () => {
  const home = tmpHome();
  const dirty = project();
  prove(dirty);
  writeFile(dirty, "notes.txt", "x\n");
  assert.strictEqual(buildNextReport(dirty, { random: () => 0, home }).incident.due, false);

  const unproven = project();
  assert.strictEqual(buildNextReport(unproven, { random: () => 0, home }).incident.due, false);

  const active = project();
  prove(active);
  capture(() => breakCommand({ dir: active, home, random: FIRST }));
  assert.strictEqual(buildNextReport(active, { random: () => 0, home }).incident.due, false);
});

test("a skipped (dirty) moment does not burn the roll", () => {
  const dir = project();
  const home = tmpHome();
  prove(dir);
  writeFile(dir, "notes.txt", "x\n");
  buildNextReport(dir, { random: () => 0, home });
  fs.rmSync(path.join(dir, "notes.txt"));

  assert.strictEqual(buildNextReport(dir, { random: () => 0, home }).incident.due, true);
});

// ---- level choice ---------------------------------------------------------

test("level follows the debug and platform ledgers", () => {
  const home = tmpHome();
  assert.strictEqual(chooseLevel({ home }), 1);

  writeLedgers(home, { debug: [1] });
  assert.strictEqual(chooseLevel({ home }), 2);

  writeLedgers(home, { debug: [1, 2] });
  assert.strictEqual(chooseLevel({ home }), 2, "debug 2 sans palier plateforme 4 ou 6");

  writeLedgers(home, { debug: [1, 2], platform: [4] });
  assert.strictEqual(chooseLevel({ home }), 3);

  writeLedgers(home, { debug: [1, 2], platform: [6] });
  assert.strictEqual(chooseLevel({ home }), 3);

  writeLedgers(home, { debug: [1], platform: [4, 6] });
  assert.strictEqual(chooseLevel({ home }), 2);
});

test("an automatic incident at debug tier 1 is level 2", () => {
  const dir = project();
  const home = tmpHome();
  writeLedgers(home, { debug: [1] });

  capture(() => breakCommand({ dir, level: "auto", home, random: FIRST }));

  assert.strictEqual(readIncident(dir).level, 2);
});

// ---- environment faults ---------------------------------------------------

test("env fault round-trips the file byte for byte", () => {
  const original = "# config\r\nGREETING=hello\r\nOTHER=1\r\n";
  const dir = project({ checkpoint: ENV_CHECKPOINT });
  const home = tmpHome();
  fs.writeFileSync(path.join(dir, ".env"), original);

  const out = capture(() => breakCommand({ dir, level: 3, home, random: FIRST, shell: NO_DOCKER }));

  assert.notStrictEqual(fs.readFileSync(path.join(dir, ".env"), "utf8"), original);
  assert.strictEqual(readIncident(dir).level, 3);
  assert.ok(!out.includes("GREETING="), "la sortie ne révèle pas la variable");

  capture(() => giveupCommand({ dir, home, shell: NO_DOCKER }));

  assert.strictEqual(fs.readFileSync(path.join(dir, ".env"), "utf8"), original);
  assert.strictEqual(readIncident(dir).active, false);
});

test("env fault is not applicable when .env is tracked by git", () => {
  const dir = project({ files: { ".gitignore": ".ai-learn/\n", ".env": "GREETING=hello\n" } });

  assert.ok(!applicableFaults(dir, { shell: NO_DOCKER }).includes("env"));
});

test("a resolved env fault keeps the learner's own fix and reaches debug tier 4", () => {
  const dir = project({ checkpoint: ENV_CHECKPOINT });
  const home = tmpHome();
  fs.writeFileSync(path.join(dir, ".env"), "GREETING=hello\n");
  capture(() => breakCommand({ dir, level: 3, home, random: FIRST, shell: NO_DOCKER }));

  const { config } = readProgress(dir);
  recordPrediction(dir, config, { phaseId: 0, type: "debug", cause: "une variable d'environnement corrompue dans .env", prediction: "la valeur de GREETING a changé" });
  fs.writeFileSync(path.join(dir, ".env"), "GREETING=hello\n# fixed by hand\n");

  capture(() => resolveCommand({ dir, home, shell: NO_DOCKER }));

  assert.strictEqual(fs.readFileSync(path.join(dir, ".env"), "utf8"), "GREETING=hello\n# fixed by hand\n");
  const tiers = readOrDefaultDebugTracks({ home }).tiers;
  assert.ok(tiers["4"].achieved && tiers["3"].achieved, "panne d'environnement résolue, cause exacte");
});

test("a cause naming the wrong fault type is a miss and earns no tier 3", () => {
  const dir = project({ checkpoint: ENV_CHECKPOINT });
  const home = tmpHome();
  fs.writeFileSync(path.join(dir, ".env"), "GREETING=hello\n");
  capture(() => breakCommand({ dir, level: 3, home, random: FIRST, shell: NO_DOCKER }));
  const { config } = readProgress(dir);
  recordPrediction(dir, config, { phaseId: 0, type: "debug", cause: "le service est arrêté", prediction: "docker compose" });
  fs.writeFileSync(path.join(dir, ".env"), "GREETING=hello\n");

  capture(() => resolveCommand({ dir, home, shell: NO_DOCKER }));

  const tiers = readOrDefaultDebugTracks({ home }).tiers;
  assert.ok(tiers["4"].achieved);
  assert.strictEqual(tiers["3"].achieved, false);
});

test("port fault kills only the recorded pid", async () => {
  const port = await freePort();
  const checkpoint = `node -e "require('net').connect(${port}, '127.0.0.1').on('connect', () => process.exit(1)).on('error', () => process.exit(0))"`;
  const dir = project({ checkpoint });
  const home = tmpHome();
  fs.writeFileSync(path.join(dir, ".env"), `PORT=${port}\n`);
  const bystander = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });

  try {
    capture(() => breakCommand({ dir, level: 3, home, random: FIRST, shell: NO_DOCKER }));
    const record = JSON.parse(fs.readFileSync(incidentRecordPath(dir, { home }), "utf8"));

    assert.strictEqual(record.kind, "port");
    assert.ok(isAlive(record.pid));

    capture(() => giveupCommand({ dir, home, shell: NO_DOCKER }));

    assert.ok(!isAlive(record.pid), "le processus enregistré n'existe plus");
    assert.ok(isAlive(bystander.pid), "aucun autre processus n'a été tué");
    assert.strictEqual(fs.readFileSync(path.join(dir, ".env"), "utf8"), `PORT=${port}\n`);
  } finally {
    bystander.kill();
  }
});

test("stopRecordedProcess refuses a pid that is not ours and tolerates a dead one", () => {
  const stranger = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore" });

  try {
    assert.strictEqual(stopRecordedProcess({ pid: stranger.pid, port: 4242 }), "not-ours");
    assert.ok(isAlive(stranger.pid));
  } finally {
    stranger.kill();
  }

  assert.strictEqual(stopRecordedProcess({ pid: 2 ** 22 + 12345, port: 4242 }), "gone");
});

test("no applicable env fault falls back to level 2", () => {
  const dir = project();
  const home = tmpHome();

  const out = capture(() => breakCommand({ dir, level: 3, home, random: FIRST, shell: NO_DOCKER }));

  assert.strictEqual(readIncident(dir).level, 2);
  assert.match(out, /repli sur le niveau 2/);
});

test("service fault only when docker compose answers", () => {
  const dir = project();
  const answering = (cmd, args) => (args.includes("ps") ? { status: 0, stdout: "web\ndb\n" } : { status: 0, stdout: "" });

  assert.ok(!applicableFaults(dir, { shell: NO_DOCKER }).includes("service"));
  assert.ok(!applicableFaults(dir, { shell: () => ({ status: 0, stdout: "\n" }) }).includes("service"));
  assert.ok(applicableFaults(dir, { shell: answering }).includes("service"));
});

test("service fault stops one service and giveup starts it again", () => {
  const dir = project();
  const home = tmpHome();
  const calls = [];
  let running = true;
  const shell = (cmd, args) => {
    calls.push(args.join(" "));
    running = args.includes("stop") ? false : args.includes("start") ? true : running;
    return { status: 0, stdout: args.includes("ps") ? "web\n" : "" };
  };
  // Le checkpoint « tombe » exactement quand le service est arrêté.
  const execute = () => ({ ok: running, stdoutTail: "", stderrTail: running ? "" : "connection refused" });

  capture(() => breakCommand({ dir, level: 3, home, random: FIRST, shell, execute }));

  assert.ok(calls.includes("compose stop web"));
  assert.strictEqual(running, false);
  assert.strictEqual(readIncident(dir).level, 3);

  capture(() => giveupCommand({ dir, home, shell }));

  assert.ok(calls.includes("compose start web"));
  assert.strictEqual(running, true);
});

// ---- revue 10.05 ----------------------------------------------------------

test("a throwing checkpoint run leaves no service stopped", () => {
  const dir = project();
  const home = tmpHome();
  let running = true;
  const shell = (cmd, args) => {
    running = args.includes("stop") ? false : args.includes("start") ? true : running;
    return { status: 0, stdout: args.includes("ps") ? "web\n" : "" };
  };
  let calls = 0;
  const execute = () => {
    calls += 1;
    if (calls > 1) {
      throw new Error("boom");
    }
    return { ok: true, stdoutTail: "", stderrTail: "" };
  };

  assert.throws(() => breakCommand({ dir, level: 3, home, random: FIRST, shell, execute }), /boom/);
  assert.strictEqual(running, true);
});

test("a failed service restart keeps the incident active", () => {
  const dir = project();
  const home = tmpHome();
  let failStart = false;
  let running = true;
  const shell = (cmd, args) => {
    if (args.includes("start") && failStart) {
      return { status: 1, stdout: "" };
    }
    running = args.includes("stop") ? false : args.includes("start") ? true : running;
    return { status: 0, stdout: args.includes("ps") ? "web\n" : "" };
  };
  const execute = () => ({ ok: running, stdoutTail: "", stderrTail: "down" });
  capture(() => breakCommand({ dir, level: 3, home, random: FIRST, shell, execute }));
  failStart = true;

  assert.throws(() => giveupCommand({ dir, home, shell }), /Impossible de rétablir/);
  assert.strictEqual(readIncident(dir).active, true);
});

test("the notice of a level-3 incident asks for a cause, not a file and line", () => {
  const dir = project({ checkpoint: ENV_CHECKPOINT });
  fs.writeFileSync(path.join(dir, ".env"), "GREETING=hello\n");
  capture(() => breakCommand({ dir, level: 3, home: tmpHome(), random: FIRST, shell: NO_DOCKER }));

  assert.match(incidentNotice(dir), /--cause/);
});

test("giveup keeps the permissions of a 0600 .env and its secret record is private", () => {
  const dir = project({ checkpoint: ENV_CHECKPOINT });
  const home = tmpHome();
  fs.writeFileSync(path.join(dir, ".env"), "GREETING=hello\n", { mode: 0o600 });
  capture(() => breakCommand({ dir, level: 3, home, random: FIRST, shell: NO_DOCKER }));

  assert.strictEqual(fs.statSync(incidentRecordPath(dir, { home })).mode & 0o777, 0o600);
  capture(() => giveupCommand({ dir, home, shell: NO_DOCKER }));
  assert.strictEqual(fs.statSync(path.join(dir, ".env")).mode & 0o777, 0o600);
});

// ---- revue 10.05 : risques résiduels ---------------------------------------

test("a service fault needs a compose file in the project itself", () => {
  const dir = project();
  const answering = () => ({ status: 0, stdout: "web\n" });

  assert.ok(applicableFaults(dir, { shell: answering }).includes("service"));

  fs.rmSync(path.join(dir, "compose.yaml"));

  assert.ok(!applicableFaults(dir, { shell: answering }).includes("service"));
});

test("a non-UTF-8 .env comes back byte for byte after giveup", () => {
  const bytes = Buffer.concat([Buffer.from("GREETING=hello\nNAME=caf"), Buffer.from([0xe9, 0xff]), Buffer.from("\n")]);
  const dir = project({ checkpoint: ENV_CHECKPOINT });
  const home = tmpHome();
  fs.writeFileSync(path.join(dir, ".env"), bytes);

  capture(() => breakCommand({ dir, level: 3, home, random: FIRST, shell: NO_DOCKER }));
  assert.notDeepStrictEqual(fs.readFileSync(path.join(dir, ".env")), bytes);

  capture(() => giveupCommand({ dir, home }));

  assert.deepStrictEqual(fs.readFileSync(path.join(dir, ".env")), bytes);
});

test("a crash after a service fault is undone by the next command", () => {
  const dir = project();
  const home = tmpHome();
  const calls = [];
  const shell = (cmd, args) => {
    calls.push(args.join(" "));
    return { status: 0, stdout: "" };
  };
  // Run interrupted: only the lock is left behind.
  writeFile(dir, ".ai-learn/env-fault.lock.json", JSON.stringify({ kind: "service", service: "web" }));

  capture(() => breakCommand({ dir, level: 1, home, random: FIRST, shell }));

  assert.ok(calls.includes("compose start web"));
  assert.ok(!fs.existsSync(path.join(dir, ".ai-learn", "env-fault.lock.json")));
});

test("a crash after a port fault stops only the recorded listener", async () => {
  const dir = project();
  const home = tmpHome();
  const port = await freePort();
  const { PORT_MARKER } = require("../bin/lib/incidents/env");
  const listener = spawn(process.execPath, ["-e", "require('net').createServer().listen(Number(process.argv[2]))", PORT_MARKER, String(port)], { stdio: "ignore" });
  await new Promise((resolve) => setTimeout(resolve, 300));
  writeFile(dir, ".ai-learn/env-fault.lock.json", JSON.stringify({ kind: "port", pid: listener.pid, port }));

  capture(() => breakCommand({ dir, level: 1, home, random: FIRST, shell: NO_DOCKER }));
  await new Promise((resolve) => setTimeout(resolve, 200));

  assert.ok(!isAlive(listener.pid));
});
