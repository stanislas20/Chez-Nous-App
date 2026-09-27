#!/usr/bin/env node
//
// The country sheet, on Android, with the keyboard up.
//
// Two defects met in the same interaction and each hid the other. A reader
// running the app in French typed "United States" and got an empty sheet;
// then the sheet, having nothing left to show, shrank to the bottom of the
// screen and vanished behind the keyboard along with the box they were
// typing into. Reported as one bug. It was two.
//
// SEARCH. useCountries collapses each country to ONE name — French for a
// French reader — and that was the only string matched. "United States"
// therefore could not find "États-Unis", and the fuzzy-prefix rule made it
// worse by being *almost* good enough: one word, "United", did match
// ("unis" shares three of four leading letters), so the row appeared and
// then disappeared as the second word was typed. Both columns are matched
// now, in both languages.
//
// DIAL CODES. "+1" folds to "1", a single character, which queryTokens
// discards as noise — and an empty token list means "no query", so every
// country matched. Typing a dial code returned all 245 of them. A query that
// is only digits is now a dial-code query and nothing else.
//
// KEYBOARD. app.json asks for softwareKeyboardLayoutMode "pan", and a React
// Native Modal is its own window, so the pan applies to the activity behind
// the sheet and moves the sheet not at all. The KeyboardAvoidingView was
// there, but its behavior was guarded by Platform.OS — which left Android,
// the only platform that needs it, with no behavior and therefore a
// component that does nothing. "padding" on both platforms is what the
// papers, fleet and seller-profile screens already do.
//
// Run: node scripts/check-country-picker.js
const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const SHEET = "src/components/CountryPickerSheet.js";
const raw = read(SHEET);
const src = stripComments(raw);

let failures = 0;
const fail = (m) => { console.error(`FAIL ${m}`); failures += 1; };

// ── 1. The keyboard cannot cover the sheet ─────────────────────────────
const modalStart = src.search(/<Modal\b/);
const modalEnd = src.search(/<\/Modal>/);
if (modalStart === -1 || modalEnd === -1) {
  fail(`${SHEET} no longer contains a Modal — this check has to move with it`);
} else {
  const modal = src.slice(modalStart, modalEnd);
  if (!/<Avoider|<KeyboardAvoidingView/.test(modal))
    fail("the Modal contains no KeyboardAvoidingView — the sheet is bottom-anchored, so the keyboard covers it");

  // The literal string, deliberately. A Platform.OS guard here is not a
  // weaker fix, it is NO fix: Android gets undefined and the component does
  // nothing, which is exactly the bug.
  if (!/behavior="padding"/.test(modal))
    fail('the avoider does not use the literal behavior="padding"');
  if (/behavior=\{[^}]*Platform\.OS/.test(modal))
    fail(
      "the avoider's behavior is guarded by Platform.OS — that leaves Android " +
        "with no behavior at all, which is the defect this check exists for",
    );
  // It must sit where the bottom anchor is resolved. SheetBackdrop here is a
  // plain flex:1 with no justify-content, so the Avoider owns flex-end and
  // padding on it does lift the sheet.
  if (!/justify-content: flex-end/.test(raw.slice(raw.indexOf("const Avoider"))))
    fail("the Avoider no longer holds the bottom anchor, so padding on it lifts nothing");
  // Without this the first tap on a country is swallowed dismissing the
  // keyboard, and the reader has to tap twice.
  if (!/keyboardShouldPersistTaps="handled"/.test(modal))
    fail("the list does not keep taps alive while the keyboard is up");
}
if (/\bPlatform\b/.test(src))
  fail("Platform is referenced again in this file — the behavior must not become conditional");

// ── 2. Both names are searched, whatever the language ──────────────────
if (!/queryMatches\(\s*term,\s*item\.nameEn,\s*item\.nameFr\s*\)/.test(src.replace(/\s+/g, " ")))
  fail("the filter does not match against both nameEn and nameFr");
if (/queryMatches\(term, item\.name\)/.test(src))
  fail("the filter still matches only the single localised name");

// ── 3. Behaviour, against the real dataset and the real matcher ────────
//
// Re-implemented here from the component's own source rather than imported:
// the component is ESM/JSX and this runner is CommonJS. The three lines that
// matter are asserted to still be the ones in the file, just above.
const { countries } = requireEsm("src/data/countries.js", ["countries"]);
const { queryMatches } = requireEsm("src/utils/search.js", ["queryMatches"]);
const DIAL_QUERY = /^\+?[0-9]+$/;
if (!src.includes("DIAL_QUERY.test(term)"))
  fail("the filter no longer routes a numeric query to the dial code");

const named = (language) =>
  countries.map((item) => ({
    ...item,
    name: language === "en" ? item.nameEn : item.nameFr,
  }));
const filter = (list, query) => {
  const term = query.trim();
  if (!term) return list;
  if (DIAL_QUERY.test(term)) {
    const digits = term.replace("+", "");
    return list.filter((item) => item.dial.replace("+", "").startsWith(digits));
  }
  return list.filter((item) => queryMatches(term, item.nameEn, item.nameFr));
};

const expect = (language, query, test, what) => {
  const result = filter(named(language), query);
  if (!test(result))
    fail(`[${language}] "${query}" → ${result.length} result(s): ${what}`);
};
const has = (code) => (r) => r.some((x) => x.code === code);

// The reported bug, both directions.
expect("fr", "United States", has("US"), "the United States must be findable by its English name in French");
expect("fr", "united states", has("US"), "case must not matter");
expect("en", "États-Unis", has("US"), "the United States must be findable by its French name in English");
expect("en", "Etats-Unis", has("US"), "accents must not matter");
expect("fr", "United", has("US"), "the partial word must still find it");

// Dial codes: the whole point is that they no longer match everything.
expect("fr", "+1", (r) => r.length > 0 && r.length < countries.length, "a dial code must not return every country");
expect("fr", "+1", (r) => r.every((x) => x.dial === "+1"), "every result must actually be a +1 country");
expect("en", "+229", (r) => r.length === 1 && r[0].code === "BJ", "+229 must be Bénin alone");
expect("en", "229", (r) => r.length === 1 && r[0].code === "BJ", "229 without the plus must be Bénin alone");

// And ordinary searches must keep working.
expect("en", "Nigeria", has("NG"), "an ordinary English name must still match");
expect("fr", "Bénin", has("BJ"), "an ordinary French name must still match");
expect("en", "Benin", has("BJ"), "the unaccented spelling must still match");
expect("fr", "zzzznotacountry", (r) => r.length === 0, "nonsense must match nothing");
expect("en", "", (r) => r.length === countries.length, "an empty query must show every country");

function requireEsm(rel, names) {
  const body = read(rel).replace(/^export\s+/gm, "");
  // eslint-disable-next-line no-new-func
  return new Function(`${body}; return { ${names.join(", ")} };`)();
}

if (failures) process.exit(1);
console.log(
  `clean: country picker — padding on both platforms, taps kept alive, both ` +
    `names searched in both languages, dial queries scoped to the dial code ` +
    `(${countries.length} countries)`,
);
