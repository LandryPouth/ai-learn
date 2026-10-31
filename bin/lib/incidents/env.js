"use strict";

// The environment-fault bank of a level-3 incident (story 10.05). The fault is
// not in the learner's code but in what runs it: a corrupted `.env` value, a
// port held by a stray process, a stopped compose service. Each fault is
// reversible and carries what is needed to undo it in the secret record
// (`~/.ai-learn/incidents/`), never in the project.
//
// Safety rule: the only process this module ever stops is one it spawned,
// recognised by the pid it recorded AND the marker in that pid's command line.

const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { spawnGit } = require("../util");

const FAULT_TYPES = ["env", "port", "service"];
const PORT_MARKER = "ai-learn-port-fault";
const LISTEN_SCRIPT = "require('net').createServer().listen(Number(process.argv[2]))";
const PROBE_SCRIPT = "require('net').connect(Number(process.argv[1]),'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))";
const PROBE_ATTEMPTS = 30;
const PROBE_PAUSE_MS = 100;
const KILL_WAIT_MS = 2000;
const SHELL_TIMEOUT_MS = 30000;
const ENV_LINE = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;
const PORT_LINE = /^\s*(?:export\s+)?PORT\s*=\s*["']?(\d{1,5})["']?\s*$/m;

function defaultShell(cmd, args, { cwd } = {}) {
  const res = spawnSync(cmd, args, { cwd, encoding: "utf8", timeout: SHELL_TIMEOUT_MS });
  return { status: res.status === null ? 1 : res.status, stdout: res.stdout || "" };
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function envPath(dir) {
  return path.join(dir, ".env");
}

// `.env` is read and written as latin1 so any byte sequence (UTF-8 or not)
// comes back identical: the restore must be byte-for-byte.
function readEnv(dir) {
  return fs.readFileSync(envPath(dir), "latin1");
}

function writeEnv(dir, text) {
  fs.writeFileSync(envPath(dir), text, "latin1");
}

// A zombie (killed, not yet reaped by its parent) is gone for our purposes.
function isAlive(pid) {
  try {
    process.kill(pid, 0);
  } catch (error) {
    return error.code === "EPERM";
  }

  const state = spawnSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" });
  return !(state.status === 0 && state.stdout.trim().startsWith("Z"));
}

function commandLineOf(pid) {
  const res = spawnSync("ps", ["-o", "args=", "-p", String(pid)], { encoding: "utf8" });
  return res.status === 0 ? res.stdout.trim() : "";
}

function portAnswers(port) {
  return spawnSync(process.execPath, ["-e", PROBE_SCRIPT, String(port)]).status === 0;
}

function declaredPort(dir) {
  const match = PORT_LINE.exec(readEnv(dir));
  const port = match ? Number.parseInt(match[1], 10) : NaN;
  return port >= 1 && port <= 65535 ? port : null;
}

function envTrackedByGit(dir) {
  return spawnGit(["-C", dir, "ls-files", "--error-unmatch", ".env"], { encoding: "utf8" }).status === 0;
}

const COMPOSE_FILES = ["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"];

// `docker compose` walks up to parent directories; only a compose file in the
// project itself may put a service of ours at stake.
function runningServices(dir, shell) {
  if (!COMPOSE_FILES.some((f) => fs.existsSync(path.join(dir, f)))) {
    return [];
  }

  const res = shell("docker", ["compose", "ps", "--services", "--status", "running"], { cwd: dir });
  return res.status === 0 ? res.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
}

// Which fault types can be injected here, right now. Pure observation.
function applicableFaults(dir, { shell = defaultShell, platform = process.platform } = {}) {
  const found = [];
  const hasEnv = fs.existsSync(envPath(dir)) && !envTrackedByGit(dir);

  if (hasEnv && readEnv(dir).split(/\r?\n/).some((l) => ENV_LINE.test(l))) {
    found.push("env");
  }

  if (hasEnv && platform !== "win32" && declaredPort(dir) !== null && !portAnswers(declaredPort(dir))) {
    found.push("port");
  }

  if (runningServices(dir, shell).length > 0) {
    found.push("service");
  }

  return found;
}

function injectEnv(dir, random) {
  const original = readEnv(dir);
  const lines = original.split("\n");
  const indexes = lines.map((l, i) => (ENV_LINE.test(l.replace(/\r$/, "")) ? i : -1)).filter((i) => i >= 0);
  const index = indexes[Math.min(indexes.length - 1, Math.floor(random() * indexes.length))];
  const eol = lines[index].endsWith("\r") ? "\r" : "";
  const [, key, value] = ENV_LINE.exec(lines[index].replace(/\r$/, ""));
  lines[index] = `${key}=${value}_${Math.floor(random() * 0xffff).toString(16)}${eol}`;
  writeEnv(dir, lines.join("\n"));

  return { file: ".env", line: index + 1, original, operator: "variable-corrompue" };
}

function injectPort(dir, onRecord) {
  const port = declaredPort(dir);
  const child = spawn(process.execPath, ["-e", LISTEN_SCRIPT, PORT_MARKER, String(port)], { detached: true, stdio: "ignore" });
  child.unref();
  onRecord({ kind: "port", pid: child.pid, port });

  for (let attempt = 0; attempt < PROBE_ATTEMPTS; attempt += 1) {
    if (portAnswers(port) && isAlive(child.pid)) {
      return { pid: child.pid, port, operator: "port-occupe" };
    }
    sleep(PROBE_PAUSE_MS);
  }

  stopRecordedProcess({ pid: child.pid, port });
  return null;
}

function injectService(dir, shell, random, onRecord) {
  const services = runningServices(dir, shell);
  const service = services[Math.min(services.length - 1, Math.floor(random() * services.length))];

  onRecord({ kind: "service", service });

  if (shell("docker", ["compose", "stop", service], { cwd: dir }).status !== 0) {
    return null;
  }

  return { service, operator: "service-arrete" };
}

// Injects one fault of `type`; returns the fields to merge into the secret
// record, or null when the injection did not take.
function injectFault(type, dir, { random = Math.random, shell = defaultShell, onRecord = () => {} } = {}) {
  if (type === "env") {
    return injectEnv(dir, random);
  }

  if (type === "port") {
    return injectPort(dir, onRecord);
  }

  return injectService(dir, shell, random, onRecord);
}

// Stops the process we recorded, and only it. Returns what happened:
// `gone` (already dead — a reboot, or the learner stopped it), `stopped`, or
// `not-ours` (the pid now belongs to something else: left alone).
function stopRecordedProcess({ pid, port }) {
  if (!Number.isInteger(pid) || !isAlive(pid)) {
    return "gone";
  }

  const cmd = commandLineOf(pid);

  if (!cmd.includes(PORT_MARKER) || !cmd.includes(String(port))) {
    return "not-ours";
  }

  process.kill(pid, "SIGTERM");

  for (let waited = 0; waited < KILL_WAIT_MS && isAlive(pid); waited += PROBE_PAUSE_MS) {
    sleep(PROBE_PAUSE_MS);
  }

  if (isAlive(pid)) {
    process.kill(pid, "SIGKILL");
  }

  return "stopped";
}

// Undoes a fault from its secret record. `.env` is only rewritten when the
// learner has not already mended it (`keepFile`: leave the learner's own fix).
function restoreFault(record, dir, { shell = defaultShell, keepFile = false } = {}) {
  if (record.kind === "port") {
    return stopRecordedProcess(record);
  }

  if (record.kind === "service") {
    return shell("docker", ["compose", "start", record.service], { cwd: dir }).status === 0 ? "restarted" : "failed";
  }

  if (!keepFile) {
    writeEnv(dir, record.original);
  }

  return "restored";
}

module.exports = { FAULT_TYPES, PORT_MARKER, applicableFaults, injectFault, restoreFault, stopRecordedProcess, isAlive };
