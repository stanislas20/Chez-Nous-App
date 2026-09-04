// A name sort that costs six seconds on the phone and nothing on a laptop.
//
// `a.localeCompare(b, "fr")` reads like the careful choice — it files
// "Ébène" where a French reader looks for it, which a byte comparison does
// not. Under Hermes on Android it also builds a collator, crosses into the
// platform's ICU and discards it again, on every comparison. Measured on a
// Galaxy, over the 737 names in the OSM hotel directory:
//
//   a.localeCompare(b, "fr")            6441 ms
//   the same sort immediately again     6303 ms   (not a warm-up)
//   new Intl.Collator("fr")                1 ms
//   the same sort through .compare        10 ms
//
// The Hôtels screen spent 6.7 of the 7.2 seconds it took to open inside
// one of these, on a blank screen, and the country picker 1.7 seconds over
// its 245 countries. Nothing reports it: on a Mac the same sort is 11 ms,
// so it cannot be found except on a real Android phone with a stopwatch.
//
// So src/ never calls localeCompare. It goes through src/utils/collate.js,
// which builds one collator per locale and keeps it. Same order, 630 times
// faster.
//
// scripts/ are exempt: they run on Node on a desktop, where this is free,
// and fetchOsmHotels.js sorting the directory once at generation time is
// exactly what lets the screen not sort it at all.
//
// Run: node scripts/check-collation.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const failures = [];
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

// Comments stripped: collate.js and the notes above the fixed call sites
// name localeCompare on purpose, to record what it cost.
const readCode = (rel) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");

const walk = (dir) =>
  fs
    .readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walk(`${dir}/${entry.name}`)
        : entry.name.endsWith(".js")
          ? [`${dir}/${entry.name}`]
          : [],
    );

const HELPER = "src/utils/collate.js";

for (const file of walk("src")) {
  if (file === HELPER) continue;
  if (/\.localeCompare\(/.test(readCode(file))) {
    failures.push(
      `${file} calls localeCompare directly — import compareNames or ` +
        `collate from utils/collate instead, which reuses one collator`,
    );
  }
}

// The helper has to actually be the fast thing, not a wrapper around the
// slow one.
const helper = readCode(HELPER);
if (!/new Intl\.Collator\(/.test(helper)) {
  failures.push(`${HELPER} does not build an Intl.Collator`);
}
if (!/collators\.set\(/.test(helper) || !/collators\.get\(/.test(helper)) {
  failures.push(
    `${HELPER} does not cache its collators — building one per call is the ` +
      `cost this whole file exists to avoid`,
  );
}
// A build without Intl must still sort accents correctly rather than
// falling back to a byte comparison, which files "Ébène" after "Zinsou".
if (!/localeCompare\(String\(b\), locale\)/.test(helper)) {
  failures.push(
    `${HELPER} has no correct fallback for a runtime without Intl`,
  );
}

// And the order it produces is the order localeCompare produced, so this
// was a speed change and not a behaviour change.
const collator = new Intl.Collator("fr");
const sample = [
  "Zinsou", "Ébène", "Abomey", "abomey", "Œuf", "Cotonou", "Étoile", "Ecole",
  "Hôtel du Lac", "Hotel de la Plage", "Auberge", "auberge Bénin",
];
const viaCollator = [...sample].sort(collator.compare);
const viaLocaleCompare = [...sample].sort((a, b) => a.localeCompare(b, "fr"));
if (JSON.stringify(viaCollator) !== JSON.stringify(viaLocaleCompare)) {
  failures.push(
    `the collator orders names differently from localeCompare — ` +
      `${viaCollator.join(",")} vs ${viaLocaleCompare.join(",")}`,
  );
}

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
const users = walk("src").filter((file) =>
  /utils\/collate"/.test(read(file)),
).length;
console.log(
  `clean: collation — no localeCompare anywhere in src, ${users} file(s) ` +
    `sort names through the one cached collator, same order`,
);
