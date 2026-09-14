#!/usr/bin/env node
//
// The two home-feed bodies are hidden when idle, never unmounted.
//
// Marketplace and Emplois are separate subtrees on one screen, and they used
// to be the two arms of a ternary. Tapping the chip therefore unmounted one
// and mounted the other inside the press handler. Measured on an S20 Ultra,
// six switches per configuration, `dumpsys gfxinfo`:
//
//   jobs -> Marketplace    150 + 600 + 650ms of frozen UI
//   Marketplace -> jobs    250-300ms
//   GPU throughout         2-3ms, i.e. entirely idle
//
// Replacing the marketplace subtree with an empty ScrollView removed every
// frame over 100ms, which is what proved the cost was mounting precisely
// that tree and nothing else on the screen. Rendering both and toggling
// `display: none` took the round trip from about 1.68s to about 0.52s.
//
// Two earlier attempts are recorded here because both looked right and
// neither survived measurement:
//
//   useDeferredValue on the chip key made it WORSE — 95th percentile 15ms ->
//   85ms. It renders the tree twice, and when the expense is mounting, you
//   pay twice; under Fabric the commit is on the UI thread anyway, so there
//   is no interruption to win.
//
//   initialNumToRender 10 -> 3 on all five rails changed nothing at all,
//   which is what ruled out the cards.
//
// So the property worth protecting is narrow and specific: neither body may
// go back to being a branch of a conditional. A future edit that "tidies"
// this into a ternary restores a 1.4s stall that nothing else would notice —
// no test fails, no error logs, the screen simply freezes on tap.
//
// Run: node scripts/check-feed-body-persistence.js

const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const FILE = path.join(root, "src", "screens", "ForYouScreen.js");
const source = stripComments(fs.readFileSync(FILE, "utf8"));

const failures = [];

// The style that keeps a mounted tree out of layout and drawing.
if (!/const HIDDEN_BODY = \{ display: "none" \}/.test(source)) {
  failures.push(
    'HIDDEN_BODY is gone from ForYouScreen — it is what lets a body stay ' +
      'mounted while taking no layout, and without it the only way to hide ' +
      'one is to unmount it',
  );
}

// Each body must READ that style rather than be conditionally rendered.
const BODIES = [
  ["the curated marketplace feed", /style=\{isDefaultBrowse \? undefined : HIDDEN_BODY\}/],
  [
    "the jobs body",
    /style=\{selectedChipKey === "jobs" \? undefined : HIDDEN_BODY\}/,
  ],
];
for (const [what, pattern] of BODIES) {
  if (!pattern.test(source)) {
    failures.push(
      `${what} no longer toggles HIDDEN_BODY (${pattern}). If it has gone ` +
        `back to being a branch of a ternary, tapping the chip unmounts and ` +
        `remounts it: 1.4s of frozen UI on the Marketplace side, measured, ` +
        `with an idle GPU`,
    );
  }
}

// And the ternary must not have come back. These are the exact two shapes
// that were there before, so they are the ones a tidy-up would reintroduce.
const REGRESSIONS = [
  [
    /\{isDefaultBrowse \? \(\s*<ScrollView/,
    "the marketplace feed is conditionally rendered again",
  ],
  [
    /\) : selectedChipKey === "jobs" \? \(\s*<ScrollView/,
    "the jobs body is back to being the middle arm of the ternary",
  ],
];
for (const [pattern, why] of REGRESSIONS) {
  if (pattern.test(source)) {
    failures.push(`${why} — that is the stall this file exists to prevent`);
  }
}

// Blindness guard: if the screen stops mentioning either flag, this check is
// reading something that no longer exists and would pass on anything.
for (const flag of ["isDefaultBrowse", "selectedChipKey"]) {
  if (!new RegExp(`\\b${flag}\\b`).test(source)) {
    failures.push(
      `ForYouScreen no longer mentions \`${flag}\` — this check cannot see ` +
        `what it is meant to guard`,
    );
  }
}

if (failures.length === 0) {
  console.log(
    "clean: both home-feed bodies stay mounted and hide with display:none",
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
