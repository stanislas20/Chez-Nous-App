// Remove comments from JS source, for the checks that match against it.
//
// Every guard here strips comments before looking, because more than one has
// read its own explanatory prose as the offence it was hunting for. They all
// did it with two regexes: blocks, then lines. That is wrong in a way that
// only shows up on real files.
//
// CreateListingScreen has this, in a // comment:
//
//     storage.rules requires contentType to match image/* or video/*
//
// Strip blocks first and that "/*" is an opening delimiter. The non-greedy
// match runs to the next "*/" and takes 45KB of real source with it —
// including, in the case that found this, the exact lines the check was
// looking for. It reported them missing. A check that says FAIL is assumed
// to have looked.
//
// Swapping the order only mirrors the bug: strip lines first and a "//"
// inside a block comment truncates it, leaving an unterminated "/*" that
// swallows everything up to the next one.
//
// So: one pass, left to right, which is what a comment actually is. Strings
// and template literals are tracked because "image/*" in a // comment is the
// benign version of this — "/*" inside a string literal is the same trap.
// Regex literals are not tracked; telling one from a division needs a
// parser, and no check here matches inside one.
function stripComments(source) {
  let out = "";
  let i = 0;
  let quote = null; // the character that closes the string we are inside

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (quote) {
      if (ch === "\\") {
        out += ch + (next ?? "");
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue; // the newline itself is kept by the next iteration
    }

    if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      // An unterminated block comment is the end of the file, not a licence
      // to keep going.
      if (end === -1) break;
      // Newlines are preserved so line numbers in any message still line up
      // with the file somebody is about to open.
      out += source.slice(i, end + 2).replace(/[^\n]/g, "");
      i = end + 2;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

module.exports = { stripComments };
