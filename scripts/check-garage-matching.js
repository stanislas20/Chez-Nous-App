// Guards the garage trade matcher against the failure that actually
// happened: a plumbing ad ("fuite, robinet, chauffe-eau") coming back as
// auto-electrics because "eau" appeared inside "faisceau".
//
// The matcher decides which Services listings appear on the Garages screen,
// so a regression here does not crash anything — it quietly shows a
// hairdresser to somebody whose car will not start. That is exactly the kind
// of fault a test catches and a person does not.
//
// Run: node scripts/check-garage-matching.js
const babel = require("@babel/core");
const vm = require("vm");
const path = require("path");

const file = path.join(__dirname, "..", "src", "data", "garageSpecialties.js");
const code = babel.transformFileSync(file, {
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
  babelrc: false,
  configFile: false,
}).code;
const moduleShim = { exports: {} };
vm.runInNewContext(code, {
  module: moduleShim,
  exports: moduleShim.exports,
  require: () => {},
  console,
});
const { isGarageListing, garageSpecialtiesFor } = moduleShim.exports;

// Real garages, each with the trades their own words should place them in.
const GARAGES = [
  [
    "Garage Kuabo — mécanicien toutes marques, vidange et freins",
    ["meca", "frein", "vidange"],
  ],
  ["Vente et montage de pneus, équilibrage et géométrie", ["pneu"]],
  ["Carrosserie et peinture automobile, débosselage", ["carro"]],
  ["Dépannage et remorquage 24h/24 pour voiture et camion", ["depan"]],
  ["Recharge climatisation auto et compresseur voiture", ["clim"]],
  ["Batterie voiture, livraison et pose", ["batt"]],
  ["Alternateur, démarreur, faisceau — électricité auto", ["elec"]],
  ["Diagnostic électronique valise OBD pour véhicule", ["diag"]],
  ["Plaquettes de frein et disques pour voiture", ["frein"]],
  ["Serrurier auto — clé perdue, télécommande de voiture", ["keys"]],

  // The way providers actually write, which is by the damage or the symptom
  // rather than by the trade. Every one of these published successfully and
  // appeared on no car screen at all before the terms were widened.
  ["Je répare les voitures accidentées", ["carro"]],
  ["Redressage et peinture de véhicules", ["carro"]],
  ["Rayures, capot et portière de voiture", ["carro"]],
  ["Tôlier auto, cabine de peinture", ["carro"]],
  ["Remplacement pare-brise et vitres de voiture", ["carro"]],
  ["Réparation klaxon et clignotants", ["elec"]],
  ["Fusibles et court-circuit sur voiture", ["elec"]],
  ["Phares, centralisation et vitres électriques auto", ["elec"]],
  ["Stator, régulateur et allumage moto", ["elec"]],
];

// Ordinary Services listings that share a word with a car trade and must
// still stay off the screen.
const NOT_GARAGES = [
  "Dépannage informatique et installation de logiciels",
  "Électricité générale : installation maison, tableau, prises",
  "Peinture bâtiment, intérieur et extérieur",
  "Climatisation de bâtiment, installation split",
  "Coiffure à domicile, tresses et soins",
  "Plomberie : fuite, robinet, chauffe-eau",
  "Traiteur : plateau repas et service en salle",
  "Nettoyage de bureaux et entretien de locaux",
  "Serrurerie bâtiment : serrure de porte et clé de maison",

  // The lookalikes the widened terms could have dragged in. The last is the
  // reason "cdi" is deliberately not an ignition term: in French it is a
  // permanent employment contract long before it is a car part, and it
  // would have pulled job ads onto a repair screen.
  "Peintre en bâtiment, façade et rayures sur mur",
  "Vitrerie bâtiment : pose de vitres et vitrage maison",
  "Électricien bâtiment : fusible, tableau, court-circuit maison",
  "Offre d’emploi CDI : comptable à Cotonou",
  "Couturier — retouches, ourlets et tissus",
  "Terrain accidenté à vendre, viabilisé",
];

let failures = 0;

for (const [text, expected] of GARAGES) {
  const found = garageSpecialtiesFor(text);
  const missing = expected.filter((key) => !found.includes(key));
  if (!isGarageListing(text) || missing.length > 0) {
    failures += 1;
    console.log(
      `missed: ${text}\n  got [${found}], expected to include [${expected}]`,
    );
  }
}

for (const text of NOT_GARAGES) {
  if (isGarageListing(text)) {
    failures += 1;
    console.log(
      `false positive: ${text}\n  matched [${garageSpecialtiesFor(text)}]`,
    );
  }
}

const total = GARAGES.length + NOT_GARAGES.length;
if (failures > 0) {
  console.log(`\n${failures} of ${total} garage-matching case(s) failing`);
  process.exit(1);
}
console.log(
  `clean: ${total} garage-matching cases (${GARAGES.length} trades, ${NOT_GARAGES.length} lookalikes)`,
);
