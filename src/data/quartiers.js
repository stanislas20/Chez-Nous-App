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

// The curated list above, plus every quartier a seller has actually typed
// in the chosen city.
//
// Four communes out of the sixty-one this app knows had any quartiers at
// all, so a seller in Bohicon or Natitingou could not say where their
// property was beyond the commune, and a buyer could not filter on it. The
// obvious fix — write out the rest — is the one thing this file's own
// header forbids: the names here are unverified, and a quartier filed
// under the wrong commune silently hides every listing in it.
//
// INStaD publishes the real roll (Cotonou alone has 13 arrondissements and
// 140 quartiers de ville, per their Littoral monograph), but the document
// that names them is a scanned PDF with no extractable text, so it cannot
// be transcribed here without OCR and a careful check.
//
// So the list grows from the listings instead. Sellers know their own
// quartier; every name added this way is one somebody stood in and typed,
// which is a better source than either of us guessing.
export function quartiersFor(city, listings) {
  const typed = (listings ?? [])
    .filter((listing) => !city || listing.city === city)
    .map((listing) => (listing.quartier ?? "").trim())
    .filter(Boolean);
  const curated = city ? getQuartiers(city) : getAllQuartiers();
  return [...new Set([...curated, ...typed])].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
}

// Every quartier we know about, deduped — used when no city is selected, so
// the filter still works for someone browsing the whole country.
export function getAllQuartiers() {
  return [...new Set(Object.values(quartiersByCity).flat())];
}

export function hasQuartiers(city) {
  return getQuartiers(city).length > 0;
}
