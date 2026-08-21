// Neighbourhoods, because a commune is too coarse to search property with.
//
// "Abomey-Calavi" covers Godomey, Womey and Calavi centre — places that
// differ by an hour of traffic and by half the price. Cotonou is the same:
// nobody looking to rent says "in Cotonou", they say Fidjrossè or Akpakpa.
// The city list in cities.js stops at commune level, which is right for a
// phone or a fridge and wrong for a flat.
//
// NOT AUTHORITATIVE — assembled from general knowledge, not from a
// gazetteer or INSAE's arrondissement list. The names below are real
// places, but the list is partial and the commune each one belongs to has
// not been checked against an official source. Before this ships, verify
// it: a quartier filed under the wrong commune silently hides every
// listing in it, and a missing quartier means sellers there cannot be
// found at all.
//
// Kept short on purpose regardless — an exhaustive list would bury the
// common quartiers in a sheet nobody scrolls to the end of.
export const quartiersByCity = {
  Cotonou: ['Fidjrossè', 'Akpakpa', 'Cadjèhoun', 'Ganhi', 'Vedoko', 'Zogbo', 'Sainte-Rita'],
  'Abomey-Calavi': ['Calavi centre', 'Womey', 'Godomey', 'Zogbadjè', 'Tankpè', 'Akassato'],
  'Porto-Novo': ['Ouando', 'Djègan-Kpèvi', 'Houinmè', 'Tokpota'],
  Parakou: ['Zongo', 'Titirou', 'Banikanni', 'Guéma'],
};

export function getQuartiers(city) {
  return quartiersByCity[city] ?? [];
}

// Every quartier we know about, deduped — used when no city is selected, so
// the filter still works for someone browsing the whole country.
export function getAllQuartiers() {
  return [...new Set(Object.values(quartiersByCity).flat())];
}

export function hasQuartiers(city) {
  return getQuartiers(city).length > 0;
}
