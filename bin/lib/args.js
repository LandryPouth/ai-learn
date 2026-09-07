"use strict";

// Shared CLI argument parser. The bug this replaces: extracting a positional
// argument with `args.find((arg) => !arg.startsWith("--"))` finds a flag's
// *value* before the real positional, because that heuristic has no idea
// which tokens were already consumed by a flag (`ai-learn verify --dir /tmp 0`
// resolved `/tmp` as the phase id). A declared list of which flags take a
// value — not a guess based on the following token's shape — is what lets a
// caller separate flag/value pairs from positionals correctly regardless of
// their order on the command line.

// Splits `args` into `{ flags, positionals }`. `valueFlags` names the flags
// that consume the next token as their value (also accepted as `--flag=value`,
// which any flag supports, listed or not). Every other `--flag` token is
// boolean: it does not consume the next token, matching the CLI's existing
// convention (used before this parser existed) so an unknown flag never eats
// an unrelated argument.
function parseArgs(args, { valueFlags = [] } = {}) {
  const valueFlagSet = new Set(valueFlags);
  const flags = {};
  const positionals = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const eq = arg.indexOf("=");

    if (eq !== -1) {
      flags[arg.slice(0, eq)] = arg.slice(eq + 1);
      continue;
    }

    if (valueFlagSet.has(arg)) {
      flags[arg] = i + 1 < args.length ? args[i + 1] : null;
      if (i + 1 < args.length) {
        i += 1; // consume the value so it never becomes a positional
      }
      continue;
    }

    flags[arg] = true;
  }

  return { flags, positionals };
}

module.exports = { parseArgs };
