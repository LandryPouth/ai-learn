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

// Sentences that mention an `ai-learn <sub>` command and make the learner the
// one who runs it (tape, lance, doit, peut…, "demande à l'apprenant de…").
// A negation ("n'a aucune commande", "jamais") exempts the sentence.
const LEARNER_ACTS = /l['’]apprenant\s+(?:[^.\n]*?\b)?(?:peut|doit|devra|devrait|tape|taper|lance|lancer|exécute|exécuter|saisit|saisir|utilise|utiliser)\b|(?:demande|dis|invite|propose)[^.\n]*?à l['’]apprenant\s+de\b|\b(?:tape[zs]?|lance[zs]?|exécute[zs]?)\s+`ai-learn[^`]*`[^.]*?\bterminal/i;
const NEGATED = /n['’]a\s+(?:aucune|pas|rien)|sans\s+(?:qu['’]il|lui\s+demander)|jamais/i;

function learnerAddressedCommands(text) {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " "))
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?])\s+/))
    .filter((sentence) => /`ai-learn[\s`]/.test(sentence))
    .filter((sentence) => LEARNER_ACTS.test(sentence) && !NEGATED.test(sentence));
}

test("the learner-addressed detector catches the phrasings it guards against", () => {
  for (const bad of [
    "L'apprenant peut toujours lancer `ai-learn install codex` plus tard.",
    "Demande à l'apprenant de taper `ai-learn check`.",
    "L'apprenant doit exécuter `ai-learn verify 1`.",
    "Tape `ai-learn next` dans ton terminal.",
  ]) {
    assert.strictEqual(learnerAddressedCommands(bad).length, 1, bad);
  }
  assert.deepStrictEqual(learnerAddressedCommands("Lance `ai-learn check` toi-même, en silence."), []);
  assert.deepStrictEqual(learnerAddressedCommands("L'apprenant n'a aucune commande `ai-learn` à taper."), []);
});

test("learn routes to references and never asks the learner to type ai-learn", () => {
  const text = read("learn.md");

  for (const flow of ["scan", "propose", "docs"]) {
    assert.match(text, new RegExp(`references/${flow}\\.md`), `learn routes to references/${flow}.md`);
    assert.ok(fs.existsSync(path.join(COMMANDS, "references", `${flow}.md`)));
  }
  assert.match(text, /`ai-learn check`/);

  // Every `ai-learn …` the file mentions is something the agent runs, never
  // an instruction addressed to the learner.
  assert.deepStrictEqual(learnerAddressedCommands(text), []);
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
    assert.deepStrictEqual(learnerAddressedCommands(text), [], `${name} asks the learner to type ai-learn`);
  }
});

test("learn creates the profile once and never re-asks", () => {
  const text = read("learn.md");

  assert.match(text, /ai-learn profile --json/);
  assert.match(text, /ai-learn profile set/);
  assert.match(text, /une à la fois/);
  assert.match(text, /ne le redemande jamais/);
  assert.match(text, /mets à jour mon profil/);
  assert.deepStrictEqual(learnerAddressedCommands(text), []);
});

test("learn-next reads the profile to size the session and pick the transfer example", () => {
  const text = read("learn-next.md");

  assert.match(text, /ai-learn profile --json/);
  assert.match(text, /dailyMinutes/);
  assert.match(text, /projects\[\]/);
  assert.deepStrictEqual(learnerAddressedCommands(text), []);
});
