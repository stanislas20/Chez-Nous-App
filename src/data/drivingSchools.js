// Auto-écoles, and the licence they prepare you for.
//
// Everything factual here comes from ANaTT's own driving-licence page — the
// agency that runs the exam — and nothing else does. The categories, the
// minimum ages and the dossier are quoted from it; the date below says when
// it was last read.
//
//   https://www.test.anatt.bj/page/permis-de-conduire
//
// What is deliberately absent is a price, and that absence is ANaTT's
// position as much as ours: their page says the cost "peut varier selon
// l'auto-école" and sends you to the schools to ask. A search result
// elsewhere quoted precise figures — 3 000 FCFA de droit de Trésor, 2 000 de
// timbre, 20 200 d'inscription — and they are not on the agency's own page,
// so they are not in this app. A fee that has moved is worse than no fee:
// somebody arrives at a counter with the wrong money.
//
// So a school's price is whatever that school published in its own listing,
// and if it published none the card says so. Same rule as every other trade.
export const drivingSchoolsReviewedOn = "2026-08-28";
export const ANATT_LICENCE_URL = "https://www.test.anatt.bj/page/permis-de-conduire";
export const ANATT_EXAM_URL = "https://permisdeconduire.anatt.bj/";

// The five categories, as ANaTT lists them.
//
// `requiresB` is the part candidates get wrong: C, D and E are not something
// you start from nothing, and a school that signs somebody up for a poids
// lourd course before they hold a B has sold them a year they cannot use.
export const licenceCategories = [
  {
    key: "A",
    icon: "bicycle-outline",
    labelEn: "Category A",
    labelFr: "Permis A",
    coversEn: "Motorcycles",
    coversFr: "Motocyclettes",
    minAge: 18,
    requiresB: false,
  },
  {
    key: "B",
    icon: "car-outline",
    labelEn: "Category B",
    labelFr: "Permis B",
    coversEn: "Light vehicles (private cars)",
    coversFr: "Véhicules légers (voitures particulières)",
    minAge: 18,
    requiresB: false,
  },
  {
    key: "C",
    icon: "cube-outline",
    labelEn: "Category C",
    labelFr: "Permis C",
    coversEn: "Goods vehicles",
    coversFr: "Véhicules de transport de marchandises",
    minAge: 21,
    requiresB: true,
  },
  {
    key: "D",
    icon: "bus-outline",
    labelEn: "Category D",
    labelFr: "Permis D",
    coversEn: "Passenger transport (minibus, bus)",
    coversFr: "Transport de personnes (minibus, autobus)",
    minAge: 21,
    requiresB: true,
  },
  {
    key: "E",
    icon: "git-merge-outline",
    labelEn: "Category E",
    labelFr: "Permis E",
    coversEn: "Vehicles with a trailer",
    coversFr: "Véhicules avec remorque",
    minAge: 21,
    requiresB: true,
  },
];

export function getLicenceCategory(key) {
  return licenceCategories.find((item) => item.key === key) ?? null;
}

export function licenceLabel(key, language) {
  const category = getLicenceCategory(key);
  if (!category) return key;
  return language === "en" ? category.labelEn : category.labelFr;
}

export function licenceCovers(key, language) {
  const category = getLicenceCategory(key);
  if (!category) return null;
  return language === "en" ? category.coversEn : category.coversFr;
}

// The dossier, as published. Five items, and the last one is the reason the
// rest of this screen exists: the attestation comes from the school, so the
// school is not optional paperwork you can skip by studying alone.
export const licenceDossier = [
  {
    key: "identity",
    icon: "card-outline",
    labelEn: "Copy of your ID card or passport",
    labelFr: "Copie de la carte d'identité ou du passeport",
  },
  {
    key: "residence",
    icon: "home-outline",
    labelEn: "Certificate of residence",
    labelFr: "Certificat de résidence",
  },
  {
    key: "medical",
    icon: "medkit-outline",
    labelEn: "Medical certificate",
    labelFr: "Certificat médical",
  },
  {
    key: "photos",
    icon: "camera-outline",
    labelEn: "2 recent passport photos",
    labelFr: "2 photos d'identité récentes",
  },
  {
    key: "attestation",
    icon: "school-outline",
    labelEn: "Training certificate issued by the driving school",
    labelFr: "Attestation de formation délivrée par l'auto-école",
  },
];

// What to ask before paying, which is the one thing this screen can offer
// that a directory cannot.
//
// Chez-Nous cannot tell you whether a school holds an ANaTT agrément — we
// have no register to check it against, and a badge we cannot verify is
// worse than none at all. So the question is handed to the candidate
// instead, first in the list, phrased as something to ask rather than
// something we have established.
export const schoolQuestions = [
  {
    key: "agrement",
    icon: "ribbon-outline",
    labelEn: "Are you approved by ANaTT? Can I see it?",
    labelFr: "Êtes-vous agréée par l'ANaTT ? Puis-je le voir ?",
  },
  {
    key: "total",
    icon: "cash-outline",
    labelEn: "What is the total, and what is not included?",
    labelFr: "Quel est le total, et qu'est-ce qui n'est pas compris ?",
  },
  {
    key: "hours",
    icon: "time-outline",
    labelEn: "How many driving hours, and on which vehicle?",
    labelFr: "Combien d'heures de conduite, et sur quel véhicule ?",
  },
  {
    key: "retake",
    icon: "refresh-outline",
    labelEn: "If I fail, what does a retake cost?",
    labelFr: "En cas d'échec, que coûte un repassage ?",
  },
];

// A listing is a driving school when it says so, or when its own words do.
//
// The declared trade is checked first and on its own: somebody who picked
// "auto-école" on the publish form meant it, and no keyword can overturn
// that. The words are the fallback for listings written before the trade
// existed.
const TERMS = [
  "auto-école",
  "auto école",
  "autoécole",
  "auto-ecole",
  "auto ecole",
  "driving school",
  "moniteur de conduite",
  "leçons de conduite",
  "code de la route",
];

export function isDrivingSchoolListing(text, declaredTrade) {
  if (declaredTrade === "drivingSchool") return true;
  // Any other declared trade is a positive statement that this is something
  // else — a garage that mentions the code de la route in passing is still a
  // garage, and matching it here would put it on this screen.
  if (declaredTrade) return false;
  const haystack = (text ?? "").toLowerCase();
  return TERMS.some((term) => haystack.includes(term));
}

// The categories a school says it teaches, kept to the real vocabulary.
//
// A listing carrying "F" or "B2" is not evidence of a category ANaTT does
// not issue; it is a typo, and letting it through would put a chip on the
// screen that filters to nothing.
export function declaredCategories(listing) {
  const declared = listing?.schoolCategories ?? [];
  return declared.filter((key) => Boolean(getLicenceCategory(key)));
}
