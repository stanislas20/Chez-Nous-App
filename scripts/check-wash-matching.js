// Guards the car-wash matcher against the collision this trade is built on:
// in French, "lavage" is laundry at least as often as it is cars.
//
// A blanchisserie writes "lavage", "nettoyage" and "à domicile" in every
// advert it publishes, and every one of those words is also a car washer's.
// Get this wrong and the Lavage screen fills with people who press shirts —
// which does not crash anything, and which nobody would report as a bug.
//
// Run: node scripts/check-wash-matching.js
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
  isWashListing,
  washFormulasFor,
  washFormulasForVehicles,
  washFormulas,
  washPriceKey,
} = loadEsm("src/data/carWash.js");

const failures = [];
const check = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label} — got ${actual}, expected ${expected}`);
  }
};

// ── Genuine washers ─────────────────────────────────────────────────────
[
  "Lavage auto à Fidjrossè, intérieur et extérieur",
  "Station de lavage automobile, Akpakpa",
  "Car wash Cotonou, ouvert tous les jours",
  "Lavage voiture à domicile, je me déplace",
  "Lavage moto rapide, 500 F",
  "Nettoyage complet de votre véhicule, aspirateur et shampooing",
  "Polissage et lustrage carrosserie, local fermé",
  "Detailing auto : traitement céramique sur voiture",
].forEach((text) =>
  check(`wash: ${text.slice(0, 42)}`, isWashListing(text), true),
);

// ── Laundry, which is the whole reason this file exists ─────────────────
[
  "Blanchisserie moderne, lavage et repassage",
  "Pressing : nettoyage à sec de vos vêtements",
  "Laverie automatique, lavage du linge au kilo",
  "Lavage et repassage de linge à domicile",
  "Service de nettoyage à sec, costumes et robes",
].forEach((text) =>
  check(`laundry stays out: ${text.slice(0, 34)}`, isWashListing(text), false),
);

// ── The case the first version of this test got backwards ───────────────
// A business that does both said "lavage auto". Excluding it because it also
// presses shirts loses a real car washer, so an unmistakable term wins over
// the exclusion list. Removing "blanchisserie" from NOT_WASH must not make
// these pass — they pass on the strong term, and that is the point.
[
  "Blanchisserie et lavage auto, même local",
  "Pressing et station de lavage, Akpakpa",
].forEach((text) =>
  check(
    `does both, still ours: ${text.slice(0, 30)}`,
    isWashListing(text),
    true,
  ),
);

// And the weak-term side of the same coin: laundry that happens to mention a
// vehicle in passing is NOT a car washer, and here the exclusions do the
// work. This is the case that fails if NOT_WASH is emptied.
[
  "Blanchisserie : nous récupérons votre linge en voiture",
  "Pressing, nettoyage de vos vêtements, livraison en moto",
].forEach((text) =>
  check(
    `laundry with a vehicle: ${text.slice(0, 30)}`,
    isWashListing(text),
    false,
  ),
);

// ── Other trades that wash or clean something else ──────────────────────
[
  "Femme de ménage disponible, nettoyage maison",
  "Nettoyage de bureaux et entretien de locaux",
  "Nettoyage industriel, entrepôts et usines",
  "Vente de savon et de produits de lavage",
  "Plombier : fuite, robinet, chauffe-eau",
].forEach((text) =>
  check(`not ours: ${text.slice(0, 40)}`, isWashListing(text), false),
);

// ── The taxonomy's own limits ───────────────────────────────────────────
// A motorbike has no seats to shampoo and no panel worth polishing. If this
// ever changes, the posting form starts asking motorbike washers to price
// work they cannot do.
const motoKeys = washFormulasFor("moto", null).map((item) => item.key);
check("moto: no seat shampoo", motoKeys.includes("seats"), false);
check("moto: no polishing", motoKeys.includes("polish"), false);
check("moto: exterior offered", motoKeys.includes("ext"), true);

// Dust settling on wet paint is the reason. Both must stay out of at-home.
const homeKeys = washFormulasFor("berline", "domicile").map((item) => item.key);
check("at home: no polishing", homeKeys.includes("polish"), false);
check("at home: no ceramic", homeKeys.includes("ceramic"), false);
check("at home: full wash offered", homeKeys.includes("full"), true);

// A washer who takes both motorbikes and sedans is still asked about seat
// shampooing — the union, not the intersection.
const bothKeys = washFormulasForVehicles(["moto", "berline"]).map((i) => i.key);
check("moto + sedan: seats offered", bothKeys.includes("seats"), true);
check(
  "moto only: seats not offered",
  washFormulasForVehicles(["moto"]).some((item) => item.key === "seats"),
  false,
);

// A dot in a Firestore map key is read as a path separator and would nest
// the price silently. Underscore, and only underscore.
check(
  "price key has no dot",
  washPriceKey("ext", "berline").includes("."),
  false,
);
check("price key shape", washPriceKey("ext", "berline"), "ext_berline");

// Every formula must declare which vehicles it applies to, or the form has
// nothing to filter on and offers all four.
washFormulas.forEach((item) => {
  check(`${item.key} lists vehicles`, item.vehicles.length > 0, true);
  check(`${item.key} has a note`, Boolean(item.noteFr && item.noteEn), true);
});

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: car-wash matching — ${washFormulas.length} formulas, laundry and household cleaning stay out`,
);
