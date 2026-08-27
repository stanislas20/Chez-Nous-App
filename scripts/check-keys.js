// Guards the car-key triage.
//
// This screen's value is that it names the trade. Several of the situations
// on it are not locksmith work — a key that turns without starting is an
// immobiliser question, a worn ignition barrel is mechanical, a car locked
// with the keys inside is whoever arrives first — and a situation pointed at
// the wrong specialty sends somebody across town to a shop that cannot help.
// That failure looks like a working screen from here and like a wasted
// morning from the roadside.
//
// So every specialty named by a cause has to be one the garage matcher can
// actually produce. A typo — "key" for "keys" — filters the provider list
// down to nobody and reads as "no locksmiths near you".
//
// Run: node scripts/check-keys.js
const babel = require("@babel/core");
const vm = require("vm");
const path = require("path");

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

const {
  keySituations,
  keyServices,
  keyTypes,
  keyChecklist,
  specialtiesForSituation,
  getKeyType,
} = loadEsm("src/data/carKeys.js");
const { garageSpecialties, matchesGarageSpecialty } = loadEsm(
  "src/data/garageSpecialties.js",
);

const failures = [];
const check = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label} — got ${actual}, expected ${expected}`);
  }
};

const known = new Set(garageSpecialties.map((item) => item.key));

// ── Every cause points at a trade that exists ───────────────────────────
keySituations.forEach((situation) => {
  check(
    `${situation.key} labelled in both languages`,
    Boolean(situation.labelEn && situation.labelFr),
    true,
  );
  check(`${situation.key} has an icon`, Boolean(situation.icon), true);
  check(
    `${situation.key} has at least one cause`,
    situation.causes.length > 0,
    true,
  );
  situation.causes.forEach((cause) => {
    check(
      `${situation.key} → "${cause.labelEn}" names a real specialty (${cause.specialty})`,
      known.has(cause.specialty),
      true,
    );
    check(
      `${situation.key} → "${cause.labelEn}" is labelled in both languages`,
      Boolean(cause.labelEn && cause.labelFr),
      true,
    );
    // The note is the advice that saves the visit — the coin cell before the
    // remote, the tow you did not need. A cause without one is a trade name
    // and nothing else.
    check(
      `${situation.key} → "${cause.labelEn}" explains itself in both languages`,
      Boolean(cause.noteEn && cause.noteFr),
      true,
    );
  });
});

// ── The triage has to route somewhere different ─────────────────────────
//
// If every situation resolved to "keys" this screen would be a filtered
// garage list with extra steps, and the claim that it names the right trade
// would be false.
const routed = new Set(
  keySituations.flatMap((situation) => specialtiesForSituation(situation.key)),
);
check("triage reaches more than one trade", routed.size > 1, true);
check("triage reaches keys and locks", routed.has("keys"), true);
check("triage reaches auto electrics", routed.has("elec"), true);

// The two most commonly misdirected. A key that turns and does not start is
// sent to a locksmith by default and is usually an immobiliser or a battery;
// a locked-out car is a call-out rather than a workshop visit.
check(
  "a key that turns without starting reaches electrics",
  specialtiesForSituation("turnsNoStart").includes("elec"),
  true,
);
check(
  "…and is not treated as a battery-only fault",
  specialtiesForSituation("turnsNoStart")[0],
  "elec",
);
check(
  "being locked out reaches breakdown as well",
  specialtiesForSituation("lockedOut").includes("depan"),
  true,
);
check(
  "a worn barrel can be mechanical",
  specialtiesForSituation("barrelWorn").includes("meca"),
  true,
);

check("an unknown situation routes nowhere", specialtiesForSituation("nope").length, 0);

// ── Key types ───────────────────────────────────────────────────────────
//
// "I don't know" must exist and must tell the reader how to look. Forcing a
// guess is how somebody pays for a duplicate that cannot start the car.
check(
  "not knowing is one of the options",
  keyTypes.some((item) => item.key === "unknown"),
  true,
);
const unknown = getKeyType("unknown");
check(
  "the unknown option says how to tell",
  /head of the key/i.test(unknown.noteEn) && /tête de la clé/i.test(unknown.noteFr),
  true,
);
keyTypes.forEach((item) => {
  check(
    `${item.key} labelled in both languages`,
    Boolean(item.labelEn && item.labelFr),
    true,
  );
  check(
    `${item.key} explained in both languages`,
    Boolean(item.noteEn && item.noteFr),
    true,
  );
});

// ── The services list ───────────────────────────────────────────────────
//
// Coding has to be offered separately from cutting. Merge them and the
// screen loses the one distinction it exists to draw.
const serviceKeys = keyServices.map((item) => item.key);
check("coding is offered on its own", serviceKeys.includes("coding"), true);
check("a duplicate is offered", serviceKeys.includes("duplicate"), true);
check("the cheap fix is offered", serviceKeys.includes("remoteShell"), true);
keyServices.forEach((item) => {
  check(`${item.key} has an icon`, Boolean(item.icon), true);
  check(
    `${item.key} labelled in both languages`,
    Boolean(item.labelEn && item.labelFr),
    true,
  );
  check(
    `${item.key} explains itself in both languages`,
    Boolean(item.noteEn && item.noteFr),
    true,
  );
});

// ── Proof of ownership ──────────────────────────────────────────────────
//
// The carte grise and an ID are the whole point of the checklist. Drop
// either and the screen stops telling somebody what a careful locksmith
// looks like.
const checklistKeys = keyChecklist.map((item) => item.key);
check("the carte grise is listed", checklistKeys.includes("carteGrise"), true);
check("an ID is listed", checklistKeys.includes("id"), true);
keyChecklist.forEach((item) => {
  check(
    `${item.key} labelled in both languages`,
    Boolean(item.labelEn && item.labelFr),
    true,
  );
});

// ── The matcher this screen leans on still works ────────────────────────
//
// "serrurier" is a building far more often than a car, which is why the
// garage matcher requires vehicle context for the weak terms. This screen
// inherits that rule rather than re-implementing it, so it is worth
// asserting it still holds — if it ever loosened, this screen would fill
// with people who fit door locks in houses.
check(
  "an auto locksmith matches",
  matchesGarageSpecialty(
    "Serrurier auto : clés voiture taillées et codées, télécommandes",
    "keys",
  ),
  true,
);
check(
  "a house locksmith does not",
  matchesGarageSpecialty(
    "Serrurerie bâtiment : portes, cadenas et coffres pour maisons et bureaux",
    "keys",
  ),
  false,
);

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: car keys — ${keySituations.length} situations routed across ` +
    `${routed.size} trades, ${keyTypes.length} key types, ` +
    `${keyServices.length} jobs, house locksmiths stay out`,
);
