// A coordinate for every commune, keyed by the name a listing stores.
//
// Around thirty call sites do `cityCoordinates[listing.city]` — distance
// sorting, map anchoring, the "near me" rails. The lookup is a bare object
// index against a stored string, which is why this file is still a plain
// object and not a function: changing the shape would mean changing all of
// them.
//
// Two things follow from that. Every one of the 77 official communes now has
// a coordinate, taken from the COD-AB centroid rather than invented — the old
// file covered 61. And every ALIAS is a key too, pointing at the same
// coordinate, so a listing stored as "Torri-Bossito" or "Aplahoue" still
// finds one instead of silently dropping out of every distance calculation.
import { communes, legacyPlaces } from './benin/communes';

const entries = {};

for (const commune of communes) {
  const point = { latitude: commune.lat, longitude: commune.lon };
  entries[commune.name] = point;
  entries[commune.sourceName] = point;
  for (const alias of commune.aliases) entries[alias] = point;
}

// Places that are not communes but appear in listings already published.
for (const place of legacyPlaces) {
  entries[place.name] = { latitude: place.lat, longitude: place.lon };
}

export const cityCoordinates = entries;
