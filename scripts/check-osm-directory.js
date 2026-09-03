// The imported lodging directory, and what it may never become.
//
// OpenStreetMap is what lets the Hôtels screen answer "hôtels autour de
// moi" before a single hotelier signs up: ~740 named places in Bénin with
// real coordinates. It is usable precisely because it is openly licensed,
// and it is honest precisely because of what it does NOT carry — no rate,
// no taxe de séjour, no generator, no stars.
//
// Three ways that goes wrong, none of which would fail loudly:
//
//   - a price appears on a directory card. There is no source for one, so
//     it could only have been invented, and this screen exists to argue
//     that an invented rate is the worst thing a hotel card can carry.
//   - the attribution disappears. ODbL permits this use and requires the
//     credit; dropping it turns a licensed import into an unlicensed one.
//   - a telephone number ships half-normalised. OSM stores numbers as
//     humans type them; a card that dials nothing is worse than one that
//     admits it has no number.
//
// Run: node scripts/check-osm-directory.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

// Every key test below is anchored on the closing quote of the call. A bare
// substring passes on a renamed key -- hotelsDirectoryCreditX contains
// hotelsDirectoryCredit -- and the first version of this file duly reported
// "clean" while the ODbL credit had been renamed out of existence.
const failures = [];
const check = (label, ok) => {
  if (!ok) failures.push(label);
};

const entries = JSON.parse(read("src/data/osmLodging.json"));
const screen = read("src/screens/HotelsScreen.js");
const fetcher = read("scripts/fetchOsmHotels.js");

check("the directory has entries", entries.length > 100);

// ── nothing priced, ever ───────────────────────────────────────────────
const PRICED = ["price", "touristTax", "allIn", "generator", "declaredStars"];
for (const field of PRICED) {
  check(
    `no directory entry carries ${field} — there is no source for one`,
    !entries.some((entry) => entry[field] !== undefined),
  );
}
check(
  "the card says the rate is not published",
  /t\("hotelsDirectoryNoRate"\)/.test(screen),
);

// ── every number dials ─────────────────────────────────────────────────
const bad = entries.filter(
  (entry) => entry.phone && !/^01\d{8}(\/01\d{8})*$/.test(entry.phone),
);
check(
  `every stored number is dialable (${bad.length} malformed)`,
  bad.length === 0,
);
check(
  "the importer drops what it cannot normalise rather than storing it",
  /parts\.length \? \[\.\.\.new Set\(parts\)\]\.join\("\/"\) : null/.test(fetcher),
);

// ── every entry is placeable ───────────────────────────────────────────
check(
  "every entry has coordinates",
  entries.every(
    (entry) =>
      Number.isFinite(entry.latitude) && Number.isFinite(entry.longitude),
  ),
);
check(
  "every entry has a name and a city",
  entries.every((entry) => entry.name && entry.city),
);

// ── the licence is honoured ────────────────────────────────────────────
check(
  "the screen credits OpenStreetMap",
  /t\("hotelsDirectoryCredit"\)/.test(screen),
);
const fr = read("src/i18n/translations.js");
check(
  "the credit names OpenStreetMap and ODbL in both languages",
  (fr.match(/OpenStreetMap contributors \(ODbL\)/g) ?? []).length >= 1 &&
    (fr.match(/contributeurs OpenStreetMap \(ODbL\)/g) ?? []).length >= 1,
);

// ── and it is kept apart from the app's own listings ───────────────────
check(
  "the directory is its own section, not merged into the priced list",
  /t\("hotelsDirectoryTitle"\)/.test(screen),
);
check(
  "a truncated directory says how many it left out",
  /t\("hotelsDirectoryMore",/.test(screen),
);

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
const withPhone = entries.filter((entry) => entry.phone).length;
console.log(
  `clean: OSM directory — ${entries.length} places, ${withPhone} dialable, ` +
    `no rate on any of them, credited under ODbL and kept in its own section`,
);
