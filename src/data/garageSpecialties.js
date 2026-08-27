import { mentionsAnyWord } from "../utils/wordMatch";

// The car-repair trades, and the symptom-first way into them.
//
// There is no "garage" category in Firestore. A garage publishes an ordinary
// Services listing, the same as a plumber or a hairdresser, so this file is
// what turns free text written by a provider into a specialty a driver can
// filter on. Every term is French because that is what providers actually
// write here; the labels are for the UI and are never searched on.
//
// Nothing in this file invents a business. It only describes trades — the
// garages themselves come from real approved listings, and a specialty with
// no providers yet shows an empty result, which is true.

// Ionicons rather than the mockup's inline SVGs: the app already has one
// icon set and a second one would be two visual languages on one screen.
export const garageSpecialties = [
  {
    key: "meca",
    icon: "construct-outline",
    labelEn: "Mechanics",
    labelFr: "Mécanique",
    terms: ["mécanicien", "mécano", "garage"],
    weakTerms: ["mécanique", "moteur", "entretien", "réparation", "révision"],
  },
  {
    key: "diag",
    icon: "pulse-outline",
    labelEn: "Diagnostics",
    labelFr: "Diagnostic",
    terms: ["valise diagnostic", "obd"],
    weakTerms: ["diagnostic", "électronique", "calculateur", "valise"],
  },
  {
    key: "elec",
    icon: "flash-outline",
    labelEn: "Auto electrics",
    labelFr: "Électricité",
    terms: [
      "alternateur",
      "démarreur",
      "faisceau",
      // Unmistakably a car, whatever else the listing says.
      "klaxon",
      "électricien auto",
      "auto électricité",
    ],
    weakTerms: [
      "électricité",
      "capteur",
      "bobine",
      // The symptoms people write instead of the trade name. All weak: a
      // fusible and a court-circuit are as often a house, and a phare is a
      // lighthouse — they only count once the listing says it is about a
      // vehicle.
      "fusible",
      "court circuit",
      "clignotant",
      "phare",
      "centralisation",
      "stator",
      "régulateur",
      "allumage",
      // Deliberately NOT "cdi": in French that is a permanent employment
      // contract long before it is an ignition module, and it would drag
      // every job ad that mentions one onto a car-repair screen.
    ],
  },
  {
    key: "clim",
    icon: "snow-outline",
    labelEn: "Air conditioning",
    labelFr: "Climatisation",
    terms: [],
    weakTerms: ["climatisation", "clim", "compresseur", "réfrigérant"],
  },
  {
    key: "pneu",
    icon: "disc-outline",
    labelEn: "Tyres",
    labelFr: "Pneus",
    terms: [
      "pneu",
      "pneumatique",
      "jante",
      "équilibrage",
      "géométrie",
      "parallélisme",
      "crevaison",
    ],
    weakTerms: [],
  },
  {
    key: "frein",
    icon: "aperture-outline",
    labelEn: "Brakes",
    labelFr: "Freinage",
    terms: ["frein", "plaquette", "étrier"],
    weakTerms: ["disque"],
  },
  {
    key: "carro",
    icon: "color-fill-outline",
    labelEn: "Bodywork",
    labelFr: "Carrosserie",
    terms: [
      "carrosserie",
      "tôlerie",
      "débosselage",
      "pare-chocs",
      // Glass reached no trade at all before this: somebody searching for a
      // windscreen found nobody, however many body shops fit them. Strong
      // terms, because none of these three words is ever about a building.
      "pare-brise",
      "carrossier",
      "tôlier",
      "peinture auto",
      "cabine de peinture",
    ],
    weakTerms: [
      "peinture",
      "vitrage",
      "vitre",
      "lustrage",
      "covering",
      // What a carrossier actually writes when they do not write
      // "carrosserie": the damage, not the trade. "accidenté" reaches
      // "accidentées" through the inflection slack above.
      "accidenté",
      "redressage",
      "rayure",
      "mastic",
      "capot",
      "portière",
    ],
  },
  {
    key: "vidange",
    icon: "water-outline",
    labelEn: "Oil change",
    labelFr: "Vidange",
    terms: ["vidange"],
    weakTerms: ["huile", "filtre", "lubrifiant"],
  },
  {
    key: "batt",
    icon: "battery-charging-outline",
    labelEn: "Battery",
    labelFr: "Batterie",
    terms: ["batterie"],
    weakTerms: ["démarrage"],
  },
  {
    key: "keys",
    icon: "key-outline",
    labelEn: "Keys and locks",
    labelFr: "Clés et serrures",
    terms: ["serrurier", "reprogrammation"],
    weakTerms: ["clé", "clef", "télécommande", "verrouillage", "serrure"],
  },
  // Vehicle tracking, and the two words that make it hard.
  //
  // "GPS" is a feature line on half the cars for sale in the country
  // ("clim, GPS, caméra de recul"), so it can never be a strong term. It is
  // safe here only because providers are drawn from Services listings and a
  // vehicle advert is not one — but weak keeps it honest if that pool ever
  // widens.
  //
  // "Traceur" is worse: in a printing shop it is a plotter, and Cotonou has
  // more of those than it has tracker installers. Vehicle context is what
  // separates them, the same way it separates a car electrician from a
  // house one.
  //
  // "Géolocalisation" is the one word that means this and nothing else in a
  // services listing, so it stands alone.
  {
    key: "gps",
    icon: "navigate-circle-outline",
    labelEn: "GPS tracking",
    labelFr: "GPS & traceur",
    terms: ["géolocalisation"],
    weakTerms: ["gps", "traceur", "balise", "tracker", "antivol"],
  },
  {
    key: "depan",
    icon: "warning-outline",
    labelEn: "Breakdown",
    labelFr: "Dépannage",
    terms: ["remorquage", "dépanneuse"],
    weakTerms: ["dépannage", "dépanneur", "assistance"],
  },
];

// Words that establish the listing is about a car at all.
//
// This exists because French trade words are ambiguous in exactly the place
// it hurts: "dépannage" is as often IT support as roadside recovery,
// "électricité" is usually a house, "peinture" is usually a wall, and
// "climatisation" is usually a building. Matching on those alone filled a
// garage screen with electricians and computer repairers.
//
// So each trade has two lists. `terms` are unmistakably automotive on their
// own — nobody says "carrosserie" or "alternateur" about a house. The
// ambiguous ones sit in `weakTerms` and only count when the listing also
// says, somewhere, that it is about a vehicle.
const AUTO_CONTEXT = [
  "auto",
  "automobile",
  "voiture",
  "véhicule",
  "moto",
  "camion",
  "4x4",
  "garage",
  "carrosserie",
  "mécanicien",
];

// Word-level matching, deliberately not the shared queryMentionsAnyOf.
//
// That helper exists for spoken search: it substring-matches a query token
// against a *joined* keyword string, which is right when the keywords are a
// hand-picked pair and wrong here. With forty terms concatenated, "et"
// matched inside "géométrie" and "eau" inside "faisceau", so a plumbing ad
// ("fuite, robinet, chauffe-eau") came back as auto-electrics. Matching
// whole words instead is what stops that.

const mentionsAny = mentionsAnyWord;

export function mentionsVehicle(text) {
  return mentionsAny(text, AUTO_CONTEXT);
}

// What the seller chose on the form, in the vocabulary the screens filter
// on. Two vocabularies exist because they were built for different jobs —
// the form names trades the way a seller would ("battery", "tyres"), the
// matcher names specialties the way the listings read ("batt", "pneu") —
// and this is the one place they have to meet.
//
// Trades that are not garage work at all (a chauffeur, a parts shop, an
// insurer, a car wash) are absent on purpose: each has its own matcher and
// its own hook, and they honour the declared trade the same way there.
const TRADE_SPECIALTY = {
  garage: "meca",
  bodywork: "carro",
  electric: "elec",
  tyres: "pneu",
  battery: "batt",
  clim: "clim",
  keys: "keys",
  gps: "gps",
};

export function specialtyForTrade(trade) {
  return TRADE_SPECIALTY[trade] ?? null;
}

// True when this listing's own words place it in the given trade.
export function matchesGarageSpecialty(text, key, declaredTrade) {
  // What the seller declared outranks what a regex can infer from their
  // sentence. It cannot produce a false positive the way a keyword can:
  // nobody picks "serrurier auto" on the form by accident, whereas the word
  // "clé" turns up in prose about anything.
  if (declaredTrade && specialtyForTrade(declaredTrade) === key) return true;
  const specialty = getGarageSpecialty(key);
  if (!specialty) return false;
  if (mentionsAny(text, specialty.terms)) return true;
  if (specialty.weakTerms.length === 0) return false;
  return mentionsVehicle(text) && mentionsAny(text, specialty.weakTerms);
}

// Which trades a listing covers — a garage that does brakes and tyres
// appears under both, because it does both.
export function garageSpecialtiesFor(text, declaredTrade) {
  return garageSpecialties
    .filter((item) => matchesGarageSpecialty(text, item.key, declaredTrade))
    .map((item) => item.key);
}

// A Services listing that matches no trade is somebody's hairdressing or
// plumbing ad and has no business on a car-repair screen.
export function isGarageListing(text, declaredTrade) {
  return garageSpecialties.some((item) =>
    matchesGarageSpecialty(text, item.key, declaredTrade),
  );
}

export function getGarageSpecialty(key) {
  return garageSpecialties.find((item) => item.key === key) ?? null;
}

export function getGarageSpecialtyLabel(key, language) {
  const specialty = getGarageSpecialty(key);
  if (!specialty) return null;
  return language === "en" ? specialty.labelEn : specialty.labelFr;
}

// The symptom-first entry, which is the part of this screen that earns its
// place. A driver knows the car makes a noise; they do not know whether that
// is the alternator, the belt or the brakes, and a grid of eleven trade
// names asks them to diagnose the fault before they are allowed to look for
// help.
//
// The causes are the common ones, deliberately not presented as an answer —
// the sheet says a real diagnosis is still needed. We are routing someone to
// the right trade, not telling them what is wrong with their car.
export const garageSymptoms = [
  {
    key: "noStart",
    labelEn: "My car will not start",
    labelFr: "Ma voiture ne démarre pas",
    causes: [
      { labelEn: "Battery", labelFr: "Batterie", specialty: "batt" },
      { labelEn: "Starter motor", labelFr: "Démarreur", specialty: "elec" },
      {
        labelEn: "Electrical circuit",
        labelFr: "Circuit électrique",
        specialty: "elec",
      },
      {
        labelEn: "Fuel supply",
        labelFr: "Alimentation carburant",
        specialty: "meca",
      },
      {
        labelEn: "Electronic diagnostic",
        labelFr: "Diagnostic électronique",
        specialty: "diag",
      },
    ],
  },
  {
    key: "warningLight",
    labelEn: "A warning light is on",
    labelFr: "Un voyant est allumé",
    causes: [
      {
        labelEn: "Electronic diagnostic",
        labelFr: "Diagnostic électronique",
        specialty: "diag",
      },
      {
        labelEn: "Engine sensor",
        labelFr: "Capteur moteur",
        specialty: "elec",
      },
      {
        labelEn: "Service overdue",
        labelFr: "Entretien à faire",
        specialty: "vidange",
      },
    ],
  },
  {
    key: "brakes",
    labelEn: "Poor braking, or a grinding noise",
    labelFr: "Ça freine mal ou ça grince",
    causes: [
      {
        labelEn: "Pads and discs",
        labelFr: "Plaquettes / disques",
        specialty: "frein",
      },
      {
        labelEn: "Brake fluid",
        labelFr: "Liquide de frein",
        specialty: "frein",
      },
      {
        labelEn: "Mechanical check",
        labelFr: "Contrôle mécanique",
        specialty: "meca",
      },
    ],
  },
  {
    key: "aircon",
    labelEn: "The air conditioning stopped cooling",
    labelFr: "La clim ne refroidit plus",
    causes: [
      {
        labelEn: "Gas recharge",
        labelFr: "Recharge de gaz",
        specialty: "clim",
      },
      { labelEn: "Compressor", labelFr: "Compresseur", specialty: "clim" },
      {
        labelEn: "Electrical circuit",
        labelFr: "Circuit électrique",
        specialty: "elec",
      },
    ],
  },
  {
    key: "noiseSmoke",
    labelEn: "An unusual noise or smoke",
    labelFr: "Un bruit ou une fumée anormale",
    causes: [
      {
        labelEn: "Electronic diagnostic",
        labelFr: "Diagnostic électronique",
        specialty: "diag",
      },
      { labelEn: "Engine", labelFr: "Moteur", specialty: "meca" },
      {
        labelEn: "Oil and filters",
        labelFr: "Vidange / filtres",
        specialty: "vidange",
      },
    ],
  },
  {
    key: "tyre",
    labelEn: "Puncture or worn tyres",
    labelFr: "Pneu crevé ou usure",
    causes: [
      { labelEn: "Tyres", labelFr: "Pneus", specialty: "pneu" },
      {
        labelEn: "Balancing / alignment",
        labelFr: "Équilibrage / géométrie",
        specialty: "pneu",
      },
    ],
  },
  {
    key: "crash",
    labelEn: "I had a collision",
    labelFr: "J’ai eu un accrochage",
    causes: [
      { labelEn: "Bodywork", labelFr: "Carrosserie", specialty: "carro" },
      { labelEn: "Paint", labelFr: "Peinture", specialty: "carro" },
      {
        labelEn: "Mechanical check",
        labelFr: "Contrôle mécanique",
        specialty: "meca",
      },
    ],
  },
  {
    key: "stranded",
    labelEn: "I am broken down on the road",
    labelFr: "Je suis en panne sur la route",
    causes: [
      {
        labelEn: "Breakdown recovery",
        labelFr: "Dépannage",
        specialty: "depan",
      },
      { labelEn: "Battery", labelFr: "Batterie", specialty: "batt" },
    ],
  },
];

export function getGarageSymptom(key) {
  return garageSymptoms.find((item) => item.key === key) ?? null;
}
