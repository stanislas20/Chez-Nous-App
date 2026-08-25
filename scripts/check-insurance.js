// Guards the motor-insurance screen against the two ways it can lie.
//
// The first is the matcher. "Assurance" is the widest word in the trade —
// health cover, life cover, travel cover, and every bank's side business use
// it — so a health mutuelle drifting onto a motor screen costs somebody an
// afternoon, and nobody reports it as a bug.
//
// The second is worse and is the reason the screen exists: the formula table
// is the only place in the app that explains what a policy does NOT do, and
// a "tous risques" row with an empty exclusions list would read as covering
// everything. What each formula misses matters more than what it covers.
//
// Run: node scripts/check-insurance.js
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
  isInsuranceListing,
  insuranceFormulas,
  insuranceVehicles,
  insuranceDurations,
  powerBands,
  formulasFor,
  insurancePriceKey,
} = loadEsm("src/data/insurance.js");

const failures = [];
const check = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label} — got ${actual}, expected ${expected}`);
  }
};

// ── Genuine motor agencies ──────────────────────────────────────────────
[
  "Assurance auto toutes compagnies, Ganhi",
  "Assurance automobile et flotte d’entreprise",
  "Courtier en assurances : attestation auto en 24h",
  "Assurance moto et deux roues, tarif jeune conducteur",
  "Car insurance broker, Cotonou",
  "Souscription et renouvellement d’assurance véhicule",
  "Carte brune CEDEAO pour vos voyages en voiture",
].forEach((text) =>
  check(`motor: ${text.slice(0, 42)}`, isInsuranceListing(text), true),
);

// ── Cover that is not motor cover ───────────────────────────────────────
// Every one of these says "assurance" and none of them belongs here.
[
  "Assurance maladie pour toute la famille",
  "Mutuelle de santé, adhésion ouverte",
  "Assurance vie et épargne retraite",
  "Assurance voyage et assistance à l’étranger",
  "Assurance habitation, dégâts des eaux et incendie",
  "Assurance scolaire pour vos enfants",
  "Health insurance plans for expatriates",
].forEach((text) =>
  check(`not motor: ${text.slice(0, 38)}`, isInsuranceListing(text), false),
);

// ── The case the wash screen taught us ──────────────────────────────────
// An agency that writes health AND motor is a motor agency for our
// purposes. Excluding it because it also sells health cover loses a real
// one — so an unmistakable term beats the exclusion list.
[
  "Assurance maladie et assurance auto, même agence",
  "Mutuelle de santé et assurance automobile",
].forEach((text) =>
  check(`writes both: ${text.slice(0, 36)}`, isInsuranceListing(text), true),
);

// And the weak-term side, which is what the exclusion list is actually FOR.
// Each of these carries an insurance word AND a vehicle word, so each one
// matches on the weak terms and is only kept out by being named as
// something other than motor cover. Delete an entry from NOT_MOTOR and the
// corresponding line here fails — that is the point of listing them
// one-for-one rather than trusting the list to be exercised by accident.
[
  // health cover sold to drivers — the commonest of these, and the one a
  // list-without-a-test lets through
  "Assurance maladie pour les conducteurs de taxi",
  "Mutuelle de santé pour chauffeurs et livreurs à moto",
  "Assurance vie pour propriétaires de véhicule",
  "Assurance habitation — nous nous déplaçons en voiture",
  "Assurance voyage, prise en charge du taxi à l’aéroport",
  "Assurance scolaire, transport des élèves en car",
  "Assurance agricole : récolte, cheptel et camion de la coopérative",
  "Life insurance for car owners",
  "Travel insurance including airport car transfer",
].forEach((text) =>
  check(
    `mentions a vehicle: ${text.slice(0, 30)}`,
    isInsuranceListing(text),
    false,
  ),
);

// ── Trades that are not insurance at all ────────────────────────────────
[
  "Garage mécanique et vidange rapide",
  "Vente de pneus neufs et occasion",
  "Banque : ouverture de compte et crédit",
].forEach((text) =>
  check(`not ours: ${text.slice(0, 38)}`, isInsuranceListing(text), false),
);

// ── The formula table ───────────────────────────────────────────────────
insuranceFormulas.forEach((formula) => {
  check(
    `${formula.key} labelled in both languages`,
    Boolean(formula.labelEn && formula.labelFr),
    true,
  );
  check(
    `${formula.key} tagged in both languages`,
    Boolean(formula.tagEn && formula.tagFr),
    true,
  );
  check(
    `${formula.key} says what it covers`,
    formula.coversEn.length > 0 && formula.coversFr.length > 0,
    true,
  );
  check(
    `${formula.key} covers match across languages`,
    formula.coversEn.length,
    formula.coversFr.length,
  );
  check(
    `${formula.key} exclusions match across languages`,
    formula.missesEn.length,
    formula.missesFr.length,
  );
  check(
    `${formula.key} applies to at least one vehicle`,
    formula.vehicles.length > 0,
    true,
  );
  formula.vehicles.forEach((key) =>
    check(
      `${formula.key} names a real vehicle (${key})`,
      insuranceVehicles.some((item) => item.key === key),
      true,
    ),
  );
});

// The cheapest formula is the one people are sold as "assurance" full stop,
// and its exclusions are the entire reason to read further. If this list
// ever empties, the screen starts implying third-party covers your own car.
const liability = insuranceFormulas.find((f) => f.key === "liability");
check(
  "third-party states what it does not cover",
  liability.missesEn.length > 0,
  true,
);

// Comprehensive must carry its own warning: most insurers will not write it
// on an older vehicle, and finding that out at the counter is the failure.
const comprehensive = insuranceFormulas.find((f) => f.key === "comprehensive");
check(
  "comprehensive warns about the age limit",
  Boolean(comprehensive.warnEn && comprehensive.warnFr),
  true,
);
// Offering it on a motorbike sends somebody to ask for a contract that will
// be refused.
check(
  "comprehensive is not offered on two-wheelers",
  comprehensive.vehicles.includes("moto"),
  false,
);
check(
  "every vehicle can at least be covered third-party",
  insuranceVehicles.every((v) => formulasFor(v.key).length > 0),
  true,
);

// ── Fiscal horsepower is asked for only where it is the rating basis ────
// A two-wheeler is rated on engine size; asking for a CV band would be
// asking for a figure the reader's papers do not contain.
check(
  "motorbikes are not rated on fiscal horsepower",
  insuranceVehicles.find((v) => v.key === "moto").ratedByPower,
  false,
);
check(
  "cars are",
  insuranceVehicles.find((v) => v.key === "car").ratedByPower,
  true,
);
check("three power bands", powerBands.length, 3);

// ── Terms, and the price key ────────────────────────────────────────────
check(
  "a twelve-month term exists",
  insuranceDurations.some((d) => d.months === 12),
  true,
);
insuranceDurations.forEach((d) =>
  check(
    `${d.months} months labelled in both languages`,
    Boolean(d.labelEn && d.labelFr),
    true,
  ),
);

// A dot in a Firestore map key is read as a path separator and would nest
// the premium silently. Underscore, and only underscore.
const key = insurancePriceKey("extended", "car", 12);
check("price key has no dot", key.includes("."), false);
check("price key shape", key, "extended_car_12");
// The term is part of the key, because an annual premium divided by four is
// not the three-month premium and must never be shown as one.
check(
  "the term is part of the key",
  insurancePriceKey("extended", "car", 3) !== key,
  true,
);
check(
  "the vehicle is part of the key",
  insurancePriceKey("extended", "van", 12) !== key,
  true,
);

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: motor insurance — ${insuranceFormulas.length} formulas across ` +
    `${insuranceVehicles.length} vehicles, health and life cover stay out`,
);
