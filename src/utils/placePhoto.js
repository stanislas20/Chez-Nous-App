import { useEffect, useState } from "react";
import { resolvePlacePhotoUrl } from "./places";

// A Place photo, resolved through the Cloud Function rather than built from
// a key in the bundle.
//
// This used to be a synchronous string builder: it pasted
// EXPO_PUBLIC_GOOGLE_PLACES_API_KEY into a media URL and handed it to an
// <Image>. Every rendered photograph therefore put the key on the wire, and
// the key was in the APK to begin with.
//
// Now the function is asked for the photograph's own short-lived Google URL
// (Places' skipHttpRedirect returns it as JSON), and the phone loads the
// image from Google directly. The bytes never pass through our backend —
// only the address does — so a screen of restaurant photos costs a few tiny
// calls rather than proxying megabytes.
//
// Still resolved at render time and never stored, for the reason the old
// comment gave and which has not changed: Places' terms do not allow caching
// its content indefinitely, and a photo removed upstream should stop
// resolving rather than linger in our database.
export function usePlacePhotoUrl(photoName, maxWidthPx = 400) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!photoName) {
      setUrl(null);
      return undefined;
    }
    let cancelled = false;
    resolvePlacePhotoUrl(photoName, maxWidthPx).then((next) => {
      if (!cancelled) setUrl(next);
    });
    return () => {
      cancelled = true;
    };
  }, [photoName, maxWidthPx]);

  return url;
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
