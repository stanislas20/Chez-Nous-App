import { httpsCallable } from "firebase/functions";
import { cloudFunctions, isFirebaseConfigured } from "../config/firebase";

// The one door to Google Places.
//
// Every Places call used to go straight from the phone to
// places.googleapis.com carrying EXPO_PUBLIC_GOOGLE_PLACES_API_KEY — a value
// `EXPO_PUBLIC_` inlines into the JavaScript bundle, so it shipped inside the
// APK. Unlike a Maps SDK key, a Places REST key cannot be restricted to a
// package name: extracting it gave anybody an unmetered Places account billed
// to this project.
//
// The key now lives in a Cloud Function secret and the app asks the function.
// Nothing about the shape of the answers changed — the hooks below still
// receive Google's own JSON — so the pharmacy, restaurant and nearby screens
// read exactly as they did.
//
// The field masks stay on the client on purpose. They are per-screen (a
// pharmacy card needs opening hours, a restaurant card does not) and they are
// what Places bills on, so keeping them beside the screen that needs them is
// what stops a field being requested by nobody and paid for by everybody.

function callProxy(payload) {
  if (!isFirebaseConfigured) {
    return Promise.reject(new Error("Firebase is not configured."));
  }
  return httpsCallable(cloudFunctions, "placesProxy")(payload).then(
    (result) => result?.data ?? {},
  );
}

export function searchPlacesNearby({ coords, radius, type, fieldMask }) {
  return callProxy({
    kind: "searchNearby",
    latitude: coords.latitude,
    longitude: coords.longitude,
    radius,
    type,
    fieldMask,
  });
}

export function searchPlacesByText({ textQuery, type, fieldMask }) {
  return callProxy({ kind: "searchText", textQuery, type, fieldMask });
}

// One call per photograph, answered with a short-lived Google URL the phone
// then loads directly. The bytes never pass through our function — only the
// address does — so a screen full of restaurant photos costs a handful of
// tiny calls rather than proxying megabytes.
export function resolvePlacePhotoUrl(photoName, maxWidthPx = 400) {
  if (!photoName) return Promise.resolve(null);
  return callProxy({ kind: "photo", photoName, maxWidthPx })
    .then((data) => data?.photoUri ?? null)
    .catch(() => null);
}
