"use strict";

// Best-effort integration test against the real `opencode` binary, when one
// is available on PATH — skipped everywhere else (CI has no reason to have
// it installed). `opencode debug config` resolves the final config without
// any model call, so this is safe to run unattended: it proves our generated
// commands are actually discovered by OpenCode, not just correctly formatted
// on paper.

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

test("opencode actually discovers the commands ai-learn install generates", { skip: !opencodeAvailable() }, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-opencode-integration-"));
  capture(() => installCommand({ platform: "opencode", home }));

  const raw = execFileSync("opencode", ["debug", "config"], {
    env: { ...process.env, ...homeEnvOverrides(home) },
    encoding: "utf8",
  });
  const config = JSON.parse(raw);

  assert.ok(config.command, "opencode resolved no \"command\" key at all");
  assert.strictEqual(Object.keys(config.command).length, 7);
  assert.ok(config.command["ai-learn/next"]);
  assert.match(config.command["ai-learn/next"].description, /Prochaine phase/);
  assert.match(config.command["ai-learn/next"].template, /ai-learn next/);
});
