// Camions, utilitaires, et ce que la loi demande avant de charger.
//
// This vertical replaced a text search for "camion utilitaire" in Services,
// which returned whatever happened to use the phrase — a garage advertising
// that it repairs camions, a shop selling utilitaire tyres. Same failure the
// rest of carServiceCategories.js keeps apologising for.
//
// The screen has three intents, because "camion" is three different errands:
// buying one, hiring one for a day, or paying somebody to move a load. Only
// the third is a service; the first two are ordinary vehicle listings that
// already exist, filtered to the bodies that carry goods.
//
// EVERYTHING FACTUAL BELOW COMES FROM ANaTT — the agency that issues the
// papers — and nothing else does. What a truck costs, what a haulier charges
// and what a day's hire includes are each seller's own words, published in
// their own listing. A design draft for this screen carried named hauliers
// with star ratings and per-trip prices; none of it existed, so none of it
// is here.
//
//   Carte de transport   https://www.test.anatt.bj/e-service/carte-de-transport
//   Autorisations        https://test.anatt.bj/page/autorisations-de-transports
//   Permis de conduire   https://www.test.anatt.bj/page/permis-de-conduire
export const trucksReviewedOn = "2026-08-29";

export const ANATT_TRANSPORT_CARD_URL =
  "https://www.test.anatt.bj/e-service/carte-de-transport";
export const ANATT_AUTHORISATION_URL =
  "https://test.anatt.bj/page/autorisations-de-transports";
export const ANATT_LICENCE_URL =
  "https://www.test.anatt.bj/page/permis-de-conduire";
// Where the application is actually filed, per ANaTT's own e-service page.
export const ANATT_SYGFR_URL = "https://sygfr.anatt.bj";

// The three errands.
//
// `haul` is the one that needed a screen. Buying and hiring were reachable
// through Véhicules already; finding somebody to move forty sacks of cement
// was not reachable at all.
export const truckModes = [
  {
    key: "buy",
    icon: "pricetag-outline",
    labelEn: "Buy",
    labelFr: "Acheter",
    hintEn: "Used and new",
    hintFr: "Occasion et neuf",
  },
  {
    key: "rent",
    icon: "key-outline",
    labelEn: "Hire",
    labelFr: "Louer",
    hintEn: "By the day",
    hintFr: "À la journée",
  },
  {
    key: "haul",
    icon: "cube-outline",
    // One word, not "Faire transporter": at three tabs across a 360dp
    // screen the longer label reached the edge of its pill and would
    // ellipsize on anything narrower. The hero title still says the whole
    // phrase, so nothing is lost.
    labelEn: "Carry",
    labelFr: "Transporter",
    hintEn: "A carrier comes to you",
    hintFr: "Un transporteur vient",
  },
];

export function getTruckMode(key) {
  return truckModes.find((mode) => mode.key === key) ?? null;
}

// The bodies that carry goods, as the publish form already names them.
//
// Filtering on the seller's own declared body type rather than on words in
// the description: a listing that says "idéal pour le transport" is a saloon
// with a hopeful owner.
export const goodsBodyTypes = ["pickup", "van", "truck"];

// "What are you moving?" — a chooser, not a weight rating.
//
// The temptation was a payload band in tonnes, and it is a trap twice over.
// A listing does not declare its payload, so the number would be invented;
// and a vehicle's plated weight is not what it carries, since the body and
// the fuel come out of the same figure. So this asks what the load is and
// maps it to the bodies that take it — every part of which is either the
// reader's own answer or the seller's own declaration.
export const loadSizes = [
  {
    key: "parcels",
    bodies: ["pickup", "van"],
    labelEn: "Parcels",
    labelFr: "Des colis",
    exampleEn: "A few boxes, a delivery round",
    exampleFr: "Quelques cartons, une tournée",
  },
  {
    key: "move",
    bodies: ["van", "truck"],
    labelEn: "A move",
    labelFr: "Un déménagement",
    exampleEn: "A room, furniture, appliances",
    exampleFr: "Une pièce, des meubles, l'électroménager",
  },
  {
    key: "goods",
    bodies: ["truck"],
    labelEn: "Bulk goods",
    labelFr: "De la marchandise",
    exampleEn: "Cement, sand, market stock",
    exampleFr: "Ciment, sable, stock de marché",
  },
];

export function bodiesForLoad(key) {
  const size = loadSizes.find((item) => item.key === key);
  return size ? size.bodies : goodsBodyTypes;
}

// What ANaTT requires of somebody who transports for a living.
//
// Quoted from the agency's conditions page. The last one carries its own
// hedge — "dans certains cas" — and it is kept, because dropping it would
// turn a sometimes into an always and send somebody to a counter expecting
// to be refused.
export const authorisationConditions = [
  {
    key: "status",
    en: "Be a registered company, or a person with legal status",
    fr: "Être une personne morale (entreprise immatriculée) ou physique ayant un statut légal",
  },
  {
    key: "carteGrise",
    en: "Hold an up-to-date carte grise for the vehicle",
    fr: "Avoir une carte grise à jour pour le véhicule concerné",
  },
  {
    key: "visite",
    en: "Produce a valid roadworthiness certificate",
    fr: "Présenter un certificat de visite technique valide",
  },
  {
    key: "insurance",
    en: "Provide insurance that is in force",
    fr: "Fournir une assurance en cours de validité",
  },
  {
    key: "capacity",
    en: "Produce a certificate of professional capacity (in some cases)",
    fr: "Présenter une attestation de capacité professionnelle (dans certains cas)",
  },
];

// The carte de transport, and its real numbers.
//
// One year, not one job — the figure people get wrong in both directions,
// paying again for each trip or assuming a card from two years ago still
// covers them.
export const transportCard = {
  validityMonths: 12,
  processingHours: 48,
  // Each fee exactly as ANaTT publishes it. Deliberately not summed into a
  // single "à partir de": the total depends on how many countries and
  // whether it is urgent, and one number would be wrong for most people.
  fees: [
    { key: "anatt", amount: 3000, en: "ANaTT fee", fr: "Frais ANaTT" },
    {
      key: "national",
      amount: 1000,
      en: "National card, per registration",
      fr: "Carte nationale, par immatriculation",
    },
    {
      key: "international",
      amount: 1000,
      en: "International card, per country",
      fr: "Carte internationale, par pays",
    },
    { key: "urgent", amount: 2000, en: "Urgent handling", fr: "Traitement urgent" },
  ],
};

// The licence, from ANaTT's own page.
//
// No tonnage threshold here, and that is not an omission: ANaTT's page names
// the vehicles a category covers and never states a weight. A "3,5 t" line
// would be a number this app invented and attributed to the agency.
export const goodsLicence = {
  category: "C",
  minAge: 21,
  requiresB: true,
  coversEn: "Goods transport vehicles",
  coversFr: "Véhicules de transport de marchandises",
};

// Words a haulier uses about itself.
//
// Same shape as the driving-school matcher: a declared trade is believed,
// any other declared trade is a statement that this is something else, and
// only an undeclared listing is read for words.
const HAULIER_TERMS = [
  "transporteur",
  "transport de marchandises",
  "fret",
  "déménagement",
  "demenagement",
  "camionnage",
  "manutention",
  "livraison de marchandises",
];

export function isHaulierListing(text, declaredTrade) {
  if (declaredTrade === "haulier") return true;
  if (declaredTrade) return false;
  const haystack = (text ?? "").toLowerCase();
  return HAULIER_TERMS.some((term) => haystack.includes(term));
}

// Does this vehicle listing carry goods?
export function isGoodsVehicle(listing) {
  return goodsBodyTypes.includes(listing?.bodyType);
}
