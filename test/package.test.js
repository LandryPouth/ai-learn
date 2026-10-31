"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { spawnSync } = require("child_process");

test("the npm package ships commands/", () => {
  const result = spawnSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  assert.strictEqual(result.status, 0, result.stderr);
  const files = JSON.parse(result.stdout)[0].files.map((file) => file.path);
  assert.ok(files.includes("commands/learn.md"), files.join(", "));
});
