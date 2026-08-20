"use strict";

const path = require("path");

// Resolves a --dir / --root flag to an absolute path, defaulting to cwd.
function resolveDir(flagValue) {
  return path.resolve(process.cwd(), flagValue || ".");
}

module.exports = { resolveDir };
