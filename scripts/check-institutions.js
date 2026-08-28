// The state stays out of "Entreprises vérifiées", and every link is official.
//
// Two separate rules, both about the same thing: what this app is entitled to
// say about the government.
//
// The first is placement. "Entreprises vérifiées" means a person at Chez-Nous
// approved a company's account. A ministry has no account and never asked to
// be listed, so putting it in that row would be a claim about the state that
// nobody made — and sitting beside paid placements, it reads as endorsement
// running in both directions.
//
// The second is the links, and it is the more dangerous of the two. This is
// the one screen in the app where somebody is about to type an identity
// document number into whatever opens. A wrong URL here does not show an
// empty list, it hands their papers to whoever registered a lookalike domain.
// So every address has to come from the government's own portal, be https,
// and sit on a domain the state actually uses.
//
// Run: node scripts/check-institutions.js
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
  beninInstitutions,
  institutionEmblem,
  institutionGroups,
  institutionsIn,
  institutionsReviewedOn,
  institutionsSource,
} = loadEsm("src/data/beninInstitutions.js");

const read = (relative) =>
  fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
const screen = read("src/screens/PublicServicesScreen.js");
const forYou = read("src/screens/ForYouScreen.js");

const failures = [];
const check = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label} — got ${actual}, expected ${expected}`);
  }
};

// ── Every link is one the state publishes ──────────────────────────────
//
// Bénin's public bodies sit on .bj — gouv.bj for the administration, and a
// handful of dedicated .bj domains for the e-services. Anything outside that
// is either a mistake or somebody else's domain, and both are unacceptable
// on the screen where documents get typed.
const OFFICIAL_HOST = /^https:\/\/([a-z0-9-]+\.)*(gouv\.bj|[a-z0-9-]+\.bj)\/?/;

beninInstitutions.forEach((item) => {
  check(`${item.key} has a name`, Boolean(item.name), true);
  check(`${item.key} has a link`, Boolean(item.url), true);
  // http would let a network hand back anything at all on the way.
  check(
    `${item.key} is https (${item.url})`,
    String(item.url).startsWith("https://"),
    true,
  );
  check(
    `${item.key} is on a Bénin state domain (${item.url})`,
    OFFICIAL_HOST.test(String(item.url)),
    true,
  );
  check(
    `${item.key} belongs to a group that exists`,
    institutionGroups.some((group) => group.key === item.group),
    true,
  );
  check(
    `${item.key} has a plate somebody could read`,
    institutionEmblem(item).length >= 2 &&
      institutionEmblem(item).length <= 6,
    true,
  );
  // No opening hours, no phone, no waiting time. The portal publishes none of
  // it, and an office's hours are exactly the sort of fact that is wrong by
  // the time anybody reads it.
  ["phone", "hours", "address", "duration", "fee"].forEach((field) => {
    check(
      `${item.key} claims no ${field}`,
      Object.prototype.hasOwnProperty.call(item, field),
      false,
    );
  });
});

const keys = beninInstitutions.map((item) => item.key);
check("every key is unique", new Set(keys).size, keys.length);
const urls = beninInstitutions.map((item) => item.url);
check("no link is listed twice", new Set(urls).size, urls.length);

// Every group carries something. An empty heading is a promise of a section
// that does not exist.
institutionGroups.forEach((group) => {
  check(`the "${group.key}" group has entries`, institutionsIn(group.key).length > 0, true);
  check(`the "${group.key}" group is labelled in both languages`,
    Boolean(group.labelEn && group.labelFr), true);
});

// ── Provenance ─────────────────────────────────────────────────────────
check(
  "the list names where it came from",
  String(institutionsSource).includes("gouv.bj"),
  true,
);
check(
  "and when it was read",
  /^\d{4}-\d{2}-\d{2}$/.test(String(institutionsReviewedOn)),
  true,
);
check(
  "not a date in the future",
  new Date(institutionsReviewedOn) <= new Date(),
  true,
);
check(
  "the screen shows that date",
  /publicSourceNote", \{ date: reviewed \}/.test(screen),
  true,
);
// And tells the reader to check the address bar, because this is the screen
// where that advice actually matters.
check(
  "the screen warns about the address bar",
  /publicSourceNote/.test(screen),
  true,
);

// ── The state is not an "entreprise vérifiée" ──────────────────────────
//
// The row on the home feed is built in ForYouScreen. If these ever get mixed
// into it, the checkmark starts meaning two different things in one strip —
// which is exactly the failure the dealerships were kept clear of.
check(
  "the verified-businesses row does not pull in institutions",
  /beninInstitutions/.test(forYou),
  false,
);
check(
  "and the screen says plainly it is not a partnership",
  /publicNotAffiliated/.test(screen),
  true,
);

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: institutions — ${beninInstitutions.length} official sites across ` +
    `${institutionGroups.length} groups, all https on Bénin state domains, ` +
    `from gouv.bj read ${institutionsReviewedOn}, kept out of the ` +
    `verified-businesses row`,
);
