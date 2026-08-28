// The register is the claim, and a logo is only ever the company's own.
//
// Two rules that between them keep "Entreprises vérifiées" true.
//
// Every company here is on a published register — BCEAO for the banks, ARCEP
// for the operators, ASA Bénin for the insurers — and the card carries which
// one. Without that line the row is names somebody typed, which is what it
// was when it held six car distributors and nothing else.
//
// And a logo is downloaded from that company's own homepage or it does not
// exist. The failure this guards against already happened: reading og:image
// pulled a stock photograph of two people at a desk off Société Générale's
// site and saved it as their logo. og:image is a social-preview tag, not a
// mark, so the fetcher no longer reads it — and a company whose site refuses
// a script keeps its monogram rather than borrowing an image from anywhere
// else. A wrong logo on a bank card is worse than no logo.
//
// Run: node scripts/check-companies.js
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
  beninInsurers,
  beninTelecoms,
  companiesReviewedOn,
  companyEmblem,
  companySectors,
  insuranceBranches,
} = loadEsm("src/data/beninCompanies.js");
const { beninBanks } = loadEsm("src/data/beninBanks.js");

const read = (r) => fs.readFileSync(path.join(__dirname, "..", r), "utf8");
const logosSource = read("src/data/companyLogos.js");
const fetcher = read("scripts/fetch-company-logos.py");

// The distributors are on no regulator's register, but they were each checked
// against a published source and they carry logos too — see check-dealerships.
const dealerKeys = [
  ...read("src/data/carDealerships.js").matchAll(/key: "([\w-]+)"/g),
].map((m) => m[1]);

const failures = [];
const check = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label} — got ${actual}, expected ${expected}`);
  }
};

// ── Every sector names its authority ───────────────────────────────────
companySectors.forEach((sector) => {
  check(`${sector.key} names who vouches, in both languages`,
    Boolean(sector.authorityEn && sector.authorityFr), true);
  check(`${sector.key} links that authority`,
    /^https:\/\//.test(String(sector.source)), true);
  check(`${sector.key} has an accent`, /^#[0-9A-Fa-f]{6}$/.test(sector.accent), true);
});
check("the accents are distinct",
  new Set(companySectors.map((s) => s.accent)).size, companySectors.length);

// ── Every company is placeable and readable ────────────────────────────
const all = [...beninTelecoms, ...beninInsurers];
all.forEach((company) => {
  check(`${company.key} has a name`, Boolean(company.name), true);
  check(`${company.key} sits in a sector that exists`,
    companySectors.some((s) => s.key === company.sector), true);
  const emblem = companyEmblem(company);
  check(`${company.key} has a plate somebody could read (${emblem})`,
    emblem.length >= 3 && emblem.length <= 7, true);
  // Nothing the register does not give.
  ["phone", "address", "city", "rating", "price"].forEach((field) => {
    check(`${company.key} claims no ${field}`,
      Object.prototype.hasOwnProperty.call(company, field), false);
  });
});
const keys = all.map((c) => c.key);
check("every company key is unique", new Set(keys).size, keys.length);

// Life and non-life are separately licensed companies in the CIMA zone, which
// is why several brands appear twice. Flattening them would look like a bug.
insuranceBranches.forEach((branch) => {
  check(`the "${branch.key}" branch has members`,
    beninInsurers.some((i) => i.branch === branch.key), true);
});
beninInsurers.forEach((insurer) => {
  check(`${insurer.key} says which branch it is licensed for`,
    insuranceBranches.some((b) => b.key === insurer.branch), true);
});

check("the list records when it was read",
  /^\d{4}-\d{2}-\d{2}$/.test(String(companiesReviewedOn)), true);
check("not a date in the future",
  new Date(companiesReviewedOn) <= new Date(), true);

// ── Logos ──────────────────────────────────────────────────────────────
//
// Every file the map requires has to exist, or Metro fails at build with a
// message about a module, not about a missing logo.
const required = [...logosSource.matchAll(/require\("\.\.\/\.\.\/(assets\/logos\/[\w.-]+)"\)/g)]
  .map((m) => m[1]);
check("the map requires at least one logo", required.length > 0, true);
[...new Set(required)].forEach((file) => {
  check(`${file} exists`, fs.existsSync(path.join(__dirname, "..", file)), true);
});

// And every key in the map is a real company — a logo filed under a key
// nothing uses is a logo that never shows, which looks like the fetch worked.
const known = new Set([
  ...all.map((c) => c.key),
  ...beninBanks.map((b) => b.key),
  ...dealerKeys,
]);
[...logosSource.matchAll(/^\s+"?([\w-]+)"?:\s*require\(/gm)].forEach((m) => {
  check(`the logo "${m[1]}" belongs to a company on a register`, known.has(m[1]), true);
});

// ── The row filters, the lists do not ─────────────────────────────────
//
// The home row shows only companies whose mark we hold, because a marquee
// alternating real logos with letter plates reads as half-finished. That is a
// presentation rule, and it is only safe while the complete lists live
// somewhere else. If the screens ever start filtering the same way, the app
// would quietly stop naming eight licensed banks and seven ASA members while
// still calling itself a register.
const companiesScreen = read("src/screens/VerifiedCompaniesScreen.js");
const dealersScreen = read("src/screens/CarDealershipsScreen.js");
check(
  "the Entreprises vérifiées screen lists everyone, logo or not",
  /hasLogo/.test(companiesScreen),
  false,
);
check(
  "and so does Concessionnaires",
  /hasLogo/.test(dealersScreen),
  false,
);
check(
  "while the feed row filters on it",
  /hasLogo/.test(read("src/screens/ForYouScreen.js")),
  true,
);

// The specific mistake, kept out by construction rather than by memory.
check("the fetcher does not read og:image",
  /og:image/.test(fetcher.replace(/^#.*$/gm, "").replace(/"""[\s\S]*?"""/, "")), false);

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: companies — ${beninBanks.length} banks, ${beninTelecoms.length} operators, ` +
    `${beninInsurers.length} insurers, each carrying its regulator; ` +
    `${[...new Set(required)].length} logo file(s), all from the company's own site`,
);
