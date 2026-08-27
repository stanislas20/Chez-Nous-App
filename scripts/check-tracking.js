// Guards the GPS & traceur screen.
//
// Two things can go wrong here and neither raises an error.
//
// The matcher is the first. "GPS" is a feature line on half the cars for
// sale in the country and "traceur" is a plotter in a printing shop — this
// screen is one loosened term away from listing reprographers as tracker
// fitters. The lookalikes below are the ones that actually exist in Cotonou.
//
// The second is the advice. Every need names the kinds of box that answer
// it, and the screen marks them and argues when somebody picks another. If
// a need ever named a kind that does not exist, the recommendation silently
// disappears and the screen goes quiet exactly where it is supposed to
// speak — the theft case above all, where the whole point is that an OBD
// plug-in is the wrong answer.
//
// Run: node scripts/check-tracking.js
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
  trackerKinds,
  trackingNeeds,
  trackingQuestions,
  kindSuitsNeed,
  getTrackerKind,
} = loadEsm("src/data/carTracking.js");
const { garageSpecialties, matchesGarageSpecialty } = loadEsm(
  "src/data/garageSpecialties.js",
);

const failures = [];
const check = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label} — got ${actual}, expected ${expected}`);
  }
};

// ── The specialty exists at all ─────────────────────────────────────────
check(
  "gps is a garage specialty",
  garageSpecialties.some((item) => item.key === "gps"),
  true,
);

// ── The lookalikes ──────────────────────────────────────────────────────
const MATCHES = [
  ["Installation traceur GPS véhicule, géolocalisation temps réel", true],
  ["Géolocalisation de flotte, installation et abonnement mensuel", true],
  ["Pose de balise GPS sur voiture et moto, alerte coupure", true],
  ["Antivol et alarme auto, pose de balise sur voiture", true],
  // A plotter is a traceur. Cotonou has more print shops than tracker
  // fitters, and nothing in this sentence is about a vehicle.
  ["Traceur A0 et plotter, imprimerie et reprographie Cotonou", false],
  ["Vente GPS de randonnée et cartes topographiques", false],
  // A car advert listing GPS as an option. Providers are drawn from
  // Services listings so this cannot reach the screen today, but the term
  // stays weak so it still cannot if that pool ever widens.
  ["Toyota Corolla 2015, clim, GPS, caméra de recul", false],
  ["Topographie et bornage, relevés GPS de terrain", false],
];
MATCHES.forEach(([text, want]) => {
  check(
    `${want ? "matches" : "does not match"}: "${text.slice(0, 48)}…"`,
    matchesGarageSpecialty(text, "gps"),
    want,
  );
});

// ── Kinds ───────────────────────────────────────────────────────────────
const kindKeys = new Set(trackerKinds.map((item) => item.key));
trackerKinds.forEach((item) => {
  check(
    `${item.key} labelled, hinted and explained in both languages`,
    Boolean(
      item.labelEn && item.labelFr && item.hintEn && item.hintFr &&
      item.noteEn && item.noteFr,
    ),
    true,
  );
  check(`${item.key} has an icon`, Boolean(item.icon), true);
});
check("an unknown kind resolves to nothing", getTrackerKind("nope"), null);

// ── Needs, and the kinds they recommend ─────────────────────────────────
trackingNeeds.forEach((need) => {
  check(
    `${need.key} labelled, hinted and explained in both languages`,
    Boolean(
      need.labelEn && need.labelFr && need.hintEn && need.hintFr &&
      need.noteEn && need.noteFr,
    ),
    true,
  );
  check(`${need.key} has an icon`, Boolean(need.icon), true);
  check(`${need.key} recommends at least one kind`, need.kinds.length > 0, true);
  need.kinds.forEach((key) => {
    check(`${need.key} → "${key}" is a real kind`, kindKeys.has(key), true);
  });
  // A need that recommends everything recommends nothing, and the mismatch
  // warning could never fire.
  check(
    `${need.key} rules something out`,
    need.kinds.length < trackerKinds.length,
    true,
  );
});

// The argument the screen exists to make. Recovering a stolen vehicle needs
// a box that is still attached, so the plug-in is out and the hidden one is
// the first thing recommended.
check("theft recommends the hidden wired unit", kindSuitsNeed("theft", "wired"), true);
check("theft rules out the OBD plug-in", kindSuitsNeed("theft", "obd"), false);
check("theft rules out the battery unit", kindSuitsNeed("theft", "battery"), false);
// Asserted against the data rather than through a helper, because there was
// a kindsFor() here that nothing but this file ever called — a test proving
// an API the app does not ship.
const theft = trackingNeeds.find((item) => item.key === "theft");
check("theft names the wired unit first", theft.kinds[0], "wired");
// A trailer has nothing to wire into, so the battery unit is the only one.
check("a trailer takes the battery unit", kindSuitsNeed("asset", "battery"), true);
const asset = trackingNeeds.find((item) => item.key === "asset");
check("…and nothing else", asset.kinds.length, 1);
check("an unknown need suits nothing", kindSuitsNeed("nope", "wired"), false);

// The category error that was here: "traceur moto" sat beside the wired unit
// as though they were alternatives, when a motorcycle unit IS a wired unit.
// Every kind must describe how the box is powered and mounted, not what it
// is mounted to — so no kind may be named after a vehicle.
const VEHICLE_WORDS = ["moto", "voiture", "camion", "car", "bike", "truck"];
trackerKinds.forEach((item) => {
  check(
    `${item.key} is a mounting, not a vehicle`,
    VEHICLE_WORDS.includes(item.key),
    false,
  );
});

// ── The questions that stand where prices stand on Clés ─────────────────
const questionKeys = trackingQuestions.map((item) => item.key);
check("the all-in yearly cost is asked first", questionKeys[0], "yearly");
check("the reporting interval is asked", questionKeys.includes("interval"), true);
check("what happens when the SIM lapses is asked", questionKeys.includes("lapse"), true);
check("who owns the account is asked", questionKeys.includes("account"), true);
// Vehicles here cross to Nigeria, Togo and Niger routinely, and a SIM that
// does not roam is a tracker that stops at the border.
check("roaming across the border is asked", questionKeys.includes("borders"), true);
trackingQuestions.forEach((item) => {
  check(
    `${item.key} asked and explained in both languages`,
    Boolean(item.labelEn && item.labelFr && item.noteEn && item.noteFr),
    true,
  );
  check(`${item.key} has an icon`, Boolean(item.icon), true);
});

// ── No prices, deliberately ─────────────────────────────────────────────
//
// Clés carries figures because they were supplied for that trade. None were
// supplied for this one. If a number ever appears in this file it was
// invented, and it will be quoted back at an installer who never agreed to
// it — so the check refuses digits that look like money.
const source = require("fs").readFileSync(
  path.join(__dirname, "..", "src", "data", "carTracking.js"),
  "utf8",
);
const money = source.match(/\b\d{3,}\b/g) ?? [];
check(`no invented prices in the data (found ${money.join(", ")})`, money.length, 0);

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: tracking — ${trackingNeeds.length} needs over ${trackerKinds.length} kinds of box, ` +
    `${trackingQuestions.length} questions, ${MATCHES.length} matcher cases, plotters stay out`,
);
