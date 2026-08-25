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
