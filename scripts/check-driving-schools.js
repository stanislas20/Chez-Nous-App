// The licence facts stay the agency's, and the price stays absent.
//
// This screen is the only place in the app that repeats a regulatory
// requirement back to somebody who is about to act on it. Get the dossier
// wrong and they travel to a counter and are turned away; get the minimum age
// wrong and a school takes money for a course they cannot sit.
//
// Two rules, then, and both come from ANaTT's own page rather than from us:
//
//   1. Every fact here is on that page, and the file says when it was read.
//   2. There is NO price. ANaTT does not publish one — its page says the cost
//      varies by school — and a search result quoting exact fees (3 000 de
//      droit de Trésor, 2 000 de timbre, 20 200 d'inscription) is not the
//      agency saying so. A fee that has moved since is worse than no fee: the
//      reader arrives with the wrong money and blames the school.
//
// Run: node scripts/check-driving-schools.js
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
    { module: shim, exports: shim.exports, require: () => ({}), console },
  );
  return shim.exports;
}

const {
  ANATT_EXAM_URL,
  ANATT_LICENCE_URL,
  declaredCategories,
  drivingSchoolsReviewedOn,
  isDrivingSchoolListing,
  licenceCategories,
  licenceDossier,
  schoolQuestions,
} = loadEsm("src/data/drivingSchools.js");

const read = (relative) =>
  fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
const data = read("src/data/drivingSchools.js");
const screen = read("src/screens/DrivingSchoolsScreen.js");

const failures = [];
const check = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label} — got ${actual}, expected ${expected}`);
  }
};

// ── The categories, as ANaTT lists them ────────────────────────────────
check("five categories", licenceCategories.length, 5);
check(
  "and they are A B C D E",
  licenceCategories.map((item) => item.key).join(""),
  "ABCDE",
);
licenceCategories.forEach((category) => {
  check(`${category.key} says what it covers`, Boolean(category.coversFr), true);
  check(`${category.key} says it in English too`, Boolean(category.coversEn), true);
  check(
    `${category.key} carries a legal minimum age`,
    Number.isInteger(category.minAge) && category.minAge >= 18,
    true,
  );
});

// The distinction the screen exists to make. A candidate who books a poids
// lourd course without a B has bought a year they cannot use.
const needsB = licenceCategories
  .filter((item) => item.requiresB)
  .map((item) => item.key);
check("C, D and E need a B first", needsB.join(""), "CDE");
check(
  "A and B do not",
  licenceCategories
    .filter((item) => !item.requiresB)
    .map((item) => item.key)
    .join(""),
  "AB",
);
// And the ages that go with that split, which is the other half of the same
// published rule.
check(
  "the heavy categories start at 21",
  licenceCategories
    .filter((item) => item.requiresB)
    .every((item) => item.minAge === 21),
  true,
);
check(
  "the light ones at 18",
  licenceCategories
    .filter((item) => !item.requiresB)
    .every((item) => item.minAge === 18),
  true,
);

// ── The dossier ────────────────────────────────────────────────────────
check("the exam file has five items", licenceDossier.length, 5);
// The one that makes the school unavoidable, and the reason this screen
// pairs the paperwork with the directory instead of separating them.
check(
  "the school's attestation is one of them",
  licenceDossier.some((item) => /attestation/i.test(item.labelFr)),
  true,
);

// ── No price, anywhere ─────────────────────────────────────────────────
//
// Money-shaped digits, which is narrower than "digits". This file legitimately
// carries two-digit minimum ages and a review date, and a first version of
// this check failed on both — so what it looks for is a figure written the way
// a franc amount is written: four or more digits, or a thousands group like
// "20 200". Comments are stripped first, or the block explaining which fees
// were refused would trip the check that refuses them.
const withoutComments = data
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n")
  // The review date is an ISO string, not an amount.
  .replace(/"\d{4}-\d{2}-\d{2}"/g, '""');
const money = withoutComments.match(/\b\d{4,}\b|\b\d{1,3}[\s.,]\d{3}\b/g) ?? [];
check(`no fee crept into the data (${money.join(" | ")})`, money.length, 0);
check(
  "and the screen says why there is none",
  /schoolsPriceNote/.test(screen),
  true,
);

// ── Provenance ─────────────────────────────────────────────────────────
check(
  "the file records when the agency was read",
  /^\d{4}-\d{2}-\d{2}$/.test(String(drivingSchoolsReviewedOn)),
  true,
);
check(
  "not a date in the future",
  new Date(drivingSchoolsReviewedOn) <= new Date(),
  true,
);
check("it links the licence page", /^https:\/\//.test(ANATT_LICENCE_URL), true);
check("and the exam page", /^https:\/\//.test(ANATT_EXAM_URL), true);
check(
  "both are ANaTT's own domain",
  [ANATT_LICENCE_URL, ANATT_EXAM_URL].every((url) => url.includes("anatt.bj")),
  true,
);
// The date has to be on screen, not just in the file: a sourced list the
// reader cannot date is a sourced list they have to trust blindly.
check(
  "the screen shows the reading date",
  /schoolsDossierNote", \{ date: reviewed \}/.test(screen),
  true,
);
// And it has to show the right day. `new Date("2026-08-28")` is parsed as UTC
// midnight and formatted in the reader's zone, so west of Greenwich it prints
// the day before — which is exactly what this screen did on first run. The
// date is built from its parts instead, and that has to stay that way.
check(
  "the date is built in local time, not parsed as UTC",
  /drivingSchoolsReviewedOn\.split\("-"\)\.map\(Number\)/.test(screen),
  true,
);
check(
  "and the UTC-parsing form is gone",
  /new Date\(drivingSchoolsReviewedOn\)/.test(screen),
  false,
);

// ── What we must not claim ─────────────────────────────────────────────
//
// ANaTT approves auto-écoles. We hold no register, so we cannot say which
// listing is approved — and this is the screen where that badge would be
// believed most. The question goes to the candidate instead.
check(
  "no school is badged as approved",
  /agr[ée]{2}e?\s*(badge|Pill|Tag)|isApproved|approvedByAnatt/i.test(screen),
  false,
);
check(
  "the reader is told to ask for the agrément",
  schoolQuestions.some((item) => /agréée par l'ANaTT/.test(item.labelFr)),
  true,
);
check(
  "and told plainly that we cannot check it",
  /schoolsAskNote/.test(screen),
  true,
);

// ── The matcher ────────────────────────────────────────────────────────
check(
  "a declared school is found whatever it wrote",
  isDrivingSchoolListing("aaa bbb ccc", "drivingSchool"),
  true,
);
check(
  "its own words find it when nothing was declared",
  isDrivingSchoolListing("Auto-école Le Progrès, permis B", null),
  true,
);
check(
  "accents and spacing do not decide it",
  isDrivingSchoolListing("auto ecole a calavi", null),
  true,
);
// The failure that would put somebody else's listing on this screen: a
// garage whose description mentions the code de la route is still a garage.
check(
  "another declared trade is never claimed",
  isDrivingSchoolListing("révision et code de la route", "garage"),
  false,
);
check(
  "and unrelated prose is not either",
  isDrivingSchoolListing("vente de pneus neufs", null),
  false,
);

// A category a school invents is not a category. Letting it through puts a
// chip on screen that filters to nothing.
check(
  "only real categories survive from a listing",
  declaredCategories({ schoolCategories: ["B", "F", "B2", "D"] }).join(""),
  "BD",
);
check(
  "a school that declared none comes back empty, not guessed",
  declaredCategories({}).length,
  0,
);

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: driving schools — ${licenceCategories.length} categories and a ` +
    `${licenceDossier.length}-item dossier from ANaTT, read ` +
    `${drivingSchoolsReviewedOn}, no fee quoted, no school badged approved`,
);
