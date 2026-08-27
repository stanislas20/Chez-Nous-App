// Gestion de flotte — the same paper arithmetic, several vehicles at once.
//
// This file deliberately owns almost nothing. Every status, every boundary
// and every reminder window already lives in vehiclePapers.js and is already
// guarded by check-paper-status; a fleet is not a new kind of deadline, it is
// the same deadline on four vehicles instead of one. Restating the rules here
// would give the app two answers to "is this insurance expired", and the day
// they disagreed nobody would know which screen was lying.
//
// What is genuinely new is only this: which of several overdue things to put
// at the top.

import { getPaperKind, paperKinds, paperStatus } from "./vehiclePapers";

// The one judgement this screen adds.
//
// Sorting purely by how overdue something is puts a four-month-late oil
// change above an insurance that lapsed yesterday, and that ordering is
// wrong in a way that costs money: driving uninsured means paying for
// somebody else's repairs out of your own pocket after an accident, while a
// late vidange means engine wear. Both matter. They do not matter equally,
// and a list that pretends otherwise is not a to-do list, it is a sorted
// array.
//
// So: what the law requires before what the machine prefers, and within each
// group, whatever is furthest gone.
const LEGAL_ORDER = ["insurance", "technical", "licence", "vignette"];

export function paperUrgency(key) {
  const index = LEGAL_ORDER.indexOf(key);
  return index === -1 ? LEGAL_ORDER.length : index;
}

// A vehicle is whatever the owner typed. `name` is the only required part —
// somebody with one taxi calls it "le taxi" and never enters a plate, and a
// form that refuses them is a form they close.
export function makeVehicle(id, name, plate, driver) {
  return {
    id,
    name: (name ?? "").trim(),
    plate: (plate ?? "").trim(),
    driver: (driver ?? "").trim(),
  };
}

export function isUsableVehicle(vehicle) {
  return Boolean(vehicle && vehicle.name);
}

// Every renewable paper for one vehicle, with its status.
//
// The registration document is left out here and only here: it does not
// expire, so it can never be an échéance. It still belongs on the vehicle's
// own card, where "held or not held" is the real question.
export function vehicleDue(vehicle, papers, today) {
  const held = papers?.[vehicle.id] ?? {};
  return paperKinds
    .filter((kind) => kind.renewable)
    .map((kind) => ({
      vehicle,
      kind,
      value: held[kind.key] ?? null,
      status: paperStatus(kind, held[kind.key] ?? null, today),
    }));
}

// What needs doing across the whole fleet, worst first.
//
// Only expired and nearly-expired entries: a paper with no date is not
// overdue, it is unknown, and putting "assurance — date inconnue" at the top
// of an action list every day until it is filled in trains somebody to stop
// reading the list. Unknowns are surfaced on the vehicle card instead.
export function fleetDue(vehicles, papers, today) {
  return vehicles
    .flatMap((vehicle) => vehicleDue(vehicle, papers, today))
    .filter(
      (entry) =>
        entry.status.state === "expired" || entry.status.state === "soon",
    )
    .sort((a, b) => {
      // Expired outranks merely due, whatever the paper.
      const expiredFirst =
        (a.status.state === "expired" ? 0 : 1) -
        (b.status.state === "expired" ? 0 : 1);
      if (expiredFirst !== 0) return expiredFirst;
      const legal = paperUrgency(a.kind.key) - paperUrgency(b.kind.key);
      if (legal !== 0) return legal;
      return a.status.days - b.status.days;
    });
}

// The worst thing true about one vehicle, for its card.
//
// Unknown counts here even though it is kept out of the due list: on the
// card it reads as "you have not told us yet", which is a fair thing to show
// against a vehicle and a useless thing to put in a queue of work.
const CARD_RANK = { expired: 0, soon: 1, unknown: 2, valid: 3 };

export function vehicleWorst(vehicle, papers, today) {
  const entries = vehicleDue(vehicle, papers, today);
  if (!entries.length) return null;
  return [...entries].sort((a, b) => {
    const rank =
      (CARD_RANK[a.status.state] ?? 9) - (CARD_RANK[b.status.state] ?? 9);
    if (rank !== 0) return rank;
    const legal = paperUrgency(a.kind.key) - paperUrgency(b.kind.key);
    if (legal !== 0) return legal;
    if (a.status.days != null && b.status.days != null) {
      return a.status.days - b.status.days;
    }
    return 0;
  })[0];
}

// The three numbers at the top.
//
// "Renseignés" rather than "à jour": the app knows how many dates it was
// given, and claiming a fleet is compliant on the strength of what somebody
// typed would be asserting something it cannot see. Counting what is known
// is the only honest headline available.
export function fleetSummary(vehicles, papers, today) {
  const due = fleetDue(vehicles, papers, today);
  const expired = due.filter((entry) => entry.status.state === "expired");
  const known = vehicles.reduce(
    (total, vehicle) =>
      total +
      vehicleDue(vehicle, papers, today).filter(
        (entry) => entry.status.state !== "unknown",
      ).length,
    0,
  );
  const slots =
    vehicles.length * paperKinds.filter((kind) => kind.renewable).length;
  return {
    vehicles: vehicles.length,
    due: due.length,
    expired: expired.length,
    known,
    slots,
  };
}

export function fleetPaperLabel(key, language) {
  const kind = getPaperKind(key);
  if (!kind) return key;
  return language === "en" ? kind.labelEn : kind.labelFr;
}
