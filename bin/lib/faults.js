"use strict";

// Story 11.02 — semantic faults for `ai-learn break`: bugs that look like real
// ones (a forgotten `await`, a swallowed error) rather than a flipped literal.
// Same shape as a `MUTATION_OPERATORS` entry (`id`, `pattern`, `mutate`) plus
// `label` and `mechanism`, shown at the reveal. Line-by-line replacement on the
// whitened text, no AST: under-detect rather than guess. `mutate` never draws
// from this bank (a new operator there would turn proven phases red).

// A statement starts after `{` or `;`, or at a line start. `)` and `else` are
// left out on purpose: `if (x) client.release();` loses its body, and the next
// statement would silently become the `if` body. Whitespace runs are capped so
// the lookbehind stays linear on pathological lines.
const STATEMENT_START = String.raw`(?<=(?:^|[{;])[ \t]{0,200})`;
// Same, plus an indented line, a control header or `else` for `throw`: an
// unindented top-level `throw` in an ES module would become an illegal `return`.
const THROW_START = String.raw`(?<=(?:^[ \t]+|[{;]|\)|\belse)[ \t]{0,200})`;

// Limits of the line-by-line approach (documented, not guarded): a quote inside
// a regex literal can desynchronize the whitening in `stripStringsAndComments`,
// and JSX text is not whitened (`.jsx`/`.tsx` skip the prose-prone operators).

const FAULT_OPERATORS = {
  "await-removal": {
    id: "await-removal",
    label: "await oublié",
    mechanism: "Sans `await`, la fonction continue avec une promesse au lieu de sa valeur : les erreurs et l'ordre d'exécution lui échappent.",
    // Not a property (`x.await`), not `for await`, not an identifier call.
    pattern: /(?<![.\w$])(?<!\bfor[ \t]+)await[ \t]+(?![=,)(\[`+\-\/])/,
    mutate: () => "",
  },
  "throw-to-return": {
    id: "throw-to-return",
    label: "erreur avalée",
    mechanism: "Le `throw` est devenu un `return` : l'erreur disparaît et l'appelant continue comme si tout allait bien.",
    pattern: new RegExp(`${THROW_START}throw\\b[^;\\n{}]*;(?=[ \\t]*(?:\\}|$))`, "m"),
    mutate: () => "return;",
  },
  "release-removal": {
    id: "release-removal",
    label: "connexion jamais rendue",
    mechanism: "L'appel à `release()` a disparu : la connexion reste prise, le pool se vide et les requêtes suivantes attendent.",
    pattern: new RegExp(`${STATEMENT_START}(?:await[ \\t]+)?[\\w$.?]+\\.release\\(\\)(?![.(\\[]|[ \\t]*\\n[ \\t]*\\.)[ \\t]*;?`, "m"),
    mutate: () => "",
  },
  "logical-operator": {
    id: "logical-operator",
    label: "&& pris pour ||",
    mechanism: "Une condition `&&` devient `||` (ou l'inverse) : elle est vraie ou fausse dans des cas que personne n'a prévus.",
    pattern: /&&(?!=)|\|\|(?!=)/,
    mutate: (text) => (text === "&&" ? "||" : "&&"),
  },
  "nullish-to-or": {
    id: "nullish-to-or",
    label: "?? remplacé par ||",
    mechanism: "`||` écarte aussi `0` et `\"\"` : une valeur légitime est remplacée par la valeur par défaut.",
    pattern: /\?\?(?!=)/,
    mutate: () => "||",
  },
};

// Operators a stack pack selects through its `faults` id list; an unknown id
// is dropped, like `mutators`.
function resolveFaults(ids) {
  return (Array.isArray(ids) ? ids : []).map((id) => FAULT_OPERATORS[id]).filter(Boolean);
}

// Story 11.04 — rewrites with no expected effect, the filler commits of a
// `break --bisect` history. Operands are plain identifiers or numbers (strings
// are whitened in the text the patterns run on). Neutrality is not assumed:
// the caller proves each one by running the checkpoints after applying it.
const OPERAND = String.raw`(?:[A-Za-z_$][\w$]*|\d+)`;
// Not preceded by a prefix operator, a member access or a keyword that would
// bind tighter than `===` (`!a === b` is not `!b === a`).
const OPERAND_START = String.raw`(?<![\w$.!~+\-*/%<>&|^=]|\b(?:typeof|void|await|new|delete|in|instanceof)[ \t]+)`;

const NEUTRAL_TRANSFORMS = {
  "equality-operand-swap": {
    id: "equality-operand-swap",
    label: "opérandes d'égalité inversés",
    mechanism: "`a === b` et `b === a` sont équivalents : un commit qui ne change rien.",
    pattern: new RegExp(`${OPERAND_START}${OPERAND}[ \\t]*(?:===|!==)[ \\t]*${OPERAND}(?![\\w$.(\\[]|[ \\t]*(?:[-+*/%^&|<>]|\\b(?:in|instanceof)\\b))`),
    mutate: (text) => {
      const [, left, operator, right] = /^(\S+?)\s*(===|!==)\s*(\S+)$/.exec(text);
      return `${right} ${operator} ${left}`;
    },
  },
  "length-positive": {
    id: "length-positive",
    label: "test de longueur reformulé",
    mechanism: "`x.length > 0` et `x.length !== 0` sont équivalents pour une longueur : un commit qui ne change rien.",
    pattern: /(?<![\w$.!~+\-])[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.length[ \t]*>[ \t]*0(?![\w$.])/,
    mutate: (text) => text.replace(/>\s*0$/, "!== 0"),
  },
};

function resolveNeutral(ids) {
  return (Array.isArray(ids) ? ids : []).map((id) => NEUTRAL_TRANSFORMS[id]).filter(Boolean);
}

module.exports = { FAULT_OPERATORS, NEUTRAL_TRANSFORMS, resolveFaults, resolveNeutral };
