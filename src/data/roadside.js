// What a roadside provider declares about themselves.
//
// The Dépannage screen wants to say "available now, 15–25 min, flatbed and
// winch, from 10 000 FCFA, covers Cotonou and Akpakpa". Every one of those
// is a fact only the provider knows, so every one of them is asked rather
// than inferred. Nothing here is computed by the app, and a provider who
// answers none of it simply shows fewer lines.

// How soon they usually reach a caller. Declared, and labelled as declared
// wherever it is shown — it is their own typical, not a promise the app is
// making, and not something derived from distance. Ranges rather than a
// number because nobody can be exact about traffic.
export const roadsideResponseTimes = [
  { key: "under15", labelEn: "Under 15 min", labelFr: "Moins de 15 min" },
  { key: "15to30", labelEn: "15 – 30 min", labelFr: "15 – 30 min" },
  { key: "30to60", labelEn: "30 – 60 min", labelFr: "30 – 60 min" },
  { key: "over60", labelEn: "Over an hour", labelFr: "Plus d’une heure" },
];

export function getResponseTimeLabel(key, language) {
  const item = roadsideResponseTimes.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

// What they can actually bring. A flatbed and a winch are the difference
// between a car that can be recovered and one that cannot, and it is the
// question a stranded person would ask on the phone first.
export const roadsideEquipment = [
  { key: "flatbed", labelEn: "Flatbed", labelFr: "Plateau" },
  { key: "winch", labelEn: "Winch", labelFr: "Treuil" },
  { key: "booster", labelEn: "Jump starter", labelFr: "Booster" },
  { key: "compressor", labelEn: "Compressor", labelFr: "Compresseur" },
  { key: "spare", labelEn: "Spare wheel", labelFr: "Roue de secours" },
  { key: "fuelCan", labelEn: "Fuel can", labelFr: "Bidon de carburant" },
];

export function getEquipmentLabel(key, language) {
  const item = roadsideEquipment.find((entry) => entry.key === key);
  if (!item) return null;
  return language === "en" ? item.labelEn : item.labelFr;
}

// Availability, which is the one field that rots.
//
// A provider who ticked "available" three weeks ago tells a stranded person
// nothing, so this is stored with the moment it was set and expires on its
// own. After the window it is not shown at all — silence, not a stale green
// dot, because the whole value of the badge is that it was true recently.
export const AVAILABILITY_TTL_MS = 4 * 60 * 60 * 1000;

export const roadsideAvailabilityStates = [
  { key: "now", labelEn: "Available now", labelFr: "Disponible maintenant" },
  {
    key: "hour",
    labelEn: "Free within the hour",
    labelFr: "Disponible sous 1 h",
  },
  { key: "off", labelEn: "Not available", labelFr: "Indisponible" },
];

export function getAvailabilityState(key) {
  return roadsideAvailabilityStates.find((entry) => entry.key === key) ?? null;
}

export function getAvailabilityLabel(key, language) {
  const state = getAvailabilityState(key);
  if (!state) return null;
  return language === "en" ? state.labelEn : state.labelFr;
}

// The declaration as it stands right now, or null when there is nothing
// current to show. `setAt` is a Firestore timestamp.
export function readAvailability(listing, now = Date.now()) {
  const key = listing?.roadsideAvailability ?? null;
  const setAt = listing?.roadsideAvailabilityAt?.toMillis?.() ?? null;
  if (!key || !setAt) return null;
  const age = now - setAt;
  if (age > AVAILABILITY_TTL_MS) return null;
  return { key, setAt, ageMs: age };
}

// "il y a 4 min" — shown beside the badge so the reader can judge it for
// themselves rather than trusting a dot.
export function formatAvailabilityAge(ageMs, language) {
  const minutes = Math.max(1, Math.round(ageMs / 60000));
  if (minutes < 60) {
    return language === "en" ? `${minutes} min ago` : `il y a ${minutes} min`;
  }
  const hours = Math.round(minutes / 60);
  return language === "en" ? `${hours} h ago` : `il y a ${hours} h`;
}
