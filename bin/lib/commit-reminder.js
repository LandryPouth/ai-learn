"use strict";

// The read-only "you have uncommitted work" nudge shared by `status` and
// `next`. `gitState` only ever runs `git status --porcelain` (see scan.js),
// so displaying this reminder never executes a git write command — the
// learner types the commit, the tool only suggests it (AGENTS.md §3bis).
// The command's explanation itself lives in `util.js#explainCommitCommand`,
// shared with `verify`'s phase closure so both surfaces say the same thing.

const { log, explainCommitCommand } = require("./util");
const { gitState } = require("./scan");

const STATUS_COMMIT_COMMAND = 'git add -A && git commit -m "feat: décrire le changement"';

function uncommittedCount(dir) {
  return gitState(dir).uncommitted;
}

function printCommitReminder(dir) {
  const uncommitted = uncommittedCount(dir);

  if (uncommitted === 0) {
    return;
  }

  log(`\nRappel — ${uncommitted} fichier(s) modifié(s) non commité(s).`);

  for (const line of explainCommitCommand(STATUS_COMMIT_COMMAND)) {
    log(line);
  }
}

module.exports = { uncommittedCount, printCommitReminder, STATUS_COMMIT_COMMAND };
