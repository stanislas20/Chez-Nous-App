// Every `trade` a screen sends to CreateListing must be a trade that form
// knows about.
//
// This exists because the same bug shipped twice. The Assurance screen's
// "Publier une agence d'assurance" passed a trade the form had never heard
// of, so an insurance agency was shown a plumber as its worked example. The
// Climatisation screen's "Publier un atelier" passed "garage", so somebody
// publishing an air-conditioning workshop was shown a mechanic's example and
// asked a mechanic's questions.
//
// Neither failed anywhere a test could see. The navigate call is valid, the
// form renders, and the only symptom is that the copy is about the wrong
// trade — which nobody notices until a user says "this isn't about
// insurance".
//
// So: collect every trade key passed from a screen, and require that the
// form both offers it and has a title example for it. A trade with no
// example silently falls back to the generic Services one, which is the
// exact failure.
//
// What this CANNOT catch, and it is worth being plain about: a screen that
// passes a valid trade belonging to somebody else. "garage" is a real trade
// with a real example, so Climatisation passing it looked correct from here
// and wrong on the phone. Only reading the screen catches that. What the
// script does cover is the half that is mechanical — a trade the form has
// never heard of — which is the half that shipped first.
//
// Run: node scripts/check-post-trades.js
const fs = require("fs");
const path = require("path");
const failures = [];
const babel = require("@babel/core");
const vm = require("vm");

// The second half of this file needs the matchers themselves, not just the
// form's text: it has to prove a declared trade actually reaches a screen.
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
      require: (specifier) =>
        specifier.endsWith("wordMatch")
          ? loadEsm("src/utils/wordMatch.js")
          : {},
      console,
    },
  );
  return shim.exports;
}

const check = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label} — got ${actual}, expected ${expected}`);
  }
};

const root = path.join(__dirname, "..");
const formPath = path.join(root, "src", "screens", "CreateListingScreen.js");
const form = fs.readFileSync(formPath, "utf8");

function keysOf(objectName) {
  const start = form.indexOf(`const ${objectName} = `);
  if (start === -1) return null;
  const open = form.indexOf("{", start);
  const close = form.indexOf("\n};", open);
  if (open === -1 || close === -1) return null;
  const body = form.slice(open, close);
  return new Set(
    [...body.matchAll(/^\s{2}(?:"([\w-]+)"|([A-Za-z_$][\w$]*)):/gm)].map(
      (match) => match[1] ?? match[2],
    ),
  );
}

// The trades the in-form picker offers — from SERVICE_TRADES specifically.
// Scanning the whole file for key/icon pairs also swept up PART_TYPES, whose
// entries are kinds of thing being sold rather than trades, and reported
// them as missing examples they were never supposed to have.
function serviceTradeKeys() {
  const start = form.indexOf("const SERVICE_TRADES = [");
  if (start === -1) return null;
  const close = form.indexOf("\n];", start);
  if (close === -1) return null;
  const body = form.slice(start, close);
  return new Set([...body.matchAll(/key:\s*"([\w-]+)"/g)].map((m) => m[1]));
}

const offered = serviceTradeKeys();
if (!offered) {
  console.error("FAIL could not read SERVICE_TRADES from the form");
  process.exit(1);
}
const hinted = keysOf("TRADE_HINT_KEYS");

if (!hinted) {
  console.error("FAIL could not read TRADE_HINT_KEYS from the form");
  process.exit(1);
}

// Trades the form handles by its own words rather than by a picker entry —
// they still need a hint, they just are not offered as a chip.
const CATEGORY_ONLY = new Set([]);

const screensDir = path.join(root, "src", "screens");
const screens = fs
  .readdirSync(screensDir)
  .filter((file) => file.endsWith(".js"));

let found = 0;
for (const file of screens) {
  if (file === "CreateListingScreen.js") continue;
  const source = fs.readFileSync(path.join(screensDir, file), "utf8");

  // navigate("CreateListing", { … trade: "x" … })
  for (const match of source.matchAll(
    /navigate\(\s*"CreateListing"\s*,\s*\{([\s\S]{0,400}?)\}\s*\)/g,
  )) {
    const block = match[1];
    const trade = block.match(/trade:\s*"([\w-]+)"/);
    if (!trade) continue;
    const key = trade[1];
    found += 1;

    if (!hinted.has(key)) {
      failures.push(
        `${file} posts with trade "${key}", which has no title example — ` +
          `the form falls back to the generic Services one`,
      );
    }
    if (!offered.has(key) && !CATEGORY_ONLY.has(key)) {
      failures.push(
        `${file} posts with trade "${key}", which the form's trade picker ` +
          `does not offer, so nobody can reach that form any other way`,
      );
    }
  }
}

// And the reverse: a trade offered in the picker with no example is the same
// bug waiting for somebody to pick it.
for (const key of offered) {
  if (!hinted.has(key)) {
    failures.push(
      `the form offers "${key}" in its trade picker but has no title ` +
        `example for it`,
    );
  }
}

// ── The declared trade has to survive the publish and reach a screen ────
//
// The form has always asked a seller what they do, and until now it threw
// the answer away: nothing was written to the listing, so every trade screen
// had to infer membership back out of the seller's prose. That is why a
// plotter in a printing shop had to be argued out of the tracker list, and
// why somebody who wrote "pose de balises et suivi" appeared nowhere.
//
// Two ends, both silent if broken. If the field stops being written the
// screens quietly fall back to keywords and lose the sellers whose words do
// not match. If a trade routes nowhere, that seller publishes into a void.
const createSource = form;
check(
  "the listing keeps the trade the seller chose",
  /\{ trade \}/.test(createSource),
  true,
);
check(
  "and only on a service",
  /isServices && trade \? \{ trade \}/.test(createSource),
  true,
);

const garage = loadEsm("src/data/garageSpecialties.js");
const drivers = loadEsm("src/data/drivers.js");
const wash = loadEsm("src/data/carWash.js");
const insurers = loadEsm("src/data/insurance.js");
const parts = loadEsm("src/data/vehicleParts.js");
const schools = loadEsm("src/data/drivingSchools.js");

// Every trade the form offers reaches exactly one of the two mechanisms:
// a garage specialty, or its own matcher.
const OWN_MATCHER = {
  driver: drivers.isDriverListing,
  wash: wash.isWashListing,
  insurance: insurers.isInsuranceListing,
  parts: parts.isPartsSellerListing,
  drivingSchool: schools.isDrivingSchoolListing,
};

[...offered].forEach((trade) => {
  const specialty = garage.specialtyForTrade(trade);
  const own = OWN_MATCHER[trade];
  check(`"${trade}" routes somewhere`, Boolean(specialty || own), true);
  if (specialty) {
    check(
      `"${trade}" names a specialty that exists`,
      garage.garageSpecialties.some((item) => item.key === specialty),
      true,
    );
    // The point of the whole change: prose that matches nothing at all
    // still finds the seller, because they told us.
    check(
      `a declared "${trade}" is found with unmatchable prose`,
      garage.garageSpecialtiesFor("aaa bbb ccc", trade).includes(specialty),
      true,
    );
  }
  if (own) {
    check(
      `a declared "${trade}" is found by its own matcher`,
      own("aaa bbb", trade),
      true,
    );
    check(
      `…and an undeclared one is not, on that prose`,
      own("aaa bbb"),
      false,
    );
  }
});

// A declaration must not become a skeleton key: choosing one trade puts the
// seller on that screen, not on every screen.
check(
  "declaring one trade does not join another",
  garage.garageSpecialtiesFor("aaa bbb", "keys").includes("pneu"),
  false,
);
check(
  "and does not turn a garage into a chauffeur",
  drivers.isDriverListing("aaa bbb", "garage"),
  false,
);
// The lookalikes still have to be refused when nothing was declared, which
// is every listing published before this field existed.
check(
  "a plotter with no declaration is still not a tracker fitter",
  garage.matchesGarageSpecialty(
    "Traceur A0 et plotter, imprimerie et reprographie",
    "gps",
  ),
  false,
);

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: ${found} posting hand-off(s) from screens, ` +
    `${offered.size} trades offered, every one with its own example`,
);
