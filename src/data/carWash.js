import { matchesTrade, mentionsAnyWord } from "../utils/wordMatch";

// Lavage — what a wash costs, and why it is never one number.
//
// The price of a wash is decided by two things and neither of them is the
// station: what you drive, and what you are asking for. A moto rinsed
// outside and a 4×4 with its seats shampooed are the same trade and a
// twentyfold difference in price. So the screen asks for both before it
// shows anybody, and every provider answers the same question — which is
// the only way a reader can compare them at all.
//
// What this file does NOT hold is prices. A tempting version of this screen
// carries a tariff table: extérieur berline 1 500, complet 3 000. It would
// be wrong within a month, wrong across town on the day it shipped, and it
// would be us inventing a number on behalf of a business we have never
// telephoned. Each washer declares their own, per formula and per vehicle,
// and a cell they left blank says so.

export const washModes = [
  {
    key: "station",
    icon: "home-outline",
    labelEn: "At the station",
    labelFr: "En station",
    hintEn: "You drive to them",
    hintFr: "Vous vous déplacez",
  },
  {
    key: "domicile",
    icon: "car-outline",
    labelEn: "At your place",
    labelFr: "À domicile",
    hintEn: "They come to you",
    hintFr: "Ils viennent à vous",
  },
];

// The four classes every washer in Bénin already prices by. They are not
// body types for their own sake: they are the size bands a price list is
// actually written in, which is why a saloon and an estate are one entry.
export const washVehicles = [
  {
    key: "moto",
    icon: "bicycle-outline",
    labelEn: "Motorbike",
    labelFr: "Moto",
  },
  {
    key: "berline",
    icon: "car-outline",
    labelEn: "Saloon",
    labelFr: "Berline",
  },
  {
    key: "suv",
    icon: "car-sport-outline",
    labelEn: "4×4 / SUV",
    labelFr: "4×4 / SUV",
  },
  {
    key: "util",
    icon: "bus-outline",
    labelEn: "Van",
    labelFr: "Utilitaire",
  },
];

export function getWashVehicleLabel(key, language) {
  const item = washVehicles.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

// The formulas, in the order they escalate. `vehicles` is the honest limit
// of each one — nobody shampoos the seats of a motorbike — and `homeOk`
// marks the two that cannot be done in a courtyard: polishing and ceramic
// need a roof, because dust settling on a wet panel is the whole problem.
//
// `durationFr` is how long the work takes, not a promise from any provider.
// It is here because it changes the decision: a shampooing is not something
// you wait for, and a reader who does not know that plans their day wrong.
export const washFormulas = [
  {
    key: "ext",
    icon: "water-outline",
    vehicles: ["moto", "berline", "suv", "util"],
    homeOk: true,
    labelEn: "Exterior",
    labelFr: "Extérieur",
    detailEn: "Bodywork, wheels, windows",
    detailFr: "Carrosserie, jantes, vitres",
    durationEn: "About 20 min",
    durationFr: "Environ 20 min",
    noteEn:
      "The everyday wash. Ask whether the wheels and the door shuts are included — that is usually the difference between two prices.",
    noteFr:
      "Le lavage courant. Demandez si les jantes et les entrées de portes sont comprises : c’est souvent là qu’est l’écart entre deux prix.",
  },
  {
    key: "full",
    icon: "sparkles-outline",
    vehicles: ["moto", "berline", "suv", "util"],
    homeOk: true,
    labelEn: "Interior and exterior",
    labelFr: "Complet intérieur + extérieur",
    detailEn: "Vacuum, dashboard, inside glass",
    detailFr: "Aspirateur, tableau de bord, vitres intérieures",
    durationEn: "About 45 min",
    durationFr: "Environ 45 min",
    noteEn:
      "A vacuum and a wipe-down, not a deep clean. Stained seats need the shampoo below, and it is a different price.",
    noteFr:
      "Un aspirateur et un coup de chiffon, pas un nettoyage en profondeur. Des sièges tachés relèvent du shampooing ci-dessous, à un autre tarif.",
  },
  {
    key: "engine",
    icon: "cog-outline",
    vehicles: ["moto", "berline", "suv", "util"],
    homeOk: true,
    labelEn: "Engine bay",
    labelFr: "Moteur",
    detailEn: "Degreasing the engine compartment",
    detailFr: "Dégraissage du compartiment moteur",
    durationEn: "About 30 min",
    durationFr: "Environ 30 min",
    noteEn:
      "Ask how they protect the electrics. A pressure washer aimed at the fuse box or the alternator is the commonest way a clean engine becomes a repair.",
    noteFr:
      "Demandez comment ils protègent l’électricité. Un jet haute pression dirigé sur la boîte à fusibles ou l’alternateur est la première raison qu’un moteur propre devienne une réparation.",
  },
  {
    key: "seats",
    icon: "bed-outline",
    vehicles: ["berline", "suv", "util"],
    homeOk: true,
    labelEn: "Seat and carpet shampoo",
    labelFr: "Shampooing sièges et moquette",
    detailEn: "Injection-extraction",
    detailFr: "Injection-extraction",
    durationEn: "3 to 6 hours of drying",
    durationFr: "3 à 6 h de séchage",
    noteEn:
      "Leave the car for the day. Driving away with damp seats in this climate is how a car starts to smell, and the smell is harder to remove than the stain was.",
    noteFr:
      "Laissez la voiture sur place. Repartir avec des sièges humides sous ce climat, c’est ainsi qu’une voiture commence à sentir — et l’odeur est plus difficile à enlever que la tache.",
  },
  {
    key: "polish",
    icon: "flashlight-outline",
    vehicles: ["berline", "suv"],
    homeOk: false,
    labelEn: "Polishing",
    labelFr: "Polissage et lustrage",
    detailEn: "Correcting fine scratches",
    detailFr: "Correction des micro-rayures",
    durationEn: "Half a day",
    durationFr: "Une demi-journée",
    noteEn:
      "Removes a layer of the clear coat, so it cannot be repeated indefinitely. Ask what has already been done to the paint before agreeing.",
    noteFr:
      "Retire une couche de vernis : cela ne se répète pas indéfiniment. Demandez ce qui a déjà été fait sur la peinture avant d’accepter.",
  },
  {
    key: "ceramic",
    icon: "shield-checkmark-outline",
    vehicles: ["berline", "suv"],
    homeOk: false,
    labelEn: "Ceramic coating",
    labelFr: "Traitement céramique",
    detailEn: "Long-lasting protection",
    detailFr: "Protection longue durée",
    durationEn: "A full day, plus curing",
    durationFr: "Une journée, plus le durcissement",
    noteEn:
      "Ask how long before the car can be rained on, and what the guarantee actually covers. This is the treatment where the promise and the product vary most.",
    noteFr:
      "Demandez combien de temps avant que la voiture puisse prendre la pluie, et ce que couvre réellement la garantie. C’est le traitement où la promesse et le produit varient le plus.",
  },
];

export function washFormulasFor(vehicle, mode) {
  return washFormulas
    .filter((item) => !vehicle || item.vehicles.includes(vehicle))
    .filter((item) => mode !== "domicile" || item.homeOk);
}

// Everything the washer could be asked to price, given the classes they
// take. A union rather than an intersection: somebody who takes motorbikes
// AND saloons still offers seat shampooing — on the saloons.
export function washFormulasForVehicles(vehicleKeys) {
  if (!vehicleKeys?.length) return washFormulas;
  return washFormulas.filter((item) =>
    item.vehicles.some((key) => vehicleKeys.includes(key)),
  );
}

export function getWashFormula(key) {
  return washFormulas.find((entry) => entry.key === key) ?? null;
}

export function getWashFormulaLabel(key, language) {
  const item = getWashFormula(key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

export function getWashFormulaNote(key, language) {
  const item = getWashFormula(key);
  if (!item) return null;
  return language === "en" ? item.noteEn : item.noteFr;
}

export function getWashFormulaDuration(key, language) {
  const item = getWashFormula(key);
  if (!item) return null;
  return language === "en" ? item.durationEn : item.durationFr;
}

// One declared price is one formula for one class of vehicle, and the key
// says exactly that. Underscore rather than a dot, because a dot in a
// Firestore map key is read as a path separator and would silently nest.
export function washPriceKey(formula, vehicle) {
  return `${formula}_${vehicle}`;
}

// Words that place a listing here.
//
// The whole difficulty of this trade is one word: in French "lavage" is
// laundry at least as often as it is cars, and a blanchisserie writes it in
// every advert it publishes. So the bare word is never enough — it needs a
// vehicle beside it — and the phrases below are strong only because they
// name the vehicle themselves.
const WASH_CONTEXT = [
  "voiture",
  "véhicule",
  "auto",
  "automobile",
  "moto",
  "camion",
  "carrosserie",
  "jante",
  "4x4",
];

const WASH_TERMS = {
  terms: [
    "lavage auto",
    "lavage automobile",
    "lavage voiture",
    "lavage de voiture",
    "lavage véhicule",
    "station de lavage",
    "car wash",
    "lavage moto",
  ],
  // Each of these is a real washing word and none of them is ours alone. A
  // pressing polishes nothing but says "nettoyage à sec"; a household
  // cleaner says "nettoyage" all day. They count once a vehicle is in the
  // sentence.
  weakTerms: [
    "lavage",
    "nettoyage",
    "detailing",
    "polissage",
    "lustrage",
    "céramique",
    "shampooing",
  ],
  context: WASH_CONTEXT,
};

// Trades that wash something else, checked only against the weak terms.
//
// The order here was wrong on the first attempt and the test caught it the
// wrong way round, so it is worth writing down. A plain laundry advert never
// reaches this list at all: it says "lavage" and "nettoyage" but never
// "voiture", so the context requirement has already refused it. What the
// list actually decides is the business that does BOTH — "blanchisserie et
// lavage auto, même local" — and refusing that one is a mistake. They said
// lavage auto. They wash cars.
//
// So an unmistakable term wins outright below, and this list only breaks the
// tie when the match rested on a weak word beside an incidental "voiture".
const NOT_WASH = [
  "blanchisserie",
  "pressing",
  "laverie",
  "linge",
  "vêtements",
  "repassage",
  "nettoyage à sec",
  "femme de ménage",
  "nettoyage de bureaux",
  "nettoyage industriel",
];

export function isWashListing(text) {
  // Said it plainly, so it is ours whatever else they do.
  if (mentionsAnyWord(text, WASH_TERMS.terms)) return true;
  if (mentionsAnyWord(text, NOT_WASH)) return false;
  return matchesTrade(text, WASH_TERMS);
}
