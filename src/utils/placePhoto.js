const PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

// Builds a Place Photos (New) media URL from the `photos[].name` returned by
// a Places search — the name already encodes the place and the photo, so no
// separate lookup is needed.
//
// Deliberately built at render time rather than stored: Google's terms don't
// allow caching Places content indefinitely, and a URL carrying the API key
// has no business sitting in our database. It also means a photo that is
// removed upstream stops resolving instead of lingering.
export function buildPlacePhotoUrl(photoName, maxWidthPx = 400) {
  if (!photoName || !PLACES_API_KEY) return null;
  return (
    `https://places.googleapis.com/v1/${photoName}/media` +
    `?maxWidthPx=${maxWidthPx}&key=${PLACES_API_KEY}`
  );
}

// Google requires the contributor to be credited wherever their photo is
// shown. Returns the first author's name, or null when Places gave us none —
// in which case the caller shows no photo rather than an uncredited one.
export function getPhotoAttribution(photo) {
  return photo?.authorAttributions?.[0]?.displayName ?? null;
}

// A photo is only usable if we can both build its URL and credit it.
export function extractPlacePhoto(place) {
  const photo = place?.photos?.[0];
  if (!photo?.name) return { photoName: null, photoAttribution: null };
  const attribution = getPhotoAttribution(photo);
  if (!attribution) return { photoName: null, photoAttribution: null };
  return { photoName: photo.name, photoAttribution: attribution };
}
