// Papiers & contrôle — the dates that decide whether you may drive.
//
// This screen holds no business data at all, and that is deliberate. Every
// other vehicle screen lists providers; this one lists the reader's own
// documents, with the dates the reader typed in. The app cannot see anyone's
// insurance certificate, so the only truthful status it can show is the one
// arithmetic gives it: this is the date you gave us, and this is how far away
// it is. Same rule the battery screen already follows.

// The papers a vehicle carries in Bénin.
//
// `renewable` marks the ones that expire and can therefore be counted down.
// A carte grise does not expire, so asking for a date would be inventing a
// deadline; it is tracked as held or not held, which is the real question.
export const paperKinds = [
  {
    key: "insurance",
    icon: "shield-checkmark-outline",
    renewable: true,
    labelEn: "Insurance",
    labelFr: "Assurance",
    subEn: "Compulsory to drive",
    subFr: "Obligatoire pour circuler",
  },
  {
    key: "technical",
    icon: "construct-outline",
    renewable: true,
    labelEn: "Roadworthiness test",
    labelFr: "Visite technique",
    subEn: "Periodic inspection",
    subFr: "Contrôle périodique",
  },
  {
    key: "licence",
    icon: "card-outline",
    renewable: true,
    labelEn: "Driving licence",
    labelFr: "Permis de conduire",
    subEn: "The driver's, not the vehicle's",
    subFr: "Celui du conducteur, pas du véhicule",
  },
  {
    key: "registration",
    icon: "document-text-outline",
    renewable: false,
    labelEn: "Registration document",
    labelFr: "Carte grise",
    subEn: "Does not expire",
    subFr: "Sans date d’expiration",
  },
];

export function getPaperKind(key) {
  return paperKinds.find((entry) => entry.key === key) ?? null;
}

export function getPaperLabel(key, language) {
  const item = getPaperKind(key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

// Forty-five days, and the number is doing real work.
//
// It is long enough to arrange an insurance renewal or book a test without
// rushing, and short enough that a warning still means something when it
// appears. A shorter window would warn somebody the week they are already
// late; a longer one would leave a permanent amber badge nobody reads.
export const EXPIRY_WARNING_DAYS = 45;

export const MS_PER_DAY = 86400000;

// The whole of the status logic, kept out of the screen so it can be tested.
//
// `today` is passed in rather than read from the clock, because a function
// that reads the clock cannot be tested at a boundary — and the boundaries
// are the only interesting part: the day something expires, and the day it
// enters the warning window.
export function paperStatus(kind, value, today) {
  if (!kind.renewable) {
    return { state: value === true ? "held" : "missing", days: null };
  }
  if (!value) return { state: "unknown", days: null };
  const days = Math.round((new Date(value) - today) / MS_PER_DAY);
  if (days < 0) return { state: "expired", days };
  if (days <= EXPIRY_WARNING_DAYS) return { state: "soon", days };
  return { state: "valid", days };
}

// Expired first, then nearest expiry, then everything at rest. Somebody
// opening this screen is asking one question — what needs doing — and the
// order is the answer.
const STATE_RANK = {
  expired: 0,
  soon: 1,
  unknown: 2,
  missing: 2,
  valid: 3,
  held: 4,
};

export function sortPapers(entries) {
  return [...entries].sort((a, b) => {
    const rank = STATE_RANK[a.status.state] - STATE_RANK[b.status.state];
    if (rank !== 0) return rank;
    if (a.status.days != null && b.status.days != null) {
      return a.status.days - b.status.days;
    }
    return 0;
  });
}

export function countNeedingAttention(entries) {
  return entries.filter(
    (entry) =>
      entry.status.state === "expired" || entry.status.state === "soon",
  ).length;
}

// ── Démarches ───────────────────────────────────────────────────────────
//
// What to put in the folder before you set out. These are preparation lists,
// not the official requirement: the pieces and the fees are set by the
// administration and change, and the screen says so above every one of them.
// The value is in not arriving at a guichet having forgotten the obvious —
// which is what actually costs people a morning.
export const paperProcedures = [
  {
    key: "mutation",
    icon: "swap-horizontal-outline",
    labelEn: "Transfer after buying",
    labelFr: "Mutation après achat",
    whyEn: "You have just bought a used vehicle",
    whyFr: "Vous venez d’acheter un véhicule d’occasion",
    itemsEn: [
      "The seller's registration document",
      "The signed bill of sale",
      "The buyer's identity document",
      "A roadworthiness test still in date",
    ],
    itemsFr: [
      "La carte grise du vendeur",
      "Le certificat de vente signé",
      "La pièce d’identité de l’acheteur",
      "Une visite technique en cours de validité",
    ],
    warnEn:
      "Until the transfer is done the vehicle is still in the seller's name — fines and liability with it. This is the step people postpone and regret.",
    warnFr:
      "Tant que la mutation n’est pas faite, le véhicule reste au nom du vendeur — amendes et responsabilité comprises. C’est l’étape qu’on repousse et qu’on regrette.",
  },
  {
    key: "technical",
    icon: "construct-outline",
    labelEn: "Renew the roadworthiness test",
    labelFr: "Renouveler la visite technique",
    whyEn: "Your inspection is running out",
    whyFr: "Votre contrôle arrive à échéance",
    itemsEn: [
      "The registration document",
      "The insurance certificate",
      "The previous inspection report",
      "The vehicle itself, presented clean",
    ],
    itemsFr: [
      "La carte grise",
      "L’attestation d’assurance",
      "Le précédent procès-verbal de visite",
      "Le véhicule lui-même, présenté propre",
    ],
    warnEn:
      "Check the lights, the brakes and the tyres before you go. They are the commonest reasons a vehicle is sent away and asked to come back.",
    warnFr:
      "Vérifiez les feux, les freins et les pneus avant de partir. Ce sont les motifs de refus les plus courants.",
  },
  {
    key: "insurance",
    icon: "shield-checkmark-outline",
    labelEn: "Renew the insurance",
    labelFr: "Renouveler l’assurance",
    whyEn: "Compulsory to be on the road at all",
    whyFr: "Obligatoire pour circuler, tout simplement",
    itemsEn: [
      "The registration document",
      "The expiring certificate",
      "The driving licence",
    ],
    itemsFr: [
      "La carte grise",
      "L’attestation qui expire",
      "Le permis de conduire",
    ],
    warnEn:
      "Ask two insurers rather than renewing on reflex. Third-party and comprehensive are not the same cover and rarely the same price.",
    warnFr:
      "Demandez à deux assureurs plutôt que de renouveler par réflexe. La garantie au tiers et la formule tous risques ne couvrent pas la même chose et coûtent rarement pareil.",
  },
  {
    key: "duplicate",
    icon: "documents-outline",
    labelEn: "Replace a lost registration document",
    labelFr: "Duplicata de carte grise",
    whyEn: "Lost, stolen or damaged",
    whyFr: "Perdue, volée ou détériorée",
    itemsEn: [
      "A declaration of loss or theft",
      "Your identity document",
      "The insurance certificate",
      "Any copy of the original you still have",
    ],
    itemsFr: [
      "Une déclaration de perte ou de vol",
      "Votre pièce d’identité",
      "L’attestation d’assurance",
      "Toute copie de l’original que vous avez gardée",
    ],
    warnEn: null,
    warnFr: null,
  },
];

export function getProcedureLabel(key, language) {
  const item = paperProcedures.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

// ── Où aller ────────────────────────────────────────────────────────────
//
// Kinds of place, not named offices.
//
// The tempting version lists testing centres with their addresses and their
// opening hours. We do not know either, and a government office's hours are
// worse to invent than a shop's: somebody drives across Cotonou on them. So
// each row hands the search to the phone's map, which does know, and the app
// claims nothing it cannot support.
export const paperPlaces = [
  {
    key: "technical",
    icon: "construct-outline",
    labelEn: "Roadworthiness testing centre",
    labelFr: "Centre de visite technique",
    forEn: "Periodic inspection, and the test required before a transfer",
    forFr: "Contrôle périodique, et la visite exigée avant une mutation",
    query: "centre de visite technique automobile",
  },
  {
    key: "registration",
    icon: "document-text-outline",
    labelEn: "Registration counter",
    labelFr: "Guichet d’immatriculation",
    forEn: "Transfers, duplicates, plates for an imported vehicle",
    forFr: "Mutations, duplicatas, immatriculation d’un véhicule importé",
    query: "immatriculation véhicule carte grise",
  },
  {
    key: "insurance",
    icon: "shield-checkmark-outline",
    labelEn: "Insurance agency",
    labelFr: "Agence d’assurance",
    forEn: "Taking out or renewing cover",
    forFr: "Souscrire ou renouveler une assurance",
    query: "assurance automobile agence",
  },
  {
    key: "customs",
    icon: "boat-outline",
    labelEn: "Customs office",
    labelFr: "Bureau des douanes",
    forEn: "Clearing an imported vehicle and its certificate",
    forFr: "Dédouanement d’un véhicule importé et son certificat",
    query: "bureau des douanes",
  },
];
