"use strict";

// Shared citation primitives for the "presence + minimum substance, not truth"
// contract: a citation only counts when it resolves to something real and the
// surrounding text is more than a line stapled onto an empty file. Used by
// `check` for a tier-6 PR URL and for the dirigeant review's `file:line`.

const fs = require("fs");
const path = require("path");
const { normalizePortable } = require("./util");

const PR_URL_RE = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/;
// Accept both separators and Unicode path segments: a learner on Windows may
// paste `src\index.js:3`, and filenames are allowed to carry accents. A
// preceding separator is excluded from the leading match so an absolute
// Windows path (`C:\src\index.js`) is never mistaken for a relative one.
const FILE_LINE_RE =
  /(?:^|[^\p{L}\p{N}_./:\\-])((?:\.{0,2}[\\/])?(?:[\p{L}\p{N}_.-]+[\\/])*[\p{L}\p{N}_.-]+\.[\p{L}\p{N}]+):(\d+)\b/gu;

const MIN_CONTENT_BEYOND_CITATION = 200;

function contentBeyondCitation(content, citation) {
  return content
    .split("\n")
    .filter((line) => !line.includes(citation))
    .join("\n")
    .trim();
}

function hasSubstantialBody(content, citation) {
  return contentBeyondCitation(content, citation).length >= MIN_CONTENT_BEYOND_CITATION;
}

// The contract shared by every citation check: find a citation, then require
// enough non-citation content around it to refuse the degenerate case (an
// empty or hallucinated file with one source line appended).
function citesWithSubstance(content, findCitation) {
  const citation = findCitation(content);

  return citation !== null && hasSubstantialBody(content, citation);
}

function findPRUrl(content) {
  const match = content.match(PR_URL_RE);
  return match ? match[0] : null;
}

function citesRealPRUrl(content) {
  return citesWithSubstance(content, findPRUrl);
}

// A trailing newline terminates the last line, it does not open an extra one.
// Splitting on `\r?\n` naively counts the empty segment after it, which made
// `file:<last+1>` resolve for every normally-terminated file.
function countLines(text) {
  if (text.length === 0) {
    return 0;
  }

  return text.replace(/\r?\n$/, "").split(/\r?\n/).length;
}

function isInsideRoot(inside) {
  if (path.isAbsolute(inside)) {
    return false;
  }

  return inside !== ".." && !inside.startsWith(`..${path.sep}`);
}

// The first `file:line` in `content` that resolves to an existing file with
// that many lines, relative to `dir`. A citation outside `dir` is refused:
// the review is about this project's diff, not an arbitrary absolute path.
// `isAllowed` (optional) narrows the accepted files, e.g. to the guard's
// `implementationFiles` scope so the citation names a file the diff touched.
function findRealFileLine(content, dir, isAllowed) {
  // Fresh instance per call so the shared regex's `lastIndex` never leaks
  // between reviews; carry every flag (`u` is load-bearing for `\p{L}`).
  const re = new RegExp(FILE_LINE_RE.source, FILE_LINE_RE.flags);
  let match = re.exec(content);

  while (match) {
    const cited = match[1];
    const relative = cited.replace(/\\/g, "/");
    const line = Number(match[2]);
    const resolved = path.resolve(dir, relative);
    const inside = path.relative(dir, resolved);

    if (
      line >= 1 &&
      isInsideRoot(inside) &&
      (!isAllowed || isAllowed(normalizePortable(inside)))
    ) {
      try {
        // A symlink inside the project can point outside it: the lexical
        // check above does not follow links, so re-check on the real paths.
        if (!isInsideRoot(path.relative(fs.realpathSync(dir), fs.realpathSync(resolved)))) {
          throw new Error("symlink escapes the project root");
        }

        const text = fs.readFileSync(resolved, "utf8");

        if (line <= countLines(text)) {
          return `${cited}:${line}`;
        }
      } catch {
        // missing, unreadable or escaping file — try the next citation
      }
    }

    match = re.exec(content);
  }

  return null;
}

module.exports = {
  MIN_CONTENT_BEYOND_CITATION,
  citesRealPRUrl,
  citesWithSubstance,
  findRealFileLine,
  hasSubstantialBody,
};
