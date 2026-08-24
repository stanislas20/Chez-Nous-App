import { cities } from "../data/cities";
import { cityCoordinates } from "../data/cityCoordinates";
import { distanceInKm } from "./geo";

// Which of the fixed cities a GPS fix belongs to — or none, when the answer
// would be nonsense.
//
// The app stores one of 61 named Bénin cities on every listing, never raw
// coordinates, so a fix has to be resolved to the nearest of them. Written
// twice before this, in the posting form and in Local, and both copies had
// the same hole: they took the nearest city unconditionally. "Nearest" over
// a list that covers one country is always *some* city, however far away —
// a default simulator fix in Cupertino resolves to Tanguiéta, twelve
// thousand kilometres off, and nothing about the result says so.
//
// So the radius lives here, once. Bénin is covered densely enough by these
// 61 that a real fix inside it lands well within — Lagos, comfortably
// outside the country, is still only 79 km from Avrankou and is accepted on
// purpose, because somebody there genuinely is next to that border. Beyond
// this, no guess: a wrong city stated confidently is worse for a listing
// than an empty field the seller has to fill in.
export const MAX_CITY_GUESS_KM = 120;

export function nearestKnownCity(coords, maxKm = MAX_CITY_GUESS_KM) {
  if (!coords) return null;

  let city = null;
  let distanceKm = Infinity;
  for (const candidate of cities) {
    const cityCoord = cityCoordinates[candidate];
    if (!cityCoord) continue;
    const distance = distanceInKm(coords, cityCoord);
    if (distance < distanceKm) {
      distanceKm = distance;
      city = candidate;
    }
  }

  if (!city || distanceKm > maxKm) return null;
  return { city, distanceKm };
}
