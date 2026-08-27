// Guards the car-key screen.
//
// Two things can break here and neither shows up as an error.
//
// The prices are the screen. A job whose figure for a kind of key is
// undefined rather than an explicit null renders as "0 FCFA", which reads
// as free rather than as not applicable — and a plain blade has no remote
// battery to change. The ordering matters too: the headline promises that
// the same job costs more as the key gets harder, and a figure edited out
// of order would quietly contradict it. The two numbers quoted in the hero
// copy are pinned exactly, so moving either fails here rather than leaving
// the headline lying.
//
// The routing is the other half. Two of the six needs are not locksmith
// work — an immobiliser is an auto electrician and a car locked in the
// street is whoever is already driving — and a need pointed at a specialty
// the matcher cannot produce filters the provider list down to nobody and
// reads as "no locksmiths near you".
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
  keyNeeds,
  keyJobs,
  keyTypes,
  keyChecklist,
  jobsFor,
  priceRangeFor,
  specialtiesForNeed,
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
const TYPE_KEYS = keyTypes.map((item) => item.key);

// ── Every need turns into jobs that exist ───────────────────────────────
const jobKeys = new Set(keyJobs.map((item) => item.key));
keyNeeds.forEach((need) => {
  check(
    `${need.key} labelled and hinted in both languages`,
    Boolean(need.labelEn && need.labelFr && need.hintEn && need.hintFr),
    true,
  );
  check(`${need.key} has an icon`, Boolean(need.icon), true);
  check(
    `${need.key} explains itself in both languages`,
    Boolean(need.noteEn && need.noteFr),
    true,
  );
  check(`${need.key} names at least one job`, need.jobs.length > 0, true);
  need.jobs.forEach((key) => {
    check(`${need.key} → "${key}" is a real job`, jobKeys.has(key), true);
  });
  specialtiesForNeed(need.key).forEach((key) => {
    check(
      `${need.key} → specialty "${key}" exists`,
      known.has(key),
      true,
    );
  });
});

// ── Pricing is the whole screen, so it has to be complete ───────────────
//
// Every job carries a figure for every kind of key, or an explicit null.
// `undefined` is the dangerous one: it renders as "0 FCFA", which reads as
// free rather than as not applicable.
keyJobs.forEach((job) => {
  check(
    `${job.key} labelled and detailed in both languages`,
    Boolean(job.labelEn && job.labelFr && job.detailEn && job.detailFr),
    true,
  );
  check(`${job.key} has a duration`, Number.isFinite(job.mins), true);
  TYPE_KEYS.forEach((type) => {
    check(
      `${job.key} states a price or an explicit null for ${type}`,
      job.price[type] === null || Number.isFinite(job.price[type]),
      true,
    );
  });
  // The spread is the argument. A job that costs the same on a plain blade
  // as on a hands-free key would quietly contradict the headline.
  const priced = TYPE_KEYS.map((type) => job.price[type]).filter(
    (value) => value != null,
  );
  check(
    `${job.key} costs more as the key gets harder`,
    priced.every((value, i) => i === 0 || value > priced[i - 1]),
    true,
  );
});

// The headline is a promise about two specific numbers. If either moves,
// the hero copy is wrong and has to move with it.
const copy = keyJobs.find((item) => item.key === "copy");
const origin = keyJobs.find((item) => item.key === "origin");
check("a plain blade is copied for 3 500", copy.price.mech, 3500);
check("a hands-free key remade with no model is 145 000", origin.price.smart, 145000);

// ── Jobs that do not exist on a kind of key are dropped, not zeroed ─────
check(
  "a plain blade has no remote battery",
  jobsFor("remote", "mech").some((job) => job.key === "battery"),
  false,
);
check(
  "a chipped key does",
  jobsFor("remote", "remote").some((job) => job.key === "battery"),
  true,
);
// The immobiliser need is programming on both electronic kinds and nothing
// at all on a plain blade, which has no transponder to stop recognising.
check(
  "an immobiliser question does not arise on a plain blade",
  jobsFor("immo", "mech").length,
  0,
);
check("…and does on a chipped key", jobsFor("immo", "remote").length > 0, true);
check("an unknown need has no jobs", jobsFor("nope", "mech").length, 0);

// ── The range shown before anything is chosen ───────────────────────────
const lostSmart = priceRangeFor("lost", "smart");
check("losing every hands-free key has a range", Boolean(lostSmart), true);
check("…and it is a range, not a point", lostSmart.max > lostSmart.min, true);
check("a need with no jobs on a kind has no range", priceRangeFor("immo", "mech"), null);

// ── Key types ───────────────────────────────────────────────────────────
check("three kinds of key, which is what changes the price", keyTypes.length, 3);
keyTypes.forEach((item) => {
  check(
    `${item.key} labelled, hinted and explained in both languages`,
    Boolean(
      item.labelEn && item.labelFr && item.hintEn && item.hintFr &&
      item.noteEn && item.noteFr,
    ),
    true,
  );
});
check("the cheapest kind is first", keyTypes[0].key, "mech");
check("the dearest kind is last", keyTypes[keyTypes.length - 1].key, "smart");
check("an unknown kind resolves to nothing", getKeyType("nope"), null);

// ── Routing ─────────────────────────────────────────────────────────────
//
// If every need resolved to "keys" the provider list would be a filtered
// garage list with extra steps, and the claim that this names the right
// trade would be false.
const routed = new Set(keyNeeds.flatMap((need) => specialtiesForNeed(need.key)));
check("routing reaches more than one trade", routed.size > 1, true);
check(
  "an immobiliser reaches auto electrics",
  specialtiesForNeed("immo").includes("elec"),
  true,
);
check(
  "being locked out reaches breakdown as well",
  specialtiesForNeed("locked").includes("depan"),
  true,
);
check("an unknown need routes nowhere", specialtiesForNeed("nope").length, 0);

// ── Proof of ownership ──────────────────────────────────────────────────
//
// The carte grise and an ID are the whole point of the checklist. Drop
// either and the screen stops telling somebody what a careful specialist
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
// garage matcher requires vehicle context for the weak terms. If that ever
// loosened, this screen would fill with people who fit door locks in houses.
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
  `clean: car keys — ${keyNeeds.length} needs across ${routed.size} trades, ` +
    `${keyJobs.length} jobs priced on ${keyTypes.length} kinds of key, ` +
    `house locksmiths stay out`,
);
