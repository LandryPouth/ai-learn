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

const COMMANDS = path.join(__dirname, "..", "commands");
const read = (...parts) => fs.readFileSync(path.join(COMMANDS, ...parts), "utf8");

test("learn routes to references and never asks the learner to type ai-learn", () => {
  const text = read("learn.md");

  for (const flow of ["scan", "propose", "docs"]) {
    assert.match(text, new RegExp(`references/${flow}\\.md`), `learn routes to references/${flow}.md`);
    assert.ok(fs.existsSync(path.join(COMMANDS, "references", `${flow}.md`)));
  }
  assert.match(text, /`ai-learn check`/);

  // Every `ai-learn …` the file mentions is something the agent runs, never
  // an instruction addressed to the learner.
  assert.doesNotMatch(text, /(tape|taper|lance[zs]?|exécute[zs]?)\s+(?:toi|vous)?[^.\n]*?l'apprenant[^.\n]*`ai-learn/i);
  assert.doesNotMatch(text, /l'apprenant peut (?:toujours )?lancer\s+`ai-learn/);
  assert.match(text, /l'apprenant n'a\s+aucune commande `ai-learn` à taper/);
  for (const retired of ["/learn-scan", "/learn-propose", "/learn-check", "/learn-docs"]) {
    assert.ok(!text.includes(retired), `learn.md no longer sends the learner to ${retired}`);
  }
});

test("learn gives an explicit technology priority over scan", () => {
  assert.match(read("learn.md"), /sa demande explicite l'emporte sur le scan/);
});

test("learn-next runs check silently and does not send the learner to /learn-check", () => {
  const text = read("learn-next.md");

  assert.match(text, /ai-learn check` en silence/);
  assert.ok(text.indexOf("ai-learn check") < text.indexOf("```bash\nai-learn next\n```"));
  assert.ok(!text.includes("/learn-check"));
});

test("the commands folder holds exactly the visible commands plus references", () => {
  assert.deepStrictEqual(
    fs.readdirSync(COMMANDS).sort(),
    ["learn-next.md", "learn-status.md", "learn.md", "references"],
  );
  assert.deepStrictEqual(fs.readdirSync(path.join(COMMANDS, "references")).sort(), ["check.md", "docs.md", "propose.md", "scan.md"]);
});

test("reference flows never send the learner to a retired slash command", () => {
  for (const name of fs.readdirSync(path.join(COMMANDS, "references"))) {
    const text = read("references", name);
    assert.doesNotMatch(text, /`\/learn-(scan|propose|check|docs)`/, `${name} names a retired command`);
  }
});
