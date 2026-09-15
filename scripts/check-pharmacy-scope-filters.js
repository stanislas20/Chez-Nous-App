#!/usr/bin/env node
//
// A department scope from a roster notification is the PARENT filter, and
// the city selector has to live inside it.
//
// It did not. CategoryListings drew its city sheet from the national list in
// src/data/cities.js regardless of scope, so arriving from a notification
// scoped to Ouémé and Plateau, the reader was still offered Cotonou,
// Parakou, Djougou and Natitingou. Picking one produced this, on a physical
// device:
//
//   location row : Cotonou
//   scope chip   : Ouémé, Plateau
//   count        : 0
//   message      : "No results for your search."
//
// Two failures in one screen. The selector invited a combination that can
// only ever be empty, and the empty state then blamed a search the reader
// had never made — it named a cause that did not exist and hid the one that
// did.
//
// Asserted here:
//
//   the scoped city list is DERIVED from the department-filtered listings,
//     never from the national constant and never hard-coded — a roster that
//     stops covering a town must stop offering it;
//   an out-of-scope selectedCity is reset when the scope changes, so the
//     impossible pair cannot be rendered at all;
//   the unscoped path still falls back to the national list, because
//     browsing pharmacies with no notification behind it is the common case;
//   the empty state distinguishes "you searched and found nothing" from
//     "these filters match nothing", through t() keys rather than literals.
//
// Run: node scripts/check-pharmacy-scope-filters.js

const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const SCREEN = "src/screens/CategoryListingsScreen.js";
const TRANSLATIONS = "src/i18n/translations.js";

const failures = [];
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

for (const rel of [SCREEN, TRANSLATIONS]) {
  if (!fs.existsSync(path.join(root, rel))) {
    failures.push(`${rel} is missing — this check reads it`);
  }
}
if (failures.length) {
  for (const f of failures) console.log(`FAIL ${f}`);
  process.exit(1);
}

const source = stripComments(read(SCREEN));

// 1. The scoped list is derived from the scoped listings.
if (!/scopedCityNames/.test(source)) {
  failures.push(
    `${SCREEN} no longer computes a scoped city list — the sheet is back to ` +
      `offering every city in the country while a department scope is active`,
  );
} else {
  const block = source.slice(
    source.search(/const scopedCityNames\s*=/),
    source.search(/const filteredSheetCities\s*=/),
  );
  // The ITERATION, not a mention. Mutation testing changed the loop to read
  // the unscoped categoryListings and this check still passed, because the
  // useMemo dependency array below it still named departmentFilteredListings.
  // A dependency is not a data source.
  if (!/for \(const \w+ of departmentFilteredListings\)/.test(block)) {
    failures.push(
      "the scoped city list does not iterate departmentFilteredListings — " +
        "if it walks the unscoped listings or a constant it will offer towns " +
        "outside the scope, which is the defect this file exists to prevent",
    );
  }
  if (!/\.city\b/.test(block)) {
    failures.push(
      "the scoped city list never reads listing.city, so it cannot be " +
        "reflecting what the scoped data actually contains",
    );
  }
}

// 1b. A later notification re-scopes the screen, and only on a real change.
//
// departmentFilter is seeded by a lazy useState initialiser, which runs once.
// Opening a second roster notification while this screen is already focused
// merges new params and re-runs nothing, so the reader taps a Littoral
// notification and goes on looking at Ouémé and Plateau.
//
// The fix has to key on the param VALUE. Re-reading params every render would
// undo the clearable chip: tapping X sets null, the next ordinary render
// reads the unchanged param and puts the filter straight back, and X looks
// broken. So a ref remembers what was last synced.
if (!/const lastSyncedDepartments = useRef\(/.test(source)) {
  failures.push(
    "nothing remembers the last synced departments param — either a later " +
      "notification cannot re-scope this screen, or the param is re-read on " +
      "every render and manually clearing the chip is immediately undone",
  );
} else {
  const syncBlock = source.slice(
    source.search(/const lastSyncedDepartments = useRef\(/),
  );
  if (!/if \(rawDepartments === lastSyncedDepartments\.current\) return;/.test(syncBlock)) {
    failures.push(
      "the departments sync does not bail out when the param is unchanged, " +
        "so an ordinary re-render reapplies a scope the reader cleared",
    );
  }
  if (!/\}, \[rawDepartments\]\)/.test(syncBlock)) {
    failures.push(
      "the departments sync is not keyed on [rawDepartments] — it either " +
        "runs on every render or never runs again after mount",
    );
  }
}

// 1c. One parser, used by both the initial state and the re-sync. Two
// readings of the same param are two chances to disagree about what an
// empty or malformed value means.
if ([...source.matchAll(/parseDepartments\(/g)].length < 3) {
  failures.push(
    "parseDepartments is not shared between the initial state and the " +
      "re-sync — the scope a notification sets at mount and the scope it " +
      "sets later could then be parsed differently",
  );
}

// 2. The sheet consumes it, and still falls back when unscoped.
if (!/\(scopedCityNames \?\? cities\)/.test(source)) {
  failures.push(
    "the city sheet does not read `scopedCityNames ?? cities` — either the " +
      "scope is ignored (the original defect) or the national list is gone " +
      "and ordinary browsing lost its city choices",
  );
}

// 3. An out-of-scope selection is reset rather than rendered.
const resetOk =
  /scopedCityNames\.includes\(selectedCity\)/.test(source) &&
  /setSelectedCity\(null\)/.test(source);
if (!resetOk) {
  failures.push(
    "nothing resets selectedCity when it falls outside the department " +
      "scope, so a city chosen before the scope arrived still produces a " +
      "zero-result screen showing two filters that cannot both hold",
  );
}

// 4. The empty state tells the truth about why it is empty.
if (!/categoryListingsNoFilterMatch/.test(source)) {
  failures.push(
    "the filter-empty state is gone from the screen — an empty filtered " +
      "list would again claim the reader searched",
  );
}
if (!/query\.trim\(\)\s*\n?\s*\?\s*t\("categoryListingsNoResults"\)/.test(source)) {
  failures.push(
    "the empty state does not branch on query.trim() — the search wording " +
      "and the filter wording are only correct if the branch decides between " +
      "them",
  );
}

// 5. Both strings exist in both locales, and neither is inlined.
const translations = read(TRANSLATIONS);
for (const key of ["categoryListingsNoResults", "categoryListingsNoFilterMatch"]) {
  const count = [...translations.matchAll(new RegExp(`\\b${key}:`, "g"))].length;
  if (count < 2) {
    failures.push(
      `${key} is defined ${count} time(s) in translations.js; en and fr each ` +
        `need it or one language falls back to a key name on screen`,
    );
  }
}
if (/No pharmacies match these filters|Aucune pharmacie ne correspond/.test(source)) {
  failures.push(
    "a visible string is hard-coded in the component — this project routes " +
      "user-facing copy through t() so both languages stay in step",
  );
}

if (failures.length === 0) {
  console.log(
    "clean: the department scope is the parent filter — city choices come " +
      "from inside it, a stale city resets, and an empty list says why",
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
