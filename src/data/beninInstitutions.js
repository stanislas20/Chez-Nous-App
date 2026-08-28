// The state's own services, kept apart from the businesses.
//
// These are not "entreprises vérifiées" and they must not sit in that row.
// That label means a person at Chez-Nous approved a company's account; a
// ministry has no account and never asked to be here. Listing the state
// beside paid placements would also read as an endorsement running in the
// other direction — the app vouching for the government, or the government
// for the app — and neither is true.
//
// So this is a separate directory with a plainer promise: these are official
// sites, we checked they are, and here is where the list came from.
//
// Every URL below is one the government publishes about itself on gouv.bj,
// read on the date recorded here. Nothing was taken from a search result: a
// wrong link on this screen sends somebody to hand their identity documents
// to whoever bought a lookalike domain, which is the worst failure available
// anywhere in this app.
export const institutionsSource = "https://www.gouv.bj/";
export const institutionsReviewedOn = "2026-08-28";

// Grouped by what somebody came to do, not by protocol rank. A person opening
// this screen has an errand, not an interest in the order of precedence.
export const institutionGroups = [
  { key: "business", icon: "briefcase-outline", labelEn: "Starting a business", labelFr: "Entreprendre" },
  { key: "papers", icon: "document-text-outline", labelEn: "Paperwork", labelFr: "Démarches" },
  { key: "vehicle", icon: "car-outline", labelEn: "Vehicles", labelFr: "Véhicules" },
  { key: "state", icon: "business-outline", labelEn: "The State", labelFr: "L'État" },
];

export const beninInstitutions = [
  {
    key: "monentreprise",
    emblem: "Créer",
    group: "business",
    name: "Créer mon entreprise",
    url: "https://monentreprise.bj",
    blurbEn: "Register a business online.",
    blurbFr: "Créer son entreprise en ligne.",
  },
  {
    key: "apiex",
    group: "business",
    name: "APIEx",
    fullName: "Agence de Promotion des Investissements et de l'Exportation",
    url: "https://apiex.bj",
    blurbEn: "Investment and export promotion.",
    blurbFr: "Promotion des investissements et de l'exportation.",
  },
  {
    key: "servicepublic",
    group: "papers",
    name: "Service Public",
    url: "https://service-public.bj",
    blurbEn: "Administrative procedures and e-services.",
    blurbFr: "Démarches administratives et e-services.",
  },
  {
    key: "evisa",
    emblem: "eVisa",
    group: "papers",
    name: "e-Visa Bénin",
    url: "https://www.evisa.bj/",
    blurbEn: "Apply for a visa to Bénin.",
    blurbFr: "Demander un visa pour le Bénin.",
  },
  {
    key: "ask",
    emblem: "Ask",
    group: "papers",
    name: "#AskGouv Bénin",
    url: "https://ask.gouv.bj",
    blurbEn: "Ask the government a question.",
    blurbFr: "Poser une question au gouvernement.",
  },
  // Already used by the Auto-écoles screen, which reads its licence
  // categories and dossier from this same agency.
  {
    key: "anatt",
    group: "vehicle",
    name: "ANaTT",
    fullName: "Agence Nationale des Transports Terrestres",
    url: "https://permisdeconduire.anatt.bj/",
    blurbEn: "Driving licence and the exam.",
    blurbFr: "Permis de conduire et examen.",
  },
  {
    key: "presidence",
    group: "state",
    name: "Présidence de la République",
    url: "https://presidence.bj",
    blurbEn: null,
    blurbFr: null,
  },
  {
    key: "sgg",
    group: "state",
    name: "Secrétariat général du Gouvernement",
    url: "https://sgg.gouv.bj",
    blurbEn: "Laws and decrees.",
    blurbFr: "Lois et décrets.",
  },
  {
    key: "gouv",
    emblem: "gouv",
    group: "state",
    name: "Portail du Gouvernement",
    url: "https://www.gouv.bj/",
    blurbEn: "Where this list comes from.",
    blurbFr: "La source de cette liste.",
  },
];

export function institutionsIn(group) {
  return beninInstitutions.filter((item) => item.group === group);
}

export function institutionBlurb(item, language) {
  return language === "en" ? item.blurbEn : item.blurbFr;
}

// The initials shown on the plate.
//
// Derived from the name where that reads — "Secrétariat général du
// Gouvernement" gives SGG, and APIEx is already its own short form. Where it
// does not, the entry says so instead of the function getting cleverer:
// "e-Visa Bénin" reduces to EB and "#AskGouv Bénin" to AB, neither of which
// anybody would recognise on a plate.
export function institutionEmblem(item) {
  if (item.emblem) return item.emblem;
  const name = item.name.replace(/^#/, "");
  if (name.length <= 6 && name === name.replace(/\s/g, "")) return name;
  return name
    .split(/\s+/)
    .filter((word) => word.length > 2 && !/^(de|du|des|la|le|les)$/i.test(word))
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 4);
}
