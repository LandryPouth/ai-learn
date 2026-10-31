"use strict";

// Best-effort integration test against the real `opencode` binary, when one
// is available on PATH — skipped everywhere else (CI has no reason to have
// it installed). `opencode debug skill` lists the discovered skills without
// any model call, so this is safe to run unattended: it proves our generated
// SKILL.md files are actually discovered by OpenCode, not just correctly
// formatted on paper.

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("node:child_process");

const { installCommand } = require("../bin/lib/install");
const { capture, homeEnvOverrides } = require("./helpers");

function opencodeAvailable() {
  try {
    execFileSync("opencode", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

test("opencode actually discovers the skills ai-learn install generates", { skip: !opencodeAvailable() }, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-opencode-integration-"));
  capture(() => installCommand({ platform: "opencode", home }));

  const raw = execFileSync("opencode", ["debug", "skill"], {
    env: { ...process.env, ...homeEnvOverrides(home) },
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  const skills = JSON.parse(raw);
  assert.ok(Array.isArray(skills), "opencode debug skill did not return a JSON array");
  const byName = new Map(skills.map((skill) => [skill.name, skill]));

  for (const name of [
    "learn",
    "learn-next",
    "learn-status",
  ]) {
    assert.ok(byName.has(name), `opencode did not discover the ${name} skill`);
  }

  const learnNext = byName.get("learn-next");
  assert.match(learnNext.description, /Prochaine phase/);
  assert.strictEqual(
    learnNext.location,
    path.join(home, ".config", "opencode", "skills", "learn-next", "SKILL.md"),
  );
  for (const retired of ["learn-scan", "learn-propose", "learn-check", "learn-docs", "next", "status", "check", "docs", "scan", "propose"]) {
    assert.ok(!byName.has(retired), `opencode must not discover the retired ${retired} skill`);
  }
  for (const flow of ["scan", "propose", "check", "docs"]) {
    assert.ok(!byName.has(flow) && skills.every((skill) => !skill.location.includes(`${path.sep}references${path.sep}`)), `references/${flow}.md is not a skill`);
  }
  assert.strictEqual(byName.get("learn").name, "learn");
  assert.strictEqual(skills.filter((skill) => skill.name === "learn-next").length, 1, "no duplicate from external skill paths");
});
