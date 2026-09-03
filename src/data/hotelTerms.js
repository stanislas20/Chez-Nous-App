// What a hotel listing has to say before somebody drives across Cotonou.
//
// The design this comes from leads on one sentence: "La nuitée, taxe
// comprise." That is the whole point of the screen. A hotel quotes a room
// rate, the taxe de séjour is added at the desk, and breakfast may or may
// not be inside — so three establishments quoting "25 000" are not quoting
// the same thing, and the guest finds out after the bags are upstairs.
// Everything here exists to put them on one comparable number.
//
// The second thing it leads on is electricity. A room without a groupe
// électrogène has air conditioning only while the grid does, and a Cotonou
// night without air conditioning is a night nobody sleeps. It outranks the
// star count, which is declared by the establishment and verified by
// nobody — which is also why the stars are labelled as declared wherever
// they appear.

// Zones, as the short-stay market is actually shaped: Cotonou, the coast
// road, and the two towns people commute from. A hotel outside all of them
// is not hidden — it simply appears under "toutes zones", which is the
// default, rather than being filed under a zone that would be a guess.
export const hotelZones = [
  { key: "all", labelEn: "All areas", labelFr: "Toutes zones" },
  {
    key: "centre",
    labelEn: "Cotonou centre",
    labelFr: "Cotonou centre",
    cities: ["Cotonou"],
    quartiers: ["Ganhi", "Cadjèhoun", "Akpakpa", "Vèdoko", "Zongo"],
  },
  {
    key: "beach",
    labelEn: "Seafront",
    labelFr: "Bord de mer",
    cities: ["Cotonou", "Ouidah", "Grand-Popo", "Sèmè-Podji"],
    quartiers: ["Fidjrossè", "Route des Pêches", "Djègbadji", "Avlékété"],
  },
  {
    key: "haievive",
    labelEn: "Haie Vive",
    labelFr: "Haie Vive",
    cities: ["Cotonou"],
    quartiers: ["Haie Vive"],
  },
  {
    key: "calavi",
    labelEn: "Abomey-Calavi",
    labelFr: "Abomey-Calavi",
    cities: ["Abomey-Calavi"],
  },
  {
    key: "portonovo",
    labelEn: "Porto-Novo",
    labelFr: "Porto-Novo",
    cities: ["Porto-Novo"],
  },
];

// A quartier decides the zone when it is written, because "Cotonou" covers
// both Ganhi and the beach road and they are not the same night. The city
// only decides when no quartier was given.
export function hotelZoneMatches(zoneKey, listing) {
  if (!zoneKey || zoneKey === "all") return true;
  const zone = hotelZones.find((item) => item.key === zoneKey);
  if (!zone) return true;
  const quartier = (listing?.quartier ?? "").trim();
  if (quartier && zone.quartiers) {
    return zone.quartiers.some(
      (name) => name.toLowerCase() === quartier.toLowerCase(),
    );
  }
  if (quartier && !zone.quartiers) return (zone.cities ?? []).includes(listing?.city);
  return (zone.cities ?? []).includes(listing?.city);
}

// Bands read against the all-in nightly price, never against the room rate.
// Filtering on the rate would put a hotel in the band below the one the
// guest actually pays, which is the exact deception this screen is against.
export const hotelBudgets = [
  { key: "all", labelEn: "Any price", labelFr: "Tous prix" },
  { key: "eco", labelEn: "Under 25,000", labelFr: "Moins de 25 000", max: 25000 },
  { key: "mid", labelEn: "25 to 60,000", labelFr: "25 à 60 000", min: 25000, max: 60000 },
  { key: "high", labelEn: "Over 60,000", labelFr: "Plus de 60 000", min: 60000 },
];

export function hotelBudgetMatches(budgetKey, allIn) {
  if (!budgetKey || budgetKey === "all") return true;
  const band = hotelBudgets.find((item) => item.key === budgetKey);
  if (!band) return true;
  if (band.min != null && allIn < band.min) return false;
  if (band.max != null && allIn >= band.max) return false;
  return true;
}

// The axis the screen sorts and recommends on.
//
// Ranked, because "declared" is not the same as "none" and neither is the
// same as a generator that runs all night. A hotel that says nothing is
// not accused of having none — it is shown as not having said, which is
// the honest reading and also the one that makes it worth answering.
export const generatorLevels = [
  { key: "full", rank: 0, labelEn: "Generator, 24 h", labelFr: "Groupe électrogène 24 h" },
  { key: "night", rank: 1, labelEn: "Generator at night only", labelFr: "Groupe la nuit seulement" },
  { key: "none", rank: 2, labelEn: "No generator declared", labelFr: "Pas de groupe déclaré" },
];

export function getGeneratorLevel(key) {
  return generatorLevels.find((item) => item.key === key) ?? null;
}

export function getGeneratorLabel(key, language) {
  const level = getGeneratorLevel(key) ?? generatorLevels[2];
  return language === "en" ? level.labelEn : level.labelFr;
}

// The number the whole screen is built to show. The tax is per night and
// per room here, which is how it is charged; a missing tax counts as zero
// rather than as an unknown, because a hotel that did not fill it in is
// quoting the rate it will charge.
export function allInNightly(listing) {
  const rate = Number(listing?.price) || 0;
  const tax = Number(listing?.touristTax) || 0;
  return rate + tax;
}

export function byAllInNightly(a, b) {
  return allInNightly(a) - allInNightly(b);
}

// Halls sort by the thing that rules a hall out: how many people fit.
export function byCapacityDesc(a, b) {
  return (Number(b?.capacity) || 0) - (Number(a?.capacity) || 0);
}

// The recommendation, and the reason for it in the same breath.
//
// A card that says "our pick" and nothing else is an advertisement. This
// one can always name its rule: the cheapest all-in among the hotels whose
// power and hot water are confirmed. If none confirm both, it falls back to
// power alone and says so; if none confirm power, there is no
// recommendation at all rather than one made on weaker evidence.
export function recommendHotel(hotels) {
  const list = [...(hotels ?? [])].sort(byAllInNightly);
  const powered = list.filter((item) => item.generator === "full");
  const withWater = powered.filter((item) => item.hotWater24h);
  if (withWater.length) {
    return { hotel: withWater[0], reasonKey: "hotelsPickReasonPowerWater" };
  }
  if (powered.length) {
    return { hotel: powered[0], reasonKey: "hotelsPickReasonPower" };
  }
  return { hotel: null, reasonKey: null };
}
