// Guards the air-conditioning triage.
//
// This screen's whole value is that it names the trade. Half of what stops a
// car cooling is not refrigeration work — a dead blower is electrical, a
// squeal on engagement can be a belt — and a symptom pointed at the wrong
// specialty sends somebody across town to a workshop that cannot help. That
// failure looks like a working screen from here and like a wasted morning
// from the car.
//
// So every specialty named by a cause has to be a specialty the garage
// matcher can actually produce. A typo — "elect" for "elec" — would filter
// the provider list down to nobody and read as "no workshops near you".
//
// Run: node scripts/check-aircon.js
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
  airconSymptoms,
  airconServices,
  refrigerants,
  specialtiesForSymptom,
  getRefrigerant,
} = loadEsm("src/data/aircon.js");
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
airconSymptoms.forEach((symptom) => {
  check(
    `${symptom.key} labelled in both languages`,
    Boolean(symptom.labelEn && symptom.labelFr),
    true,
  );
  check(`${symptom.key} has an icon`, Boolean(symptom.icon), true);
  check(`${symptom.key} has at least one cause`, symptom.causes.length > 0, true);
  symptom.causes.forEach((cause) => {
    check(
      `${symptom.key} → "${cause.labelEn}" names a real specialty (${cause.specialty})`,
      known.has(cause.specialty),
      true,
    );
    check(
      `${symptom.key} → "${cause.labelEn}" is labelled in both languages`,
      Boolean(cause.labelEn && cause.labelFr),
      true,
    );
  });
});

// ── The triage has to actually route somewhere different ────────────────
//
// If every symptom resolved to "clim" the screen would be a filtered garage
// list with extra steps, and the claim that it names the right trade would
// be false.
const routed = new Set(
  airconSymptoms.flatMap((symptom) => specialtiesForSymptom(symptom.key)),
);
check("triage reaches more than one trade", routed.size > 1, true);
check("triage reaches air conditioning", routed.has("clim"), true);
check("triage reaches auto electrics", routed.has("elec"), true);

// The two that are commonly mistaken for gas faults and are not.
check(
  "no air at all is an electrical fault, not a gas one",
  specialtiesForSymptom("noAir").includes("clim"),
  false,
);
check(
  "no air at all routes to electrics",
  specialtiesForSymptom("noAir").includes("elec"),
  true,
);
check(
  "warm in traffic reaches electrics (the condenser fan)",
  specialtiesForSymptom("warmInTraffic").includes("elec"),
  true,
);
check(
  "a noise on engagement can be mechanical",
  specialtiesForSymptom("noise").includes("meca"),
  true,
);

check("an unknown symptom routes nowhere", specialtiesForSymptom("nope").length, 0);

// ── Refrigerants ────────────────────────────────────────────────────────
//
// "I don't know" must exist and must be the one that tells the reader where
// to look. Forcing a guess between two gases is how the wrong one gets put
// in — which is the failure the whole section exists to prevent.
check("three answers offered", refrigerants.length, 3);
check(
  "not knowing is one of them",
  refrigerants.some((item) => item.key === "unknown"),
  true,
);
const unknown = getRefrigerant("unknown");
check(
  "the unknown option sends the reader to the label",
  /label/i.test(unknown.noteEn) && /étiquette/i.test(unknown.noteFr),
  true,
);
refrigerants.forEach((item) => {
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
// Leak detection has to be offered, and recharge has to say that on its own
// it treats nothing. Drop either and the screen quietly becomes an advert
// for the repeat sale it was written to warn about.
const keys = airconServices.map((item) => item.key);
check("leak detection is offered", keys.includes("leak"), true);
check("recharge is offered", keys.includes("recharge"), true);
check("the cheap fix is offered", keys.includes("filter"), true);
airconServices.forEach((item) => {
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

// ── The matcher this screen leans on still works ────────────────────────
//
// "climatisation" is a building far more often than a car, which is why the
// garage matcher requires vehicle context for it. This screen inherits that
// rule rather than re-implementing it, so it is worth asserting the rule
// still holds — if it ever loosened, this screen would fill with people who
// install split units in offices.
check(
  "a car A/C workshop matches",
  matchesGarageSpecialty(
    "Garage auto : climatisation, recharge et compresseur",
    "clim",
  ),
  true,
);
check(
  "a building A/C installer does not",
  matchesGarageSpecialty(
    "Installation et entretien de climatisation, bureaux et villas",
    "clim",
  ),
  false,
);

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: air conditioning — ${airconSymptoms.length} symptoms routed across ` +
    `${routed.size} trades, ${airconServices.length} jobs, building A/C stays out`,
);
