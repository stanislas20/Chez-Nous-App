// Assurance auto — the four answers an insurer asks for before quoting.
//
// This screen exists because a motor premium is not one number. It is a
// function of the vehicle, its fiscal horsepower, how long you are covering
// it for and which formula you take — and until those four are fixed, two
// "prices" are not comparable at all. Somebody ringing round three agencies
// without them gets three answers to three different questions.
//
// So the screen's job is to fix the question, then hand it to real agencies.
// What it must NOT do is answer it: a premium also depends on the value of
// the vehicle and on the reader's own history, and only the insurer can
// price that. Every number here comes from a provider or is absent.

import { matchesTrade, mentionsAnyWord } from "../utils/wordMatch";

export const insuranceVehicles = [
  {
    key: "car",
    icon: "car-outline",
    labelEn: "Car",
    labelFr: "Voiture",
    // Fiscal horsepower is on the carte grise and drives the tariff for
    // anything with four wheels.
    ratedByPower: true,
  },
  {
    key: "moto",
    icon: "bicycle-outline",
    labelEn: "Motorbike",
    labelFr: "Moto",
    // Two-wheelers are rated on engine size, not fiscal horsepower — asking
    // for a CV band here would be asking for something the reader's papers
    // do not contain.
    ratedByPower: false,
  },
  {
    key: "van",
    icon: "bus-outline",
    labelEn: "Van / utility",
    labelFr: "Utilitaire",
    ratedByPower: true,
  },
  {
    key: "taxi",
    icon: "people-outline",
    labelEn: "Taxi / passenger transport",
    labelFr: "Taxi / transport de personnes",
    ratedByPower: true,
  },
];

// The bands an agency actually quotes in. The exact figure is on the carte
// grise at case P.6, which is why the screen says so rather than making the
// reader guess.
export const powerBands = [
  { key: "low", labelEn: "2 – 6 CV", labelFr: "2 à 6 CV" },
  { key: "mid", labelEn: "7 – 10 CV", labelFr: "7 à 10 CV" },
  { key: "high", labelEn: "11 CV and over", labelFr: "11 CV et plus" },
];

// Whole months, because that is how a motor policy is sold here — the short
// terms exist for somebody who cannot pay a year at once, and they cost more
// per month for exactly that reason.
export const insuranceDurations = [
  { months: 1, labelEn: "1 month", labelFr: "1 mois" },
  { months: 3, labelEn: "3 months", labelFr: "3 mois" },
  { months: 6, labelEn: "6 months", labelFr: "6 mois" },
  { months: 12, labelEn: "12 months", labelFr: "12 mois" },
];

// What each formula does and does not do.
//
// This is the part of the screen worth reading, and the part people are
// sold past. "Tous risques" is not a synonym for "the good one" — it is a
// different contract at several times the price, and most insurers will not
// write it on an older vehicle at all. Saying so is the whole point.
//
// These are the ordinary shapes of a motor policy in the CIMA zone, not the
// terms of any particular contract, and the screen says so underneath: only
// the policy document defines what is covered.
export const insuranceFormulas = [
  {
    key: "liability",
    labelEn: "Third-party liability",
    labelFr: "Responsabilité civile",
    tagEn: "The legal minimum",
    tagFr: "Le minimum légal",
    vehicles: ["car", "moto", "van", "taxi"],
    coversEn: [
      "Damage you cause to other people's vehicles and property",
      "Injury you cause to other people",
      "Legal defence and recovery of costs",
    ],
    coversFr: [
      "Les dégâts que vous causez aux véhicules et aux biens d’autrui",
      "Les blessures que vous causez à autrui",
      "La défense et le recours",
    ],
    missesEn: ["Your own vehicle", "Theft and fire"],
    missesFr: ["Votre propre véhicule", "Le vol et l’incendie"],
  },
  {
    key: "extended",
    labelEn: "Extended third-party",
    labelFr: "Tiers étendu",
    tagEn: "The usual choice",
    tagFr: "Le plus courant",
    vehicles: ["car", "moto", "van", "taxi"],
    coversEn: [
      "Everything third-party liability covers",
      "Theft of the vehicle",
      "Fire",
      "Broken glass",
    ],
    coversFr: [
      "Tout ce que couvre la responsabilité civile",
      "Le vol du véhicule",
      "L’incendie",
      "Le bris de glace",
    ],
    missesEn: ["Damage to your own vehicle in a collision you caused"],
    missesFr: [
      "Vos propres dégâts dans une collision dont vous êtes responsable",
    ],
  },
  {
    key: "comprehensive",
    labelEn: "Comprehensive",
    labelFr: "Tous risques",
    tagEn: "Full cover",
    tagFr: "Couverture complète",
    // Not offered on two-wheelers or on passenger transport by most
    // insurers here, so the screen does not offer it either rather than
    // sending somebody to ask for something they will be refused.
    vehicles: ["car", "van"],
    coversEn: [
      "Everything extended third-party covers",
      "Damage to your own vehicle, even when you are at fault",
      "Assistance and towing, depending on the contract",
    ],
    coversFr: [
      "Tout ce que couvre le tiers étendu",
      "Vos propres dégâts, même si vous êtes responsable",
      "L’assistance et le remorquage, selon le contrat",
    ],
    missesEn: [],
    missesFr: [],
    // The thing nobody mentions until the expertise is refused.
    warnEn:
      "Most insurers keep comprehensive cover for recent vehicles and require an inspection before signing. Ask before you count on it.",
    warnFr:
      "La plupart des assureurs réservent le tous risques aux véhicules récents et demandent une expertise avant signature. Demandez avant d’y compter.",
  },
];

export function formulasFor(vehicleKey) {
  return insuranceFormulas.filter((formula) =>
    formula.vehicles.includes(vehicleKey),
  );
}

export function getInsuranceFormula(key) {
  return insuranceFormulas.find((formula) => formula.key === key) ?? null;
}

// A price a provider declared, keyed by what it is a price FOR.
//
// Underscore rather than a dot: a dot in a Firestore map key is read as a
// path separator and would nest the value silently. Same lesson as the wash
// screen's price keys.
export function insurancePriceKey(formula, vehicle, months) {
  return `${formula}_${vehicle}_${months}`;
}

// ── Who belongs on this screen ──────────────────────────────────────────
//
// "Assurance" on its own is the widest word in the trade: it is health
// cover, life cover, travel cover and a bank's side business. An agency
// that only writes health policies has no business on a motor screen, and
// somebody who calls them loses an afternoon finding that out.
const INSURANCE_TERMS = {
  terms: [
    "assurance auto",
    "assurance automobile",
    "assurance vehicule",
    "assurance véhicule",
    "assurance voiture",
    "assurance moto",
    "assurance deux roues",
    "car insurance",
    "motor insurance",
    "carte brune",
  ],
  // Real insurance words, none of them ours alone. They count once a
  // vehicle is in the sentence.
  weakTerms: [
    "assurance",
    "assureur",
    "assurances",
    "courtier",
    "courtage",
    "attestation",
    "insurance",
    "broker",
  ],
  context: [
    "auto",
    "automobile",
    "voiture",
    "vehicule",
    "véhicule",
    "moto",
    "deux roues",
    "carte grise",
    "conducteur",
    "flotte",
    "camion",
    "taxi",
    "vehicle",
    "car",
  ],
};

// Cover that is not motor cover. These are the ones that would otherwise
// arrive through the weak terms above.
const NOT_MOTOR = [
  "assurance maladie",
  "assurance sante",
  "assurance santé",
  "mutuelle de sante",
  "mutuelle de santé",
  "assurance vie",
  "assurance deces",
  "assurance décès",
  "assurance voyage",
  "assurance habitation",
  "assurance scolaire",
  "assurance agricole",
  "health insurance",
  "life insurance",
  "travel insurance",
];

export function isInsuranceListing(text, declaredTrade) {
  // The seller's own answer on the posting form, which cannot be a false
  // positive the way a keyword can. Their prose is still read for everyone
  // who never came through a trade screen.
  if (declaredTrade === "insurance") return true;
  // Said it plainly, so it is ours whatever else they write. An agency that
  // covers health AND motor is a motor agency for our purposes — refusing
  // it because it also sells health policies loses a real one.
  if (mentionsAnyWord(text, INSURANCE_TERMS.terms)) return true;
  if (mentionsAnyWord(text, NOT_MOTOR)) return false;
  return matchesTrade(text, INSURANCE_TERMS);
}
