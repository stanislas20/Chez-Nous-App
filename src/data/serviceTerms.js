// What a service costs you before any work happens, and where it happens.
//
// The price of a job is not the thing that goes wrong here. What goes wrong
// is the advance: money handed over before anything is built, sewn or
// repaired, on a verbal agreement, to somebody who then becomes hard to
// reach. Every trade in Bénin runs on some advance — a mason cannot buy
// cement out of his own pocket — so the useful question is never "is there
// one" but "how much, and can they justify it".
//
// So it is asked of the provider and shown on the card, and the browse
// screen ranks the lowest first. That ordering is the whole point: it is a
// pressure on the market rather than a label on it. A provider who asks for
// nothing up front is telling a buyer something real about their confidence
// in their own work, and until now had no way to say it.
//
// The bands are coarse deliberately. A slider inviting 37% would produce
// numbers nobody can compare, and the difference that matters to somebody
// choosing is none / a third / half / everything.
export const serviceDepositBands = [
  {
    key: "none",
    percent: 0,
    icon: "checkmark-circle-outline",
    color: "#12876A",
    labelEn: "No advance",
    labelFr: "Aucune avance",
  },
  {
    key: "third",
    percent: 30,
    icon: "pie-chart-outline",
    color: "#2F6BB5",
    labelEn: "About a third",
    labelFr: "Environ un tiers",
  },
  {
    key: "half",
    percent: 50,
    icon: "contrast-outline",
    color: "#B98A2A",
    labelEn: "Half",
    labelFr: "La moitié",
  },
  {
    key: "full",
    percent: 100,
    icon: "alert-circle-outline",
    color: "#C1512D",
    labelEn: "Paid in full up front",
    labelFr: "Payé entièrement d’avance",
  },
];

// Half or more of the job's price, handed over before it starts, is where
// the money is actually lost. Shown as a caution to the buyer and stated to
// the provider as they choose it — not blocked, because plenty of honest
// trades genuinely need materials bought first.
export const HEAVY_DEPOSIT_PERCENT = 50;

// Where the work happens. Not a detail: somebody with a broken sewing
// machine and no way to move it needs whoever comes to them, and somebody
// with a torn hem does not care.
export const serviceWorkPlaces = [
  {
    key: "onsite",
    icon: "navigate-outline",
    color: "#12876A",
    labelEn: "Comes to you",
    labelFr: "Se déplace chez vous",
  },
  {
    key: "workshop",
    icon: "business-outline",
    color: "#2F6BB5",
    labelEn: "At their workshop",
    labelFr: "Dans son atelier",
  },
  {
    key: "both",
    icon: "swap-horizontal-outline",
    color: "#B98A2A",
    labelEn: "Either one",
    labelFr: "L’un ou l’autre",
  },
];

export function getServiceDepositBand(key) {
  return serviceDepositBands.find((band) => band.key === key) ?? null;
}

export function getServiceDepositLabel(key, language) {
  const band = getServiceDepositBand(key);
  if (!band) return null;
  return language === "en" ? band.labelEn : band.labelFr;
}

export function isHeavyDeposit(key) {
  const band = getServiceDepositBand(key);
  return !!band && band.percent >= HEAVY_DEPOSIT_PERCENT;
}

export function getServiceWorkPlace(key) {
  return serviceWorkPlaces.find((place) => place.key === key) ?? null;
}

export function getServiceWorkPlaceLabel(key, language) {
  const place = getServiceWorkPlace(key);
  if (!place) return null;
  return language === "en" ? place.labelEn : place.labelFr;
}

// The order the browse screen uses: least money up front first, and an
// undeclared advance last rather than treated as none — an empty field is
// not a promise.
export function byDepositThenRating(a, b) {
  const rank = (listing) => {
    const band = getServiceDepositBand(listing?.serviceDeposit);
    return band ? band.percent : Number.POSITIVE_INFINITY;
  };
  return rank(a) - rank(b) || (b?.ratingAverage ?? 0) - (a?.ratingAverage ?? 0);
}
