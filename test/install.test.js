"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { parseCommandFile, listCommandFiles, listCommands, listReferences, listLegacyCommands } = require("../bin/lib/platforms/commands");
const { parseSkillFrontmatter } = require("../bin/lib/platforms/skills");
const { renderLegacyCommand: renderClaudeLegacy } = require("../bin/lib/platforms/claude");
const { renderLegacyCommand: renderCodexLegacy } = require("../bin/lib/platforms/codex");
const { renderLegacyCommand: renderGeminiLegacy } = require("../bin/lib/platforms/gemini");
const { renderLegacyCommand: renderOpencodeLegacy } = require("../bin/lib/platforms/opencode");
const { installCommand, linkOrCopy, SKILL_DIRS, LEGACY_COMMAND_DIRS } = require("../bin/lib/install");
const { capture } = require("./helpers");

const COMMANDS_DIR = path.join(__dirname, "..", "commands");

const LEGACY_RENDERERS = {
  claude: { renderLegacyCommand: renderClaudeLegacy },
  codex: { renderLegacyCommand: renderCodexLegacy },
  gemini: { renderLegacyCommand: renderGeminiLegacy },
  opencode: { renderLegacyCommand: renderOpencodeLegacy },
};

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-install-"));
}

function commandByName(name) {
  return listLegacyCommands(COMMANDS_DIR).find((command) => command.name === name);
}

function skillFile(home, platform, name) {
  return path.join(SKILL_DIRS[platform](home), name, "SKILL.md");
}

function readSkill(home, platform, name) {
  const file = skillFile(home, platform, name);
  return { file, skill: parseSkillFrontmatter(fs.readFileSync(file, "utf8"), { file }) };
}

function writeClaudeCanonicalLink(home, command) {
  const dir = LEGACY_COMMAND_DIRS.claude(home);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${command.name}.md`);
  fs.symlinkSync(command.filePath, file);
  return file;
}

function writeLegacyFile(home, platform, command, { modified = false } = {}) {
  const dir = LEGACY_COMMAND_DIRS[platform](home);
  fs.mkdirSync(dir, { recursive: true });
  const legacy = LEGACY_RENDERERS[platform].renderLegacyCommand(command);
  const file = path.join(dir, legacy.filename);
  fs.writeFileSync(file, modified ? "modifié par l'utilisateur\n" : legacy.content);
  return file;
}

test("parseCommandFile reads frontmatter and body from a real command file", () => {
  const parsed = parseCommandFile(path.join(COMMANDS_DIR, "learn-next.md"));

  assert.strictEqual(parsed.name, "learn-next");
  assert.strictEqual(parsed.description, "Prochaine phase à faire");
  assert.strictEqual(parsed.argumentHint, "");
  assert.deepStrictEqual(parsed.allowedTools, ["Bash"]);
  assert.match(parsed.body, /ai-learn next/);
  assert.doesNotMatch(parsed.body, /^---/);
});

test("listCommandFiles finds the 4 visible source commands, references are not commands", () => {
  const files = listCommandFiles(COMMANDS_DIR);
  assert.deepStrictEqual(files.map((f) => path.basename(f)), ["learn-break.md", "learn-next.md", "learn-status.md", "learn.md"]);
  assert.deepStrictEqual(listReferences(COMMANDS_DIR).map((r) => r.name), ["check", "docs", "propose", "scan"]);
});

test("listCommands returns only the visible commands; legacy names are rebuilt for migration only", () => {
  assert.deepStrictEqual(listCommands(COMMANDS_DIR).map((c) => c.name).sort(), ["learn", "learn-break", "learn-next", "learn-status"]);

  const legacy = new Map(listLegacyCommands(COMMANDS_DIR).map((c) => [c.name, c]));
  for (const name of ["learn-scan", "learn-propose", "learn-check", "learn-docs", "next", "scan", "check"]) {
    assert.ok(legacy.has(name), `${name} is rebuilt for legacy migration`);
  }
  const alias = legacy.get("next");
  assert.strictEqual(alias.aliasOf, "learn-next");
  assert.ok(alias.body.endsWith(legacy.get("learn-next").body));
});

test("install claude and opencode produce a strict SKILL.md for every command", () => {
  for (const platform of ["claude", "opencode"]) {
    const home = tmpHome();
    capture(() => installCommand({ platform, home }));

    for (const command of listCommands(COMMANDS_DIR)) {
      const { file, skill } = readSkill(home, platform, command.name);

      assert.strictEqual(skill.name, command.name, `${platform}: ${command.name} name matches its directory`);
      assert.strictEqual(skill.description, command.description, `${platform}: ${command.name} description`);
      assert.strictEqual(skill.body, command.body, `${platform}: ${command.name} body is verbatim`);
      assert.ok(file.endsWith(path.join(command.name, "SKILL.md")));
    }
  }
});

test("install claude symlinks the binary and writes skills, idempotently", () => {
  const home = tmpHome();
  let first;
  capture(() => {
    first = installCommand({ platform: "claude", home });
  });

  const binLink = path.join(home, ".local", "bin", "ai-learn");
  assert.ok(fs.lstatSync(binLink).isSymbolicLink());
  assert.strictEqual(first.created.filter((file) => file.endsWith("SKILL.md")).length, 4);
  assert.ok(fs.existsSync(skillFile(home, "claude", "learn-next")));
  assert.ok(!fs.existsSync(skillFile(home, "claude", "next")));
  assert.ok(!fs.existsSync(path.join(home, ".claude", "commands")));

  const before = fs.statSync(skillFile(home, "claude", "learn-next")).mtimeMs;
  let second;
  const output = capture(() => {
    second = installCommand({ platform: "claude", home });
  });

  assert.strictEqual(second.created.length, 0);
  assert.strictEqual(second.removed.length, 0);
  assert.match(output, /already installed/);
  assert.strictEqual(fs.statSync(skillFile(home, "claude", "learn-next")).mtimeMs, before);
});

test("install claude migrates old command files and reports the removals", () => {
  const home = tmpHome();
  const canonical = commandByName("learn-next");
  const alias = commandByName("next");
  const link = writeClaudeCanonicalLink(home, canonical);
  const aliasFile = writeLegacyFile(home, "claude", alias);

  let result;
  const output = capture(() => {
    result = installCommand({ platform: "claude", home });
  });

  assert.deepStrictEqual([...result.removed].sort(), [aliasFile, link].sort());
  assert.ok(!fs.existsSync(link));
  assert.ok(!fs.existsSync(aliasFile));
  assert.ok(!fs.existsSync(path.dirname(link)), "the empty old commands directory is removed");
  assert.match(output, /Anciens fichiers de commande retirés/);
  assert.ok(fs.existsSync(skillFile(home, "claude", "learn-next")));
});

test("install claude keeps a user's own command at an old path and names it", () => {
  const home = tmpHome();
  const commandsDir = LEGACY_COMMAND_DIRS.claude(home);
  fs.mkdirSync(commandsDir, { recursive: true });
  const userFile = path.join(commandsDir, "status.md");
  fs.writeFileSync(userFile, "ma commande perso\n");

  let result;
  const output = capture(() => {
    result = installCommand({ platform: "claude", home });
  });

  assert.ok(result.kept.includes(userFile));
  assert.strictEqual(fs.readFileSync(userFile, "utf8"), "ma commande perso\n");
  assert.match(output, /Conservés/);
  assert.ok(output.includes(userFile));
  assert.ok(fs.existsSync(skillFile(home, "claude", "learn-status")));
});

test("unrelated user skill named check is untouched", () => {
  const home = tmpHome();
  const userSkill = skillFile(home, "claude", "check");
  fs.mkdirSync(path.dirname(userSkill), { recursive: true });
  const content = '---\nname: next\ndescription: "my own next"\n---\n# my own skill\n';
  fs.writeFileSync(userSkill, content);

  let result;
  const output = capture(() => {
    result = installCommand({ platform: "claude", home });
  });

  assert.strictEqual(fs.readFileSync(userSkill, "utf8"), content);
  assert.ok(!result.retired.includes(userSkill) && !result.keptModified.includes(userSkill));
  assert.ok(!output.includes(userSkill), "an unrelated skill is not even named");
  assert.ok(fs.existsSync(skillFile(home, "claude", "learn-next")));
});

test("install claude never writes through a learner symlink at a skill directory", () => {
  const home = tmpHome();
  const skillsDir = SKILL_DIRS.claude(home);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-outside-"));
  const outsideSkill = path.join(outside, "SKILL.md");
  fs.writeFileSync(outsideSkill, "fichier hors cible\n");
  fs.mkdirSync(skillsDir, { recursive: true });
  const linked = path.join(skillsDir, "next");
  fs.symlinkSync(outside, linked);

  let result;
  capture(() => {
    result = installCommand({ platform: "claude", home });
  });

  assert.ok(result.kept.includes(path.join(linked, "SKILL.md")));
  assert.strictEqual(fs.readFileSync(outsideSkill, "utf8"), "fichier hors cible\n");
  assert.ok(fs.lstatSync(linked).isSymbolicLink());
});

test("install claude replaces a pre-04.05 alias symlink instead of writing through it", () => {
  const home = tmpHome();
  const commandsDir = LEGACY_COMMAND_DIRS.claude(home);
  fs.mkdirSync(commandsDir, { recursive: true });

  // A project scaffolded before the rename: `next.md` is a symlink to the
  // canonical source, which story 04.05 moved to `learn-next.md`.
  const staleSource = path.join(COMMANDS_DIR, "next.md");
  const staleLink = path.join(commandsDir, "next.md");
  fs.symlinkSync(staleSource, staleLink);

  capture(() => installCommand({ platform: "claude", home }));

  assert.ok(!fs.existsSync(staleLink), "the stale symlink is removed");
  assert.ok(!fs.existsSync(staleSource), "removing the link does not resurrect the old source file");
  assert.ok(fs.existsSync(skillFile(home, "claude", "learn-next")));
  assert.ok(!fs.existsSync(skillFile(home, "claude", "next")));
});

test("install opencode migrates old commands, removes unmodified ones and keeps edited ones", () => {
  const home = tmpHome();
  const canonical = commandByName("learn-next");
  const modifiedCommand = commandByName("learn-status");
  const legacy = writeLegacyFile(home, "opencode", canonical);
  const modified = writeLegacyFile(home, "opencode", modifiedCommand, { modified: true });

  let result;
  const output = capture(() => {
    result = installCommand({ platform: "opencode", home });
  });

  assert.ok(result.removed.includes(legacy));
  assert.ok(result.kept.includes(modified));
  assert.ok(!fs.existsSync(legacy));
  assert.strictEqual(fs.readFileSync(modified, "utf8"), "modifié par l'utilisateur\n");
  assert.match(output, /Anciens fichiers de commande retirés/);
  assert.match(output, /Conservés/);
  assert.ok(output.includes(modified));
  assert.ok(fs.existsSync(skillFile(home, "opencode", "learn-next")));
});

test("install gemini and codex migrate their old command formats", () => {
  for (const platform of ["gemini", "codex"]) {
    const home = tmpHome();
    const canonical = commandByName("learn-next");
    const alias = commandByName("next");
    const legacy = writeLegacyFile(home, platform, canonical);
    const legacyAlias = writeLegacyFile(home, platform, alias);

    let result;
    capture(() => {
      result = installCommand({ platform, home });
    });

    assert.ok(result.removed.includes(legacy), `${platform}: canonical old file removed`);
    assert.ok(result.removed.includes(legacyAlias), `${platform}: alias old file removed`);
    assert.ok(!fs.existsSync(legacy));
    assert.ok(!fs.existsSync(legacyAlias));
    assert.ok(fs.existsSync(skillFile(home, platform, "ai-learn-learn-next")));
    assert.ok(!fs.existsSync(skillFile(home, platform, "ai-learn-next")), "no alias skill is installed");
  }
});

test("install is idempotent for opencode", () => {
  const home = tmpHome();
  capture(() => installCommand({ platform: "opencode", home }));
  const before = fs.readFileSync(skillFile(home, "opencode", "learn-next"), "utf8");

  let result;
  const output = capture(() => {
    result = installCommand({ platform: "opencode", home });
  });

  assert.strictEqual(result.created.length, 0);
  assert.strictEqual(result.removed.length, 0);
  assert.match(output, /already installed/);
  assert.strictEqual(fs.readFileSync(skillFile(home, "opencode", "learn-next"), "utf8"), before);
});

test("--dry-run writes and deletes nothing", () => {
  const home = tmpHome();
  const canonical = commandByName("learn-next");
  const legacy = writeLegacyFile(home, "opencode", canonical);

  let result;
  const output = capture(() => {
    result = installCommand({ platform: "opencode", home, dryRun: true });
  });

  assert.ok(result.created.length > 0);
  assert.ok(result.removed.includes(legacy));
  assert.ok(!fs.existsSync(SKILL_DIRS.opencode(home)));
  assert.ok(fs.existsSync(legacy));
  assert.match(output, /\[dry-run\]/);
});

test("--dry-run does not create the Claude binary link or skills", () => {
  const home = tmpHome();
  capture(() => installCommand({ platform: "claude", home, dryRun: true }));

  assert.ok(!fs.existsSync(path.join(home, ".local", "bin", "ai-learn")));
  assert.ok(!fs.existsSync(SKILL_DIRS.claude(home)));
});

test("install with no platform lists available platforms without writing anything", () => {
  const home = tmpHome();
  const output = capture(() => installCommand({ home }));

  assert.match(output, /claude/);
  assert.match(output, /codex/);
  assert.ok(!fs.existsSync(path.join(home, ".claude")));
  assert.ok(!fs.existsSync(path.join(home, ".codex")));
});

test("install refuses an unknown platform", () => {
  const home = tmpHome();
  assert.throws(() => installCommand({ platform: "nope", home }), /unknown platform "nope"/);
});

test("strict skill parser rejects an unquoted colon, a missing name and unknown fields", () => {
  assert.throws(
    () => parseSkillFrontmatter('---\nname: x\ndescription: a: b\n---\nbody\n'),
    /must be double-quoted/,
  );
  assert.throws(
    () => parseSkillFrontmatter('---\ndescription: "x"\n---\nbody\n'),
    /"name" is required/,
  );
  assert.throws(
    () => parseSkillFrontmatter('---\nname: X\ndescription: "x"\n---\nbody\n'),
    /lowercase/,
  );
  assert.throws(
    () => parseSkillFrontmatter('---\nname: x\nfoo: bar\ndescription: "x"\n---\nbody\n'),
    /unexpected frontmatter field "foo"/,
  );
});

test("linkOrCopy falls back to a real copy when symlinks are refused (Windows without Developer Mode)", () => {
  const home = tmpHome();
  const src = path.join(home, "source.txt");
  const dest = path.join(home, "dest.txt");
  fs.writeFileSync(src, "content");

  const original = fs.symlinkSync;
  fs.symlinkSync = () => {
    const error = new Error("operation not permitted");
    error.code = "EPERM";
    throw error;
  };

  try {
    linkOrCopy(src, dest);
  } finally {
    fs.symlinkSync = original;
  }

  assert.ok(!fs.lstatSync(dest).isSymbolicLink());
  assert.strictEqual(fs.readFileSync(dest, "utf8"), "content");
});

test("linkOrCopy re-throws errors unrelated to symlink permissions", () => {
  const home = tmpHome();
  const original = fs.symlinkSync;
  fs.symlinkSync = () => {
    throw new Error("disk full");
  };

  try {
    assert.throws(() => linkOrCopy(path.join(home, "a"), path.join(home, "b")), /disk full/);
  } finally {
    fs.symlinkSync = original;
  }
});

test("README documents the three commands and the removal of the old names", () => {
  const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");

  for (const name of ["learn", "learn-status", "learn-next", "learn-break"]) {
    assert.match(readme, new RegExp(`\`/${name}\``), `README lists /${name}`);
  }

  assert.match(readme, /n'existent plus/);
  assert.match(readme, /conservé \(modifié\)/);
});

test("install claude backs up an edited skill that kept our header before rewriting it", () => {
  const home = tmpHome();
  capture(() => installCommand({ platform: "claude", home }));
  const file = skillFile(home, "claude", "learn-next");
  const edited = `${fs.readFileSync(file, "utf8")}\nnote de l'apprenant\n`;
  fs.writeFileSync(file, edited);

  let result;
  capture(() => {
    result = installCommand({ platform: "claude", home });
  });

  assert.ok(result.backups.includes(`${file}.bak`));
  assert.strictEqual(fs.readFileSync(`${file}.bak`, "utf8"), edited);
  assert.notStrictEqual(fs.readFileSync(file, "utf8"), edited);
});

test("install claude removes a legacy symlink into a moved ai-learn checkout", () => {
  const home = tmpHome();
  const commandsDir = LEGACY_COMMAND_DIRS.claude(home);
  fs.mkdirSync(commandsDir, { recursive: true });
  const link = path.join(commandsDir, "learn-next.md");
  fs.symlinkSync("/old/place/ai-learn/commands/learn-next.md", link);

  let result;
  capture(() => {
    result = installCommand({ platform: "claude", home });
  });

  assert.ok(result.removed.includes(link));
  assert.ok(!fs.existsSync(link) && !(() => { try { fs.lstatSync(link); return true; } catch { return false; } })());
});

// --- Story 10.01: retiring the skills that used to be commands --------------

const { RETIRED_SKILLS } = require("../bin/lib/platforms/retired");
const { PLATFORMS } = require("../bin/lib/install");

// Writes a retired skill as it was published: the render of a pre-10.01 command
// by the platform's own adapter (the 08.03 shape, unchanged since).
// commands/ exactly as published at f1227fb (the last release before 10.01),
// kept as a fixture: learn-next.md has changed since, the published bytes have not.
const PUBLISHED_DIR = path.join(__dirname, "fixtures", "published-f1227fb");

function writePublishedRetired(home, platform, name) {
  const { renderCommand } = require(`../bin/lib/platforms/${platform}`);
  const source = listLegacyCommands(PUBLISHED_DIR).find((c) => c.name === name);
  const { filename, content } = renderCommand(source);
  const file = path.join(SKILL_DIRS[platform](home), filename);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

const RETIRED_NAMES = ["learn-scan", "learn-propose", "learn-check", "learn-docs", "next", "status", "check", "docs", "scan", "propose"];

test("fresh install writes only the visible skills and references", () => {
  for (const platform of Object.keys(PLATFORMS)) {
    const home = tmpHome();
    capture(() => installCommand({ platform, home }));

    const dir = SKILL_DIRS[platform](home);
    const prefix = platform === "claude" || platform === "opencode" ? "" : "ai-learn-";
    const skills = fs.readdirSync(dir).sort();

    assert.deepStrictEqual(skills, ["learn", "learn-break", "learn-next", "learn-status"].map((n) => `${prefix}${n}`).sort(), platform);

    const references = fs.readdirSync(path.join(dir, `${prefix}learn`, "references")).sort();
    assert.deepStrictEqual(references, ["check.md", "docs.md", "propose.md", "scan.md"], platform);
    assert.ok(!fs.existsSync(path.join(dir, `${prefix}learn-next`, "references")), "only learn carries references");

    const scan = fs.readFileSync(path.join(dir, `${prefix}learn`, "references", "scan.md"), "utf8");
    assert.ok(!scan.startsWith("---"), "a reference is a plain file, not a skill");
    assert.strictEqual(scan, listReferences(COMMANDS_DIR).find((r) => r.name === "scan").body);
  }
});

test("retired skills removed by published fingerprint, on every platform", () => {
  for (const platform of Object.keys(PLATFORMS)) {
    const home = tmpHome();
    const written = RETIRED_NAMES.map((name) => writePublishedRetired(home, platform, name));

    let result;
    const output = capture(() => {
      result = installCommand({ platform, home });
    });

    assert.deepStrictEqual([...result.retired].sort(), [...written].sort(), platform);
    for (const file of written) {
      assert.ok(!fs.existsSync(file), `${platform}: ${file} removed`);
      assert.ok(!fs.existsSync(path.dirname(file)), `${platform}: empty skill folder removed`);
    }
    assert.match(output, /Skills retirés/);
    assert.ok(output.includes(written[0]));
  }
});

test("every published fingerprint covers all four reference flows on all platforms", () => {
  for (const platform of Object.keys(PLATFORMS)) {
    const prefix = platform === "claude" || platform === "opencode" ? "" : "ai-learn-";
    const names = Object.keys(RETIRED_SKILLS[platform]).sort();
    assert.deepStrictEqual(names, RETIRED_NAMES.map((n) => `${prefix}${n}`).sort(), platform);
  }
});

test("modified retired skill is kept and named", () => {
  const home = tmpHome();
  const file = writePublishedRetired(home, "claude", "learn-scan");
  const edited = `${fs.readFileSync(file, "utf8")}\nMa note perso.\n`;
  fs.writeFileSync(file, edited);

  let result;
  const output = capture(() => {
    result = installCommand({ platform: "claude", home });
  });

  assert.deepStrictEqual(result.keptModified, [file]);
  assert.deepStrictEqual(result.retired, []);
  assert.strictEqual(fs.readFileSync(file, "utf8"), edited);
  assert.match(output, /conservé \(modifié\)/);
  assert.ok(output.includes(file));
});

test("a CRLF checkout of a published retired skill is still recognised", () => {
  const home = tmpHome();
  const file = writePublishedRetired(home, "claude", "learn-docs");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/\n/g, "\r\n"));

  let result;
  capture(() => {
    result = installCommand({ platform: "claude", home });
  });

  assert.deepStrictEqual(result.retired, [file]);
  assert.ok(!fs.existsSync(file));
});

test("dry-run lists retirements without touching disk", () => {
  const home = tmpHome();
  const file = writePublishedRetired(home, "opencode", "scan");

  let result;
  const output = capture(() => {
    result = installCommand({ platform: "opencode", home, dryRun: true });
  });

  assert.deepStrictEqual(result.retired, [file]);
  assert.ok(fs.existsSync(file), "the skill is still on disk");
  assert.match(output, /\[dry-run\] − /);
  assert.ok(!fs.existsSync(path.join(SKILL_DIRS.opencode(home), "learn")));
});

test("retirement is idempotent: a second install retires nothing", () => {
  const home = tmpHome();
  writePublishedRetired(home, "claude", "check");
  capture(() => installCommand({ platform: "claude", home }));

  let second;
  const output = capture(() => {
    second = installCommand({ platform: "claude", home });
  });

  assert.strictEqual(second.created.length, 0);
  assert.strictEqual(second.retired.length, 0);
  assert.match(output, /already installed/);
});

test("a retired skill folder that holds other files is emptied of SKILL.md only", () => {
  const home = tmpHome();
  const file = writePublishedRetired(home, "claude", "scan");
  const note = path.join(path.dirname(file), "mes-notes.md");
  fs.writeFileSync(note, "à moi\n");

  capture(() => installCommand({ platform: "claude", home }));

  assert.ok(!fs.existsSync(file));
  assert.strictEqual(fs.readFileSync(note, "utf8"), "à moi\n");
});

test("a learner symlink at a retired skill folder is never traversed or removed", () => {
  const home = tmpHome();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "ai-learn-retire-outside-"));
  const published = writePublishedRetired(home, "claude", "scan");
  fs.copyFileSync(published, path.join(outside, "SKILL.md"));
  fs.rmSync(path.dirname(published), { recursive: true });
  fs.symlinkSync(outside, path.dirname(published));

  capture(() => installCommand({ platform: "claude", home }));

  assert.ok(fs.lstatSync(path.dirname(published)).isSymbolicLink());
  assert.ok(fs.existsSync(path.join(outside, "SKILL.md")), "the target of the learner's link is untouched");
});

test("a learner-edited reference file is kept, an ours-but-stale one is refreshed", () => {
  const home = tmpHome();
  capture(() => installCommand({ platform: "claude", home }));
  const dir = path.join(SKILL_DIRS.claude(home), "learn", "references");

  fs.writeFileSync(path.join(dir, "scan.md"), "# Mes notes\n");
  fs.writeFileSync(path.join(dir, "check.md"), "# ai-learn: vieille version\n");

  let result;
  capture(() => {
    result = installCommand({ platform: "claude", home });
  });

  assert.strictEqual(fs.readFileSync(path.join(dir, "scan.md"), "utf8"), "# Mes notes\n");
  assert.ok(result.kept.includes(path.join(dir, "scan.md")));
  assert.strictEqual(
    fs.readFileSync(path.join(dir, "check.md"), "utf8"),
    listReferences(COMMANDS_DIR).find((r) => r.name === "check").body,
  );
});
