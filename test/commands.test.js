"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

test("learn-next runs update when outdated, before the rest", () => {
  const text = fs.readFileSync(path.join(__dirname, "..", "commands", "learn-next.md"), "utf8");
  const updateAt = text.indexOf("ai-learn update");

  assert.ok(updateAt > 0);
  assert.match(text, /`outdated` est `true`/);
  assert.ok(updateAt < text.indexOf("```bash\nai-learn next\n```"));
});
