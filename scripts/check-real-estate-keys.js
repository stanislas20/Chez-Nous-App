// A filter that compares a property field against a key nobody defined.
//
// The Hôtels screen selected halls with `commercialType === "hall"`. The
// key is "eventHall". The comparison was therefore false for every listing
// ever posted, so the Salle tab would have stayed empty forever — and an
// empty tab is indistinguishable from nobody having posted a hall yet,
// which is exactly why it survived review and a device check.
//
// This is the same fault check-category-keys exists for, one level down: a
// filter naming a value no record can hold produces an empty screen, never
// an error. The keys live in one file, so every literal compared against
// one of these fields is checked against it.
//
// The fix in that case was to stop comparing strings at all —
// realEstateHasCapacity is the form's own test for "is this a hall" — and
// that remains the better move. This check catches the ones that stay.
//
// Run: node scripts/check-real-estate-keys.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const failures = [];

const source = read("src/data/realEstate.js");

// The key list for one exported array, read from the file rather than
// copied, so this check cannot drift from the thing it checks.
function keysOf(arrayName) {
  const start = source.indexOf(`const ${arrayName}`);
  if (start === -1) return [];
  const end = source.indexOf("\n];", start);
  return [...source.slice(start, end).matchAll(/key:\s*"([^"]+)"/g)].map(
    (match) => match[1],
  );
}

const FIELDS = {
  realEstateDeal: keysOf("realEstateDeals"),
  commercialType: keysOf("commercialTypes"),
  propertyType: keysOf("propertyTypes"),
  eventSetting: keysOf("eventSettings"),
  landDocument: keysOf("landDocuments"),
  listerKind: keysOf("listerKinds"),
};

for (const [field, keys] of Object.entries(FIELDS)) {
  if (keys.length < 2) {
    failures.push(
      `only ${keys.length} key(s) found for ${field} — the shape realEstate.js ` +
        `is read with here no longer matches the file`,
    );
  }
}

const walk = (dir = "src") =>
  fs
    .readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walk(path.join(dir, entry.name))
        : entry.name.endsWith(".js")
          ? [path.join(dir, entry.name)]
          : [],
    );

// Comments stripped first: the note above the fixed filter in useHotels
// quotes the wrong key on purpose, to record what went wrong.
const readCode = (rel) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");

for (const file of walk()) {
  if (file === path.join("src", "data", "realEstate.js")) continue;
  const code = readCode(file);
  for (const [field, keys] of Object.entries(FIELDS)) {
    const pattern = new RegExp(
      `${field}\\s*(?:===|!==|==)\\s*["']([^"']+)["']|["']([^"']+)["']\\s*(?:===|!==|==)\\s*[\\w.?]*${field}\\b`,
      "g",
    );
    for (const match of code.matchAll(pattern)) {
      const value = match[1] ?? match[2];
      if (!keys.includes(value)) {
        failures.push(
          `${file} compares ${field} against "${value}", which realEstate.js ` +
            `does not define — that test is false for every listing. ` +
            `Known: ${keys.join(", ")}`,
        );
      }
    }
  }
}

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
const total = Object.values(FIELDS).reduce((sum, keys) => sum + keys.length, 0);
console.log(
  `clean: real-estate keys — every literal compared against one of ` +
    `${Object.keys(FIELDS).length} property fields names one of their ${total} real keys`,
);
