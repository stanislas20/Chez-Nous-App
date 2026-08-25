import {
  foldText,
  matchesTrade,
  mentionsAnyWord,
  mentionsWord,
} from "../utils/wordMatch";

// Where to buy a part, and nothing more than that.
//
// The tempting version of this screen matches a part to a car: you say
// Corolla 2008 and it shows you the right filter. We have no fitment data and
// no way to get any, so that screen would be confidently wrong — the same
// trap Pneus and Batterie stopped short of, where a size and a capacity are
// a search box the reader can correct rather than an answer the app gives.
//
// So the search here looks through what sellers SAY they stock, and the
// screen says so: a reference is confirmed on the telephone, not by us.

export const partScopes = [
  { key: "car", icon: "car-outline", labelEn: "Car", labelFr: "Voiture" },
  {
    key: "moto",
    icon: "bicycle-outline",
    labelEn: "Motorbike",
    labelFr: "Moto",
  },
];

// Families of parts, named the way a mechanic asks for them, with the
// examples that make each one unambiguous. A car and a motorbike get
// different families: a carénage and a chaîne mean nothing on a saloon, and
// a boîte de vitesses means nothing on a Bajaj.
export const partCategories = [
  {
    key: "engine",
    icon: "cog-outline",
    scopes: ["car", "moto"],
    labelEn: "Engine",
    labelFr: "Moteur",
    exampleEn: "Gasket, piston, pump",
    exampleFr: "Joint, piston, pompe",
    motoExampleEn: "Cylinder, piston, head",
    motoExampleFr: "Cylindre, piston, culasse",
  },
  {
    key: "brakes",
    icon: "aperture-outline",
    scopes: ["car", "moto"],
    labelEn: "Brakes",
    labelFr: "Freinage",
    exampleEn: "Pads, discs",
    exampleFr: "Plaquettes, disques",
    motoExampleEn: "Pads, shoes",
    motoExampleFr: "Plaquettes, mâchoires",
  },
  {
    key: "transmission",
    icon: "sync-outline",
    scopes: ["car", "moto"],
    labelEn: "Transmission",
    labelFr: "Transmission",
    exampleEn: "Clutch, driveshaft",
    exampleFr: "Embrayage, cardan",
    motoExampleEn: "Chain, sprocket, crown",
    motoExampleFr: "Chaîne, pignon, couronne",
  },
  {
    key: "suspension",
    icon: "git-commit-outline",
    scopes: ["car", "moto"],
    labelEn: "Suspension",
    labelFr: "Suspension",
    exampleEn: "Shocks, ball joints",
    exampleFr: "Amortisseurs, rotules",
    motoExampleEn: "Fork, shock absorber",
    motoExampleFr: "Fourche, amortisseur",
  },
  {
    key: "electric",
    icon: "flash-outline",
    scopes: ["car", "moto"],
    labelEn: "Electrical",
    labelFr: "Électrique",
    exampleEn: "Alternator, starter",
    exampleFr: "Alternateur, démarreur",
    motoExampleEn: "CDI, coil, regulator",
    motoExampleFr: "CDI, bobine, régulateur",
  },
  {
    key: "filters",
    icon: "funnel-outline",
    scopes: ["car"],
    labelEn: "Filtration",
    labelFr: "Filtration",
    exampleEn: "Oil, air, diesel",
    exampleFr: "Huile, air, gasoil",
  },
  {
    key: "body",
    icon: "car-sport-outline",
    scopes: ["car"],
    labelEn: "Bodywork",
    labelFr: "Carrosserie",
    exampleEn: "Wing, bumper, headlight",
    exampleFr: "Aile, pare-choc, phare",
  },
  {
    key: "cooling",
    icon: "thermometer-outline",
    scopes: ["car"],
    labelEn: "Cooling",
    labelFr: "Refroidissement",
    exampleEn: "Radiator, water pump",
    exampleFr: "Radiateur, pompe à eau",
  },
  {
    key: "fairing",
    icon: "shield-outline",
    scopes: ["moto"],
    labelEn: "Fairing",
    labelFr: "Carénage",
    motoExampleEn: "Mudguard, tank",
    motoExampleFr: "Garde-boue, réservoir",
  },
  {
    key: "wheels",
    icon: "ellipse-outline",
    scopes: ["moto"],
    labelEn: "Wheels",
    labelFr: "Roues",
    motoExampleEn: "Rim, spoke, inner tube",
    motoExampleFr: "Jante, rayon, chambre",
  },
  {
    key: "lighting",
    icon: "bulb-outline",
    scopes: ["moto"],
    labelEn: "Lighting",
    labelFr: "Éclairage",
    motoExampleEn: "Headlight, indicator",
    motoExampleFr: "Phare, clignotant",
  },
];

export function partCategoriesFor(scope) {
  return partCategories.filter((item) => item.scopes.includes(scope));
}

export function getPartCategoryExample(item, scope, language) {
  if (scope === "moto" && item.motoExampleFr) {
    return language === "en" ? item.motoExampleEn : item.motoExampleFr;
  }
  return language === "en" ? item.exampleEn : item.exampleFr;
}

export function getPartCategoryLabel(key, language) {
  const item = partCategories.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

// The quality of the part, which is the axis that decides the price and the
// one a listing most often leaves out. Each carries the sentence a buyer
// actually needs, because "adaptable" and "occasion" are not interchangeable
// and the difference is rarely explained at the counter.
export const partQualities = [
  {
    key: "all",
    labelEn: "All",
    labelFr: "Tous",
    noteEn:
      "Original, aftermarket or used — the same part often varies fourfold in price between them.",
    noteFr:
      "Origine, adaptable ou occasion — l’écart de prix va souvent de 1 à 4 pour la même pièce.",
  },
  {
    key: "origine",
    labelEn: "Original",
    labelFr: "Origine",
    noteEn:
      "The manufacturer's own part, in its box. The dearest, and the only one with a guaranteed reference.",
    noteFr:
      "Pièce du constructeur, en emballage d’origine. La plus chère, la seule avec une référence garantie.",
  },
  {
    key: "adaptable",
    labelEn: "Aftermarket",
    labelFr: "Adaptable",
    noteEn:
      "Made by a third party for this model. Quality varies a great deal by maker — ask for the brand, not only the price.",
    noteFr:
      "Fabriquée par un tiers pour ce modèle. Qualité très variable selon le fabricant — demandez la marque, pas seulement le prix.",
  },
  {
    key: "occasion",
    labelEn: "Used",
    labelFr: "Occasion",
    noteEn:
      "Taken off an imported vehicle. Insist on seeing it fitted or tested before you pay.",
    noteFr:
      "Prélevée sur un véhicule importé. Exigez de voir la pièce montée ou testée avant de payer.",
  },
];

export function getPartQualityLabel(key, language) {
  const item = partQualities.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

export function getPartQualityNote(key, language) {
  const item = partQualities.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.noteEn : item.noteFr;
}

// What kind of business it is, which changes what you should expect before
// you travel: a casse sells one of a thing and sells it as seen, a
// concession orders on a reference and takes a week.
export const partSellerKinds = [
  {
    key: "boutique",
    labelEn: "Shop",
    labelFr: "Boutique",
    tint: "neutral",
  },
  {
    key: "grossiste",
    labelEn: "Wholesaler",
    labelFr: "Grossiste",
    tint: "emerald",
  },
  {
    key: "casse",
    labelEn: "Breaker",
    labelFr: "Casse",
    tint: "gold",
  },
  {
    key: "concession",
    labelEn: "Dealership",
    labelFr: "Concession",
    tint: "blue",
  },
];

export function getPartSellerKind(key) {
  return partSellerKinds.find((entry) => entry.key === key) ?? null;
}

export function getPartSellerKindLabel(key, language) {
  const item = getPartSellerKind(key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

// Suggestions offered when a search finds nobody. Deliberately the parts
// people ask for most, not a random sample — an empty result is the moment a
// reader is most likely to give up, and a wrong spelling is the commonest
// reason for one.
export const commonPartSearches = {
  car: [
    "plaquettes de frein",
    "alternateur",
    "filtre à huile",
    "amortisseur",
    "radiateur",
  ],
  moto: ["chaîne", "cdi", "plaquettes de frein", "carburateur", "jante"],
};

// Searching what sellers say they stock.
//
// Matched loosely on purpose, and both ways round: a shop writes "plaquette
// de frein" and somebody searches "plaquettes", or writes "amortisseurs
// avant" and somebody searches "amortisseur". A strict match would answer
// "nobody" to a question four shops could have answered.
export function stockMatchesQuery(text, query) {
  const needle = (query ?? "").trim();
  if (needle.length < 2) return true;
  const words = needle.split(/\s+/).filter((word) => word.length >= 3);
  if (!words.length) return matchesEitherWay(text, needle);
  return words.every((word) => matchesEitherWay(text, word));
}

// Both directions, and that is the point.
//
// mentionsWord allows a text word to run a little longer than the term, so a
// shop that wrote "plaquettes" is found by somebody typing "plaquette". The
// reverse is just as common — the shop writes "plaquette de frein avant" and
// the buyer types the plural — and testing only one direction answers
// "nobody" to a question four shops could have answered.
function matchesEitherWay(text, word) {
  if (mentionsWord(text, word)) return true;
  return foldText(text)
    .split(" ")
    .some(
      (candidate) => candidate.length >= 4 && mentionsWord(word, candidate),
    );
}

// Words that place a listing here.
//
// "pièce" alone is refused, and that is the whole difficulty: in French a
// flat is "un trois pièces", so the bare word would drag every rental advert
// in the country onto a car-parts screen. The phrases below are unambiguous
// because they name the trade, not the noun.
const PARTS_CONTEXT = [
  "auto",
  "automobile",
  "voiture",
  "véhicule",
  "moto",
  "scooter",
  "camion",
];

const PARTS_TERMS = {
  terms: [
    "pièces détachées",
    "piece detachee",
    "pièces auto",
    "pièces moto",
    "casse auto",
    "casse automobile",
  ],
  // "pièces de rechange" is NOT strong: a hardware shop sells spare parts
  // for a pump in exactly those words. With a car word beside it the phrase
  // is unambiguous, and without one it is not ours.
  weakTerms: [
    "pièces",
    "rechange",
    "pièces de rechange",
    "casse",
    "accessoires",
  ],
  context: PARTS_CONTEXT,
};

// Trades that sell something else entirely but share a word. A hardware shop
// says "pièces de rechange" about a pump; a landlord says "pièces" about
// rooms. Checked before the match rather than by weakening the terms.
const NOT_PARTS = [
  "quincaillerie",
  "plomberie",
  "appartement",
  "chambre salon",
  "meublé",
  "location",
  "immobilier",
  "terrain",
];

export function isPartsSellerListing(text) {
  if (mentionsAnyWord(text, NOT_PARTS)) return false;
  return matchesTrade(text, PARTS_TERMS);
}
