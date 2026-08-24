// The tyre size is the whole search on the Pneus screen: get it wrong and a
// buyer is shown tyres that do not fit their car, or shown nothing at all
// while the stock exists. Both failures look identical on screen — an empty
// list — which is exactly why they need a test rather than a look.
//
// Run: node scripts/check-tyre-sizes.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs
  .readFileSync(path.join(__dirname, "..", "src", "data", "tyres.js"), "utf8")
  .replace(/^export /gm, "");

// `function` declarations land on the context; a top-level `const` does not,
// so the constants have to be handed over explicitly. Without this the
// threshold reads as undefined and every age comparison quietly returns
// false — a test that passes by testing nothing.
const exposed = `${source}\nthis.TYRE_AGE_WARN_YEARS = TYRE_AGE_WARN_YEARS;\nthis.tyreVehicleSizes = tyreVehicleSizes;`;

const context = { module: {}, exports: {} };
vm.createContext(context);
vm.runInContext(exposed, context);

const {
  parseTyreSize,
  formatTyreSize,
  isValidTyreSize,
  isAgedTyre,
  tyreAgeYears,
  tyreVehicleSizesFor,
  tyreVehicleSizes,
  tyreVehicleModels,
  TYRE_AGE_WARN_YEARS,
} = context;

const failures = [];
const check = (label, actual, expected) => {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  if (!same) {
    failures.push(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
};

// How people actually type it, spaces and missing R included.
check("parse spaced", Boolean(parseTyreSize("195 / 65 R 15")), true);
check("parse tight", Boolean(parseTyreSize("195/65R15")), true);
check("parse lowercase r", Boolean(parseTyreSize("195/65r15")), true);
check("parse canonical", parseTyreSize("205/55 R16"), {
  width: 205,
  ratio: 55,
  diameter: 16,
});
// A missing digit must fail rather than parse to something plausible.
check("parse short width", parseTyreSize("19/65 R15"), null);
check("parse words", parseTyreSize("pneus neufs"), null);
check("parse empty", parseTyreSize(""), null);

check("format", formatTyreSize(195, 65, 15), "195/65 R15");
check("format incomplete", formatTyreSize(195, null, 15), null);

// The form hands these over as strings.
check("valid from strings", isValidTyreSize("195", "65", "15"), true);
check("width out of range", isValidTyreSize(999, 65, 15), false);
check("rim out of range", isValidTyreSize(195, 65, 99), false);
check("ratio out of range", isValidTyreSize(195, 5, 15), false);

// The age rule the used-tyre warning depends on.
// Built from local parts, not an ISO string: "2026-01-01" parses as UTC
// midnight, which is still 2025 in any negative offset — and the code under
// test reads the LOCAL year, so an ISO literal here would test a different
// year than the app ever sees.
const at2026 = new Date(2026, 0, 1);
check(
  "aged at threshold",
  isAgedTyre(2026 - TYRE_AGE_WARN_YEARS, at2026),
  true,
);
check(
  "not aged below",
  isAgedTyre(2026 - TYRE_AGE_WARN_YEARS + 1, at2026),
  false,
);
check("no dot year", isAgedTyre(null, at2026), false);
// A year in the future is a typo, not a tyre from the future.
check("future dot", tyreAgeYears(2030, at2026), null);

check(
  "vehicle hit",
  tyreVehicleSizesFor("Toyota", "Corolla").includes("195/65 R15"),
  true,
);
check("vehicle miss", tyreVehicleSizesFor("Toyota", "Unknown"), []);
// A model with one size must still hand back a list, or the screen renders
// a string character by character.
check(
  "single size is a list",
  Array.isArray(tyreVehicleSizesFor("Peugeot", "306")),
  true,
);

// Every size in the table has to survive the same parser the search box
// uses. A typo in one of fifty rows would otherwise put a size on screen
// that can never match a listing — and it would look like empty stock.
let rows = 0;
tyreVehicleSizes.forEach((entry) => {
  if (!entry.sizes || !entry.sizes.length) {
    failures.push(`${entry.make} ${entry.model}: no sizes`);
    return;
  }
  entry.sizes.forEach((size) => {
    rows += 1;
    const parsed = parseTyreSize(size);
    if (!parsed) {
      failures.push(`${entry.make} ${entry.model}: unparseable "${size}"`);
      return;
    }
    if (formatTyreSize(parsed.width, parsed.ratio, parsed.diameter) !== size) {
      failures.push(`${entry.make} ${entry.model}: "${size}" is not canonical`);
    }
    if (!isValidTyreSize(parsed.width, parsed.ratio, parsed.diameter)) {
      failures.push(`${entry.make} ${entry.model}: "${size}" out of range`);
    }
  });
});

// Duplicate model names under one make would make the picker ambiguous.
new Set(tyreVehicleSizes.map((entry) => entry.make)).forEach((make) => {
  const models = tyreVehicleModels(make);
  if (new Set(models).size !== models.length) {
    failures.push(`${make}: duplicate model`);
  }
});

if (failures.length) {
  failures.forEach((line) => console.error(line));
  console.error(`\n${failures.length} problem(s)`);
  process.exit(1);
}
console.log(
  `clean: 21 tyre-size cases + ${rows} vehicle sizes across ${tyreVehicleSizes.length} models`,
);
