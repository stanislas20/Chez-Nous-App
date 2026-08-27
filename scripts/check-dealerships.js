// Guards the one directory that makes claims about real, named companies.
//
// Every other vertical lists what somebody published about themselves. This
// file says, in the app's own voice, that CFAO distributes Toyota and that
// SOCAR is in Cotonou — about firms that never signed up and cannot correct
// it. That is a different kind of statement and it needs a different kind of
// care, which until now lived entirely in comments.
//
// Comments do not survive contact. The file explains at length why there are
// no phone numbers — Bénin renumbered from eight digits to ten in 2020 and a
// great many published numbers now ring nowhere, so a number here would be
// worse than none — and nothing stopped the next person adding one. It
// explains that the list is not a census, and the count label went and said
// "6 distributeurs officiels" anyway, which reads as a claim that the country
// has six.
//
// So the rules the comments state are asserted here instead.
//
// Run: node scripts/check-dealerships.js
const babel = require("@babel/core");
const vm = require("vm");
const path = require("path");
const fs = require("fs");

function loadEsm(relative) {
  const shim = { exports: {} };
  vm.runInNewContext(
    babel.transformFileSync(path.join(__dirname, "..", relative), {
      presets: [["@babel/preset-env", { targets: { node: "current" } }]],
      babelrc: false,
      configFile: false,
    }).code,
    {
      module: shim,
      exports: shim.exports,
      // carDealerships imports canonicalBrand, so the shim has to resolve
      // it rather than hand back an empty object — a stub here would make
      // every marque look unknown.
      require: (specifier) =>
        specifier.endsWith("vehicles") ? loadEsm("src/data/vehicles.js") : {},
      console,
    },
  );
  return shim.exports;
}

const {
  carDealerships,
  dealershipsReviewedOn,
  nonCarMarques,
  validateDealership,
} = loadEsm("src/data/carDealerships.js");
const { vehicleBrands, canonicalBrand } = loadEsm("src/data/vehicles.js");

const read = (relative) =>
  fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
const source = read("src/data/carDealerships.js");
const translations = read("src/i18n/translations.js");

const failures = [];
const check = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label} — got ${actual}, expected ${expected}`);
  }
};

// ── Every row says who, where and on whose authority ────────────────────
//
// Through the same function scripts/addDealership.js calls, so a row typed
// into a terminal is held to exactly what the bundled ones are.
carDealerships.forEach((firm) => {
  const problems = validateDealership({ ...firm, order: 0 });
  check(
    `${firm.key} satisfies the shared rules (${problems.join("; ")})`,
    problems.length,
    0,
  );
  check(`${firm.key} has a name`, Boolean(firm.name), true);
  check(`${firm.key} names a city`, Boolean(firm.city), true);
  check(`${firm.key} distributes something`, firm.brands.length > 0, true);
  // A site is optional and null is a real answer — two of these firms have
  // no published one, and inventing a URL for them would be worse than the
  // gap. What is not optional is that a site, when given, is one somebody
  // can safely open.
  if (firm.website) {
    check(
      `${firm.key} is reachable over https`,
      String(firm.website).startsWith("https://"),
      true,
    );
  }
});

// ── The deliberate absence ──────────────────────────────────────────────
//
// No phone numbers. The reason is in the file and the reason is good, and a
// comment cannot stop anybody. A Bénin number is ten digits; this catches a
// run of eight or more anywhere in the data.
const digitRuns = source
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n")
  .match(/\b[\d\s]{8,}\b/g);
check(
  `no phone numbers crept in (${(digitRuns ?? []).join(" | ")})`,
  (digitRuns ?? []).length,
  0,
);

// ── One brand vocabulary ────────────────────────────────────────────────
//
// The directory writes a company's own name for a marque ("Mercedes-Benz")
// and the advert picker writes the everyday one ("Mercedes"). Both are right
// where they are used. What must not happen is a third spelling that
// resolves to neither — today the chips only filter locally so it would look
// harmless, and the day a chip navigates it becomes a dead end.
const allBrands = [...new Set(carDealerships.flatMap((firm) => firm.brands))];
allBrands.forEach((brand) => {
  const resolved = canonicalBrand(brand);
  const declared = Object.prototype.hasOwnProperty.call(nonCarMarques, brand);
  check(
    `"${brand}" is either a known make or declared as something else`,
    Boolean(resolved) || declared,
    true,
  );
  // Not both: a marque that resolves does not need an excuse, and carrying
  // one would hide a later rename.
  if (resolved) {
    check(`"${brand}" is not also excused`, declared, false);
  }
});
// And the excuses have to be about marques that are actually here, or the
// list becomes a graveyard nobody prunes.
Object.keys(nonCarMarques).forEach((brand) => {
  check(
    `"${brand}" is excused but still distributed`,
    allBrands.includes(brand),
    true,
  );
  check(`"${brand}" says what it is`, Boolean(nonCarMarques[brand]), true);
});
check(
  "the alias resolves the company spelling",
  canonicalBrand("Mercedes-Benz"),
  "Mercedes",
);
check(
  "an unknown marque resolves to nothing",
  canonicalBrand("Nonesuch"),
  null,
);
check("the make list is not empty", vehicleBrands.length > 0, true);

// ── How old is this? ────────────────────────────────────────────────────
check(
  "the list records when it was last reviewed",
  Boolean(dealershipsReviewedOn),
  true,
);
check(
  "and it is a real date",
  /^\d{4}-\d{2}-\d{2}$/.test(String(dealershipsReviewedOn)),
  true,
);
check(
  "not dated in the future",
  new Date(dealershipsReviewedOn) <= new Date(),
  true,
);

// ── The count must not imply a national total ───────────────────────────
//
// This is the specific mistake the file was already corrected for once: the
// hero read "4 concessions", which said the country has four. The count then
// said "6 distributeurs officiels" and said it again. A bare count of a list
// that is explicitly not exhaustive has to be marked as a count OF THE LIST.
const countLines = translations
  .split("\n")
  .filter((line) => /dealerCountLabel/.test(line));
check("both languages count the same way", countLines.length, 4);
countLines.forEach((line) => {
  check(
    `the count says it is a listing, not a census: ${line.trim().slice(0, 52)}`,
    /listed|list\\u00e9|listés|listé/.test(line),
    true,
  );
});

// The screen also has to keep saying so in prose.
check(
  "the screen still admits the list is not exhaustive",
  /carsDealershipsPartial/.test(translations),
  true,
);

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
// Not a failure, but not silent either. With phone numbers deliberately
// absent, a firm with no published site is one the directory can name and
// nobody can reach — worth seeing every time this runs rather than
// discovering it from a user.
const unreachable = carDealerships.filter((firm) => !firm.website);
if (unreachable.length) {
  console.log(
    `note: ${unreachable.length} firm(s) with no way through — ` +
      `${unreachable.map((firm) => firm.name).join(", ")}`,
  );
}

console.log(
  `clean: dealerships — ${carDealerships.length} firms listed, ` +
    `${allBrands.length} marques all resolved or declared, no phone numbers, ` +
    `reviewed ${dealershipsReviewedOn}, counted as a list not a census`,
);
