"use strict";

// The learner profile (story 10.02): `~/.ai-learn/profile.json` says once what
// the learner aims at (goals, daily time, technologies to favour / postpone /
// avoid, real projects for transfer exercises). Home-scoped, never in a repo.
// Written only by the CLI (`ai-learn profile set`), like the ledgers; a missing
// file never blocks anything.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { writeLedgerFile } = require("./tracks/store");
const { log, fail } = require("./util");

const VERSION = 1;
const MAX_ENTRIES = 20;
const TOP_FIELDS = ["version", "updatedAt", "goals", "dailyMinutes", "focus", "projects"];
const FOCUS_FIELDS = ["now", "later", "avoid"];

function profilePath({ home = os.homedir() } = {}) {
  return path.join(home, ".ai-learn", "profile.json");
}

function isText(value) {
  return typeof value === "string" && value.trim() !== "";
}

function listIssues(name, value, isItem, describe) {
  if (!Array.isArray(value)) {
    return [`${name} must be an array`];
  }

  if (value.length > MAX_ENTRIES) {
    return [`${name} holds at most ${MAX_ENTRIES} entries (got ${value.length})`];
  }

  const bad = value.findIndex((item) => !isItem(item));
  return bad === -1 ? [] : [`${name}[${bad}] must be ${describe}`];
}

function projectIssues(projects) {
  const issues = listIssues("projects", projects, (p) => p && typeof p === "object" && !Array.isArray(p), "an object");

  if (issues.length > 0) {
    return issues;
  }

  projects.forEach((project, index) => {
    for (const field of ["name", "summary"]) {
      if (!isText(project[field])) {
        issues.push(`projects[${index}].${field} must be a non-empty string`);
      }
    }

    for (const key of Object.keys(project).filter((k) => k !== "name" && k !== "summary")) {
      issues.push(`unknown field projects[${index}].${key}`);
    }
  });

  return issues;
}

function focusIssues(focus) {
  if (!focus || typeof focus !== "object" || Array.isArray(focus)) {
    return ["focus must be an object { now, later, avoid }"];
  }

  const issues = [];

  for (const field of FOCUS_FIELDS) {
    issues.push(...listIssues(`focus.${field}`, focus[field], isText, "a non-empty string"));
  }

  for (const key of Object.keys(focus).filter((k) => !FOCUS_FIELDS.includes(k))) {
    issues.push(`unknown field focus.${key}`);
  }

  return issues;
}

// `version` and `updatedAt` are stamped by `setProfile`; a stored file carries
// both, an input object may omit them.
function validateProfile(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return ["profile must be a JSON object"];
  }

  const issues = Object.keys(data)
    .filter((key) => !TOP_FIELDS.includes(key))
    .map((key) => `unknown field ${key}`);

  if ("version" in data && data.version !== VERSION) {
    issues.push(`version must be ${VERSION}`);
  }

  if ("updatedAt" in data && !isText(data.updatedAt)) {
    issues.push("updatedAt must be a non-empty string");
  }

  issues.push(...listIssues("goals", data.goals, isText, "a non-empty string"));

  if (!Number.isInteger(data.dailyMinutes) || data.dailyMinutes <= 0) {
    issues.push("dailyMinutes must be a positive integer");
  }

  issues.push(...focusIssues(data.focus), ...projectIssues(data.projects));
  return issues;
}

// Three states like tutor.json: missing (no issue), invalid, valid.
function readProfile({ home = os.homedir() } = {}) {
  const file = profilePath({ home });

  if (!fs.existsSync(file)) {
    return { exists: false, valid: false, profile: null, issues: [] };
  }

  let data;

  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return { exists: true, valid: false, profile: null, issues: [`profile.json is not valid JSON: ${error.message}`] };
  }

  const issues = validateProfile(data);
  return { exists: true, valid: issues.length === 0, profile: issues.length === 0 ? data : null, issues };
}

// Validates, then writes. Throws an Error naming every bad field and leaves an
// existing file untouched.
function setProfile(input, { home = os.homedir(), now = new Date() } = {}) {
  const issues = validateProfile(input);

  if (issues.length > 0) {
    throw new Error(`profil refusé : ${issues.join("; ")}`);
  }

  const profile = { ...input, version: VERSION, updatedAt: now.toISOString() };
  writeLedgerFile(profilePath({ home }), profile);
  return profile;
}

function profileCommand({ args, json, jsonValue, home }) {
  if (args[0] === "set") {
    let input;

    try {
      input = JSON.parse(jsonValue);
    } catch {
      fail("profile set exige --json '<objet>' (JSON valide)");
    }

    try {
      setProfile(input, { home });
    } catch (error) {
      fail(error.message);
    }

    log("Profil enregistré.");
    return;
  }

  const state = readProfile({ home });

  if (json) {
    log(JSON.stringify(state.exists ? { exists: true, valid: state.valid, profile: state.profile, issues: state.issues } : { exists: false }));
    return;
  }

  if (!state.exists) {
    log("Aucun profil.");
  } else if (!state.valid) {
    log(`Profil invalide : ${state.issues.join("; ")}`);
  } else {
    log(JSON.stringify(state.profile, null, 2));
  }
}

module.exports = { VERSION, profilePath, validateProfile, readProfile, setProfile, profileCommand };
