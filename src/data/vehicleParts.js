import { matchesTrade, mentionsAnyWord } from "../utils/wordMatch";

// Where to buy a part, and nothing more than that.
//
// The tempting version of this screen matches a part to a car: you say
// Corolla 2008 and it shows you the right filter. We have no fitment data and
// no way to get any, so that screen would be confidently wrong — the same
// trap Pneus and Batterie stopped short of, where a size and a capacity are
// a search box the reader can correct rather than an answer the app gives.
//
// So this is a directory of the people who sell parts, split the one way that
// actually changes who you call: a car or a motorbike. What they stock is
// what they say they stock, and whether it fits your car is a conversation
// with them.

export const partScopes = [
  { key: "car", icon: "car-outline", labelEn: "Car", labelFr: "Voiture" },
  {
    key: "moto",
    icon: "bicycle-outline",
    labelEn: "Motorbike",
    labelFr: "Moto",
  },
];

// What a seller says they carry, by system — which is how a mechanic asks
// for it. Not a catalogue: a shop ticks what it stocks, and a buyer filters
// on it to avoid four phone calls.
export const partCategories = [
  {
    key: "brakes",
    icon: "aperture-outline",
    scopes: ["car", "moto"],
    labelEn: "Brakes",
    labelFr: "Freinage",
    detailEn: "Pads, discs, shoes, cables.",
    detailFr: "Plaquettes, disques, mâchoires, câbles.",
  },
  {
    key: "engine",
    icon: "cog-outline",
    scopes: ["car", "moto"],
    labelEn: "Engine",
    labelFr: "Moteur",
    detailEn: "Gaskets, pistons, valves, belts.",
    detailFr: "Joints, pistons, soupapes, courroies.",
  },
  {
    key: "filters",
    icon: "funnel-outline",
    scopes: ["car", "moto"],
    labelEn: "Filters & oil",
    labelFr: "Filtres & vidange",
    detailEn: "Oil, air, fuel, cabin.",
    detailFr: "Huile, air, carburant, habitacle.",
  },
  {
    key: "clutch",
    icon: "sync-outline",
    scopes: ["car", "moto"],
    labelEn: "Clutch & gearbox",
    labelFr: "Embrayage & boîte",
    detailEn: "Discs, cables, gearbox parts.",
    detailFr: "Disques, câbles, pièces de boîte.",
  },
  {
    key: "suspension",
    icon: "git-commit-outline",
    scopes: ["car", "moto"],
    labelEn: "Suspension & steering",
    labelFr: "Suspension & direction",
    detailEn: "Shocks, ball joints, bearings.",
    detailFr: "Amortisseurs, rotules, roulements.",
  },
  {
    key: "cooling",
    icon: "thermometer-outline",
    scopes: ["car", "moto"],
    labelEn: "Cooling",
    labelFr: "Refroidissement",
    detailEn: "Radiator, hoses, water pump.",
    detailFr: "Radiateur, durites, pompe à eau.",
  },
  {
    key: "exhaust",
    icon: "cloud-outline",
    scopes: ["car", "moto"],
    labelEn: "Exhaust",
    labelFr: "Échappement",
    detailEn: "Silencer, manifold, mountings.",
    detailFr: "Silencieux, collecteur, fixations.",
  },
  {
    key: "chain",
    icon: "link-outline",
    scopes: ["moto"],
    labelEn: "Chain & sprockets",
    labelFr: "Chaîne & pignons",
    detailEn: "Chain, sprockets, kits.",
    detailFr: "Chaîne, couronne, kits.",
  },
];

export function partCategoriesFor(scope) {
  return partCategories.filter((item) => item.scopes.includes(scope));
}

export function getPartCategoryLabel(key, language) {
  const item = partCategories.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

// New, used or aftermarket. This is the axis that matters most here and the
// one a listing most often leaves out: a part from a scrapped import is the
// larger market in Bénin, and a buyer needs to know which they are being
// offered before they travel across Cotonou for it.
export const partConditions = [
  {
    key: "new",
    icon: "cube-outline",
    labelEn: "New",
    labelFr: "Neuf",
    detailEn: "Boxed, sometimes with a warranty.",
    detailFr: "En boîte, parfois sous garantie.",
  },
  {
    key: "used",
    icon: "construct-outline",
    labelEn: "Used",
    labelFr: "Occasion",
    detailEn: "From a breaker — ask what it came off.",
    detailFr: "De casse — demandez de quoi elle vient.",
  },
  {
    key: "aftermarket",
    icon: "swap-horizontal-outline",
    labelEn: "Aftermarket",
    labelFr: "Adaptable",
    detailEn: "Equivalent, not the original brand.",
    detailFr: "Équivalent, sans être la marque d’origine.",
  },
];

export function getPartConditionLabel(key, language) {
  const item = partConditions.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

// What the app can honestly tell somebody buying a part it has never seen.
export const partBuyingTips = [
  {
    key: "reference",
    icon: "barcode-outline",
    labelEn: "Bring the old part, or its reference number",
    labelFr: "Apportez l’ancienne pièce, ou sa référence",
  },
  {
    key: "origin",
    icon: "help-circle-outline",
    labelEn: "For a used part, ask which vehicle it came off",
    labelFr: "Pour une pièce d’occasion, demandez de quel véhicule elle vient",
  },
  {
    key: "return",
    icon: "return-down-back-outline",
    labelEn:
      "Agree before paying whether it can be returned if it does not fit",
    labelFr: "Convenez avant de payer si elle est reprise si elle ne va pas",
  },
];

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
