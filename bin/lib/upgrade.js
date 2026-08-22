"use strict";

// `ai-learn upgrade` — updates the globally-installed tool itself to the
// latest version. Distinct from `ai-learn update`, which propagates the
// current (already-installed) version's templates to existing learning
// projects — upgrade changes *which* version is installed in the first
// place.
//
// The package isn't published to the npm registry yet (only installable via
// `npm install -g github:LandryPouth/ai-learn`, see README), so that's the
// only real reinstall source today. If/when it is published, switch
// GITHUB_INSTALL_SPEC to the registry form (`@landry_pouth/ai-learn@latest`)
// in one place.
//
// A dev checkout (this repo cloned and symlinked via `ai-learn install
// claude`) must never be blown away by an npm reinstall — detected by the
// presence of `.git` at the package root, which npm always strips when
// packing a tarball (confirmed empirically: a real `npm install -g
// github:...` install has no .git anywhere under the installed package).

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { log } = require("./util");

const GITHUB_INSTALL_SPEC = "github:LandryPouth/ai-learn";
const PACKAGE_ROOT = path.join(__dirname, "..", "..");

function isDevInstall() {
  return fs.existsSync(path.join(PACKAGE_ROOT, ".git"));
}

function readVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8")).version;
  } catch {
    return null;
  }
}

function upgradeCommand() {
  if (isDevInstall()) {
    log(
      "Cette installation est un clone git (développement), pas un paquet npm — " +
        "`ai-learn upgrade` ne s'applique pas ici. Lance `git pull` dans " +
        `${PACKAGE_ROOT} pour mettre à jour.`,
    );
    return;
  }

  const before = readVersion();
  log(`Version actuelle : ${before || "inconnue"}`);
  log(`Réinstallation depuis ${GITHUB_INSTALL_SPEC}…`);

  try {
    execFileSync("npm", ["install", "-g", GITHUB_INSTALL_SPEC], { stdio: "inherit" });
  } catch (error) {
    log(`Échec de la mise à jour : ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const after = readVersion();

  if (after && after !== before) {
    log(`Mis à jour : ${before || "?"} → ${after}`);
  } else if (after) {
    log(`Déjà à jour (${after}).`);
  } else {
    log("Réinstallation terminée, version indéterminée — vérifie avec `ai-learn --version`.");
  }

  log("Note : ceci met à jour l'outil, pas les projets déjà scaffoldés. " + "Lance `ai-learn update --root <dir>` pour les resynchroniser.");
}

module.exports = { upgradeCommand, isDevInstall, GITHUB_INSTALL_SPEC };
