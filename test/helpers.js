"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

function tmpProject(progress) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-test-"));
  fs.writeFileSync(path.join(dir, "progress.json"), `${JSON.stringify(progress, null, 2)}\n`);
  return dir;
}

function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

function capture(fn) {
  const writes = [];
  const original = process.stdout.write;

  process.stdout.write = (chunk, ...rest) => {
    writes.push(String(chunk));
    return true;
  };

  try {
    fn();
  } finally {
    process.stdout.write = original;
  }

  return writes.join("");
}

// os.homedir() reads USERPROFILE on Windows, not HOME — a test env override
// that sets only HOME silently fails to isolate the CLI there and it falls
// through to the real machine home directory. Set both everywhere a test
// redirects home, whether via a child-process env or an in-process mutation.
function homeEnvOverrides(home, extra = {}) {
  return { HOME: home, USERPROFILE: home, ...extra };
}

function sampleProgress(overrides = {}) {
  return {
    version: 1,
    project: "demo",
    technology: "Node",
    docSource: null,
    phases: [
      { id: 0, name: "Phase zero", status: "pending", checkpoint: "node -e \"process.exit(0)\"", artifacts: [], predictionsRequired: 0 },
    ],
    ...overrides,
  };
}

module.exports = { tmpProject, writeFile, capture, sampleProgress, homeEnvOverrides };
