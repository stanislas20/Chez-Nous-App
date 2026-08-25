import { matchesTrade, mentionsAnyWord } from "../utils/wordMatch";

// Chauffeurs — a driver who brings themselves, not a car.
//
// Three "driver" things already existed and none of them is this one: a car
// rented WITH a driver is a vehicle listing (rentalDriver), a job advert for
// a driver you will employ is a Jobs listing, and the Voitures tile was a
// text search. What was missing is the middle case, which is most of the
// demand here: somebody who needs a person to drive, for a month or for a
// Saturday.
//
// What this is deliberately NOT is ride-hailing. There is no live location in
// this app, no matching, no payments — so there is no "commander un
// chauffeur" and no map. A button implying a car is on its way would be the
// worst promise in the whole application. This is a directory of people you
// can telephone, and it says so.
//
// The other line that runs through the file: a permit category is DECLARED.
// Nobody here verifies a licence, and this is the one category where somebody
// hands over a car and sometimes their children — so the screen tells the
// hirer to ask for the physical permit, in the same spirit as the DOT-age
// warning on a used tyre.

// The five arrangements, which are five different prices.
//
// This is the strongest idea in the design and the reason the screen is not
// just a list: an airport transfer is a fixed fare, a day is a number of
// hours and kilometres, and a run to Parakou is priced on the empty return
// nobody thinks to ask about. The copy changes with the choice because the
// question you should ask changes with it.
export const driverOccasions = [
  {
    key: "airport",
    unitEn: "/ trip",
    unitFr: "/ trajet",
    icon: "airplane-outline",
    labelEn: "Airport transfer",
    labelFr: "Transfert aéroport",
    kickerEn: "Airport transfer",
    kickerFr: "Transfert aéroport",
    titleEn: "Who is waiting when you land?",
    titleFr: "Qui vous attend à l’arrivée ?",
    copyEn:
      "A fixed fare, not a meter. Agree the waiting time before you fly: a delayed flight is the commonest reason a transfer costs more than the price agreed.",
    copyFr:
      "Prix au forfait, pas au compteur. Convenez du temps d’attente avant de partir : un vol retardé est la première raison pour laquelle un transfert coûte plus que le prix annoncé.",
  },
  {
    key: "day",
    unitEn: "/ day",
    unitFr: "/ jour",
    icon: "calendar-outline",
    labelEn: "By the day",
    labelFr: "Mise à disposition",
    kickerEn: "By the day",
    kickerFr: "Mise à disposition",
    titleEn: "A car and its driver",
    titleFr: "Une voiture et son chauffeur",
    copyEn:
      "A day covers a set number of hours and kilometres. Ask what happens beyond them — every provider charges differently, and that is where a day turns expensive.",
    copyFr:
      "La journée couvre un nombre d’heures et de kilomètres précis. Demandez ce qui se passe au-delà — chaque prestataire applique son propre supplément, et c’est là qu’une journée devient chère.",
  },
  {
    key: "trip",
    unitEn: "/ trip",
    unitFr: "/ trajet",
    icon: "map-outline",
    labelEn: "Long distance",
    labelFr: "Voyage intérieur",
    kickerEn: "Long distance",
    kickerFr: "Voyage intérieur",
    titleEn: "Cotonou to the interior",
    titleFr: "Cotonou vers l’intérieur",
    copyEn:
      "On a run to Parakou, Natitingou or Nikki the empty return, the tolls and the driver’s night away change the whole price. Ask who pays each one.",
    copyFr:
      "Sur un trajet vers Parakou, Natitingou ou Nikki, le retour à vide, les péages et la nuitée du chauffeur changent tout le prix. Demandez qui paie chacun.",
  },
  {
    key: "event",
    unitEn: "/ day",
    unitFr: "/ journée",
    icon: "sparkles-outline",
    labelEn: "Ceremony",
    labelFr: "Cérémonie",
    kickerEn: "Ceremony",
    kickerFr: "Cérémonie",
    titleEn: "Wedding, dowry, funeral",
    titleFr: "Mariage, dot, funérailles",
    copyEn:
      "A day rate with the car prepared. A convoy of several vehicles is negotiated directly with the provider — it is rarely a multiple of one car.",
    copyFr:
      "Forfait à la journée avec véhicule préparé. Un cortège de plusieurs voitures se négocie directement avec le prestataire — c’est rarement le prix d’une voiture multiplié.",
  },
  {
    key: "month",
    unitEn: "/ month",
    unitFr: "/ mois",
    icon: "briefcase-outline",
    labelEn: "Monthly driver",
    labelFr: "Chauffeur mensuel",
    kickerEn: "Monthly driver",
    kickerFr: "Chauffeur mensuel",
    titleEn: "A driver by the year",
    titleFr: "Un chauffeur à l’année",
    copyEn:
      "For a household or a company. A monthly rate usually assumes your hours and your vehicle unless the listing says otherwise — check which, before the first day.",
    copyFr:
      "Pour un particulier ou une entreprise. Le tarif mensuel suppose en général vos horaires et votre véhicule, sauf mention contraire — vérifiez lequel avant le premier jour.",
  },
];

export function getOccasionLabel(key, language) {
  const item = driverOccasions.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

export function getOccasionUnit(key, language) {
  const item = driverOccasions.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.unitEn : item.unitFr;
}

export function getOccasionCopy(key, language) {
  const item = driverOccasions.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en"
    ? { kicker: item.kickerEn, title: item.titleEn, copy: item.copyEn }
    : { kicker: item.kickerFr, title: item.titleFr, copy: item.copyFr };
}

// Permit categories as they are written on a Béninese licence. Declared, and
// the screen never treats them as verified.
export const permitCategories = [
  {
    key: "A",
    icon: "bicycle-outline",
    labelEn: "A — motorbike",
    labelFr: "A — moto",
  },
  {
    key: "B",
    icon: "car-outline",
    labelEn: "B — car",
    labelFr: "B — voiture",
  },
  {
    key: "C",
    icon: "bus-outline",
    labelEn: "C — lorry",
    labelFr: "C — poids lourd",
  },
  {
    key: "D",
    icon: "people-outline",
    labelEn: "D — passenger transport",
    labelFr: "D — transport en commun",
  },
  {
    key: "E",
    icon: "git-merge-outline",
    labelEn: "E — with trailer",
    labelFr: "E — avec remorque",
  },
];

export function getPermitLabel(key, language) {
  const item = permitCategories.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

// Whose car. The single fact that decides whether a listing is any use at
// all, and the one most often left out of a written advert.
export const driverVehicleModes = [
  {
    key: "yours",
    icon: "key-outline",
    labelEn: "Drives your vehicle",
    labelFr: "Conduit votre véhicule",
  },
  {
    key: "own",
    icon: "car-sport-outline",
    labelEn: "Has their own vehicle",
    labelFr: "Dispose de son véhicule",
  },
];

export function getVehicleModeLabel(key, language) {
  const item = driverVehicleModes.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

// Languages, which no other part of the app captures and which decide the
// hire more often than anything except the permit. A daughter in Paris
// arranging a driver for her mother in Parakou is choosing on this.
export const driverLanguages = [
  { key: "fr", labelEn: "French", labelFr: "Français" },
  { key: "en", labelEn: "English", labelFr: "Anglais" },
  { key: "fon", labelEn: "Fon", labelFr: "Fon" },
  { key: "yoruba", labelEn: "Yoruba", labelFr: "Yoruba" },
  { key: "bariba", labelEn: "Bariba", labelFr: "Bariba" },
  { key: "dendi", labelEn: "Dendi", labelFr: "Dendi" },
  { key: "goun", labelEn: "Goun", labelFr: "Goun" },
];

export function getLanguageLabel(key, language) {
  const item = driverLanguages.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

// Experience as a band rather than a number, because "8 ans" and "10 ans" are
// the same answer to the only question being asked.
export const driverExperience = [
  { key: "lt2", years: 0, labelEn: "Under 2 years", labelFr: "Moins de 2 ans" },
  { key: "2to5", years: 2, labelEn: "2–5 years", labelFr: "2 à 5 ans" },
  { key: "5to10", years: 5, labelEn: "5–10 years", labelFr: "5 à 10 ans" },
  {
    key: "gt10",
    years: 10,
    labelEn: "Over 10 years",
    labelFr: "Plus de 10 ans",
  },
];

export function getExperienceLabel(key, language) {
  const item = driverExperience.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

// What the app can honestly tell somebody about to hand over their car keys.
// None of it is a check we performed; all of it is a check they can perform.
export const driverSafetyChecks = [
  {
    key: "permit",
    icon: "card-outline",
    labelEn: "Ask to see the physical permit, and that it is still valid",
    labelFr: "Demandez le permis original, et qu’il soit encore valide",
  },
  {
    key: "identity",
    icon: "person-circle-outline",
    labelEn: "Take a photo of their ID and keep it",
    labelFr: "Photographiez leur pièce d’identité et conservez-la",
  },
  {
    key: "trial",
    icon: "navigate-outline",
    labelEn: "Do a trial drive before committing to a month",
    labelFr: "Faites un essai avant de vous engager au mois",
  },
  {
    key: "terms",
    icon: "document-text-outline",
    labelEn: "Agree hours, pay and fuel in writing before the first day",
    labelFr:
      "Fixez horaires, salaire et carburant par écrit avant le premier jour",
  },
];

// Words that place a listing here.
//
// "chauffeur" is unmistakable on its own — and it does not collide with
// "chauffe-eau", which folds to two words, neither of which a term of
// "chauffeur" can reach.
//
// "conducteur" is NOT strong, because "conducteur de travaux" is a site
// manager in construction and would drag every BTP advert onto this screen.
// Same for "permis" and "transport", which belong to driving schools and
// freight companies respectively. They only count once the text has also
// established that a vehicle is involved.
const DRIVING_CONTEXT = [
  "voiture",
  "véhicule",
  "auto",
  "moto",
  "camion",
  "route",
  "volant",
  "conduite",
  "taxi",
];

const DRIVER_TERMS = {
  terms: ["chauffeur", "chauffeuse", "chauffeur privé", "chauffeur livreur"],
  weakTerms: [
    "conducteur",
    "conductrice",
    "permis",
    "transport",
    "livreur",
    "zem",
    "zémidjan",
  ],
  context: DRIVING_CONTEXT,
};

// Trades that teach or repair driving rather than do it. A driving school
// says "auto" and "permis" in every advert it writes, which is exactly the
// context-plus-weak-term combination that would otherwise place it here — and
// a moniteur is not available to drive your mother to Parakou.
//
// Checked before the match rather than by weakening the terms: dropping
// "permis" would also lose the genuine "chauffeur avec permis B" listings
// that do not spell out the word chauffeur.
const NOT_DRIVERS = [
  "auto ecole",
  "autoecole",
  "code de la route",
  "moniteur",
  "monitrice",
  "lecon de conduite",
  "cours de conduite",
];

export function isDriverListing(text) {
  if (mentionsAnyWord(text, NOT_DRIVERS)) return false;
  return matchesTrade(text, DRIVER_TERMS);
}
