// Where a listing is, in the words a person would use.
//
// A listing can now carry three levels of Bénin's administrative hierarchy —
// quartier or village, arrondissement, commune — and a buyer wants them in
// that order, most specific first, because that is the order in which they
// stop caring. "Cadjèhoun" answers "can I collect it on my way home?".
// "Cotonou" only answers "is it in the right city?", and a million people
// live there.
//
// PURELY PRESENTATIONAL. It reads the stored human-readable names and
// nothing else. In particular it never touches communeCode,
// arrondissementId or localityId: those are derived keys (BJ0800-12-004),
// never official, never meant for a person, and the whole point of storing
// the name beside the id is that a reader needs only the name.
//
// It also never consults the canonical roll. Resolving an id to a name here
// would mean a listing renders differently depending on whether the app's
// copy of the roll still contains that place — so a village removed from a
// later edition would silently blank out a real listing. The name that was
// stored is the name that is shown, and a place the seller typed themselves
// is shown exactly like one they picked from the list. A buyer does not care
// which list a name came from, and the formatter is not told.
//
// No Firebase, no dataset, no category awareness, no translation. The stored
// values are already the words somebody wrote or chose; there is nothing
// here to translate, and a category branch would be a way for one category
// to print something different from another for no reason a buyer could
// name. Phase 2 nulls these fields for the categories that do not offer the
// hierarchy, so an unsupported listing falls to its commune without this
// file knowing categories exist.

// Most specific first. This order is the feature.
const LEVELS = ["quartier", "arrondissement", "city"];

// A middle dot, not a comma. A comma reads as an address — a line you could
// post something to — and this is not one: it is three nested places, and
// the dot says so. It also matches what the shared web listing page already
// prints, so the same listing reads the same way in both.
const SEPARATOR = " · ";

// Anything that is not a non-empty string is not a place name.
//
// This is deliberately strict rather than coercive. `String(value)` would
// turn null into "null" and an accidental number into a place, and both of
// those reach a buyer as a plausible-looking lie. Whitespace is trimmed
// because "  " is an empty answer typed with the space bar, and a blank
// segment would render as a separator with nothing on one side of it.
function cleanName(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The location levels a listing can actually show, most specific first.
 *
 * Returns a new array of non-empty strings — [] when the listing names no
 * place at all. Never mutates the listing.
 */
export function listingLocationParts(listing) {
  if (!listing || typeof listing !== "object") return [];
  return LEVELS.map((level) => cleanName(listing[level])).filter(Boolean);
}

/**
 * One line: "Cadjèhoun · 12ème Arrondissement · Cotonou".
 *
 * Missing levels collapse rather than leaving a gap, so a listing with a
 * quartier but no arrondissement reads "Cadjèhoun · Cotonou" and not
 * "Cadjèhoun ·  · Cotonou".
 *
 * Returns null, not "", when there is nothing truthful to print — the same
 * contract as listingPrice, so callers render nothing at all rather than an
 * empty row or a stray icon.
 */
export function listingLocation(listing) {
  const parts = listingLocationParts(listing);
  return parts.length ? parts.join(SEPARATOR) : null;
}
