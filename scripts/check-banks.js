// Every bank named here is on a register, and the register has a date.
//
// The list this replaced was written from memory and said so: "real,
// well-known Bénin bank names". Two of its eight entries were the same
// institution — Diamond Bank and NSIA Banque — because NSIA bought Diamond
// Bank SA in 2017 and renamed the Bénin operation. The app spent eight years
// telling people about a bank that no longer existed, and putting it in
// Parakou, which nothing supported either.
//
// A bank is the last place in an app to guess. Somebody acts on this: they
// travel somewhere, or decide a bank is not real because a directory has
// never heard of it. So the rules are that the source is named, the date is
// shown, and no entry carries a fact the register does not give.
//
// Run: node scripts/check-banks.js
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
  banksReviewedOn,
  banksSource,
  beninBanks,
  bankSearchTerms,
  formerNames,
} = loadEsm("src/data/beninBanks.js");

const read = (relative) =>
  fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
const data = read("src/data/beninBanks.js");
const screen = read("src/screens/BanksScreen.js");

const failures = [];
const check = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label} — got ${actual}, expected ${expected}`);
  }
};

// ── Provenance ─────────────────────────────────────────────────────────
check("the list names its source", /^https:\/\//.test(banksSource), true);
check("and the source is the regulator", banksSource.includes("bceao.int"), true);
check(
  "it records when the register was read",
  /^\d{4}-\d{2}-\d{2}$/.test(String(banksReviewedOn)),
  true,
);
check(
  "not a date in the future",
  new Date(banksReviewedOn) <= new Date(),
  true,
);
// On screen, not only in the file. A dated list the reader cannot date is a
// list they have to take on trust.
check(
  "the screen shows the reading date",
  /banksSourceNote", \{ date: reviewed \}/.test(screen),
  true,
);

// ── One institution, one entry ─────────────────────────────────────────
const keys = beninBanks.map((bank) => bank.key);
check("every key is unique", new Set(keys).size, keys.length);
const names = beninBanks.map((bank) => bank.name.toLowerCase());
check("every name is unique", new Set(names).size, names.length);

// The specific failure that shipped: a renamed bank listed twice, once under
// each name. A former name must be an alias, never a row of its own.
const allFormer = beninBanks.flatMap((bank) => formerNames(bank.key));
allFormer.forEach((former) => {
  check(
    `"${former}" is an alias, not a second bank`,
    beninBanks.some(
      (bank) => bank.name.toLowerCase() === String(former).toLowerCase(),
    ),
    false,
  );
});
// And the rename that caused it is still recorded, so a customer holding the
// old passbook can still find their bank.
check(
  "the Diamond Bank rename is remembered",
  formerNames("nsia").some((name) => /diamond/i.test(name)),
  true,
);
check(
  "and it is searchable",
  bankSearchTerms(beninBanks.find((bank) => bank.key === "nsia")).some((term) =>
    /diamond/i.test(term),
  ),
  true,
);

// ── No fact the register does not give ─────────────────────────────────
//
// The old list assigned each bank a city with nothing behind it. A bank has
// branches in many towns; naming one sends everybody else to the wrong place,
// and the map search the screen opens does not need it.
beninBanks.forEach((bank) => {
  check(`${bank.key} has a name`, Boolean(bank.name), true);
  check(`${bank.key} has a short name to search on`, Boolean(bank.shortName), true);
  check(
    `${bank.key} claims no city`,
    Object.prototype.hasOwnProperty.call(bank, "city"),
    false,
  );
  check(
    `${bank.key} claims no address`,
    Object.prototype.hasOwnProperty.call(bank, "address"),
    false,
  );
  // Bénin renumbered to ten digits in 2020 and much of what is published is
  // the dead eight-digit form — the same reason the dealerships carry none.
  check(
    `${bank.key} claims no phone number`,
    Object.prototype.hasOwnProperty.call(bank, "phone"),
    false,
  );
});

// Nothing anywhere in the file that looks like an address or a number.
const withoutComments = data
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n")
  .replace(/"\d{4}-\d{2}-\d{2}"/g, '""');
const digits = withoutComments.match(/\b\d{4,}\b|\b\d{1,3}[\s.]\d{3}\b/g) ?? [];
check(`no numbers crept in (${digits.join(" | ")})`, digits.length, 0);

// ── Alphabetical ───────────────────────────────────────────────────────
//
// Any other order is a ranking, and this app has no standing to rank licensed
// banks against each other.
const sorted = [...beninBanks].sort((a, b) =>
  a.name.localeCompare(b.name, "fr"),
);
check(
  "the banks are in alphabetical order, not a preference",
  beninBanks.map((bank) => bank.key).join(","),
  sorted.map((bank) => bank.key).join(","),
);

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: banks — ${beninBanks.length} licensed institutions from BCEAO, ` +
    `read ${banksReviewedOn}, ${allFormer.length} former name(s) kept ` +
    `searchable, no city, address or number claimed`,
);
