// Google Places, called from a server that can hold a key.
//
// The app called places.googleapis.com directly with
// EXPO_PUBLIC_GOOGLE_PLACES_API_KEY. `EXPO_PUBLIC_` means the value is inlined
// into the JavaScript bundle at build time, so it ships inside the APK and can
// be read out of one in a couple of minutes.
//
// That is worse than it sounds, and the reason is specific to this product
// rather than general. An Android Maps SDK key can be restricted to a package
// name and signing certificate, so extracting it buys nothing. The Places
// REST API is a server-side product: its keys can be restricted by IP or not
// at all, and an IP restriction is meaningless for a mobile app. So the
// extracted key worked from anywhere, billed per request, against a Google
// Cloud account with no ceiling on it except the quota.
//
// Everything here is a thin pass-through. It deliberately does not cache,
// reshape or store any of what Google returns: Places' terms restrict how
// long its content may be retained, and a cache would be the thing that
// breaks them.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");

// Set with `firebase functions:secrets:set GOOGLE_PLACES_API_KEY`. The same
// mechanism pharmacyRosterSync already uses for its Anthropic key, so there
// is one way to hold a secret in this project rather than two.
const placesApiKey = defineSecret("GOOGLE_PLACES_API_KEY");

// The Republic of Bénin's real bounding box, mirrored from
// src/hooks/useSearchPharmacies.js. Enforced here as well as there, because
// a caller can now ask this function for anything and a text search
// unrestricted by geography is a general-purpose Places account for whoever
// finds the endpoint.
const BENIN_BOUNDS = {
  low: { latitude: 6.1, longitude: 0.75 },
  high: { latitude: 12.45, longitude: 3.9 },
};

// What may be asked for. An allowlist rather than a pass-through of whatever
// `includedTypes` the caller sends: this endpoint exists to answer three
// questions the app asks, and anything else is somebody using our billing.
const ALLOWED_TYPES = new Set(["pharmacy", "restaurant"]);

const MAX_RESULTS = 20;
// Bounded so a caller cannot ask for a 4000px photograph on our account.
const MAX_PHOTO_WIDTH = 1200;

function assertInBenin(latitude, longitude) {
  const ok =
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    latitude >= BENIN_BOUNDS.low.latitude &&
    latitude <= BENIN_BOUNDS.high.latitude &&
    longitude >= BENIN_BOUNDS.low.longitude &&
    longitude <= BENIN_BOUNDS.high.longitude;
  if (!ok) {
    throw new HttpsError(
      "invalid-argument",
      "Coordinates outside the supported area.",
    );
  }
}

async function callPlaces(url, { method = "POST", body, fieldMask, key }) {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      ...(fieldMask ? { "X-Goog-FieldMask": fieldMask } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    // Google's own error text can name the key and the project, so it is
    // logged and not returned.
    logger.warn("Places call failed", {
      status: response.status,
      message: data?.error?.message,
    });
    throw new HttpsError("unavailable", "Place lookup failed.");
  }
  return data;
}

exports.placesProxy = onCall(
  { secrets: [placesApiKey], maxInstances: 10 },
  async (request) => {
    // Signed in, because this spends money. The app already requires an
    // account for everything else that costs anything, and an anonymous
    // caller here is the same open tap the bundled key was.
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to search places.");
    }

    const key = placesApiKey.value();
    if (!key) throw new HttpsError("failed-precondition", "Places not configured.");

    const { kind } = request.data ?? {};

    if (kind === "searchNearby") {
      const { latitude, longitude, radius, type, fieldMask } = request.data;
      assertInBenin(latitude, longitude);
      if (!ALLOWED_TYPES.has(type)) {
        throw new HttpsError("invalid-argument", "Unsupported place type.");
      }
      return callPlaces("https://places.googleapis.com/v1/places:searchNearby", {
        key,
        fieldMask,
        body: {
          includedTypes: [type],
          maxResultCount: MAX_RESULTS,
          locationRestriction: {
            circle: {
              center: { latitude, longitude },
              // Clamped: the client asks for a sensible radius, and a
              // caller who is not the client might not.
              radius: Math.min(Math.max(Number(radius) || 5000, 100), 50000),
            },
          },
        },
      });
    }

    if (kind === "searchText") {
      const { textQuery, type, fieldMask } = request.data;
      if (typeof textQuery !== "string" || textQuery.trim().length === 0) {
        throw new HttpsError("invalid-argument", "Empty query.");
      }
      if (textQuery.length > 200) {
        throw new HttpsError("invalid-argument", "Query too long.");
      }
      if (!ALLOWED_TYPES.has(type)) {
        throw new HttpsError("invalid-argument", "Unsupported place type.");
      }
      return callPlaces("https://places.googleapis.com/v1/places:searchText", {
        key,
        fieldMask,
        body: {
          textQuery: textQuery.slice(0, 200),
          includedType: type,
          maxResultCount: 10,
          // The hard rectangle, not a bias. "Benin" is genuinely ambiguous
          // to Google — it also matches Benin City in Nigeria, 700 km east —
          // and a soft locationBias was observed returning Nigerian
          // pharmacies interleaved with Cotonou ones.
          locationRestriction: { rectangle: BENIN_BOUNDS },
        },
      });
    }

    if (kind === "photo") {
      const { photoName, maxWidthPx } = request.data;
      // `photos/…` names are opaque, but they end up in a URL path, so
      // anything that could climb out of it is refused.
      if (
        typeof photoName !== "string" ||
        !/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(photoName)
      ) {
        throw new HttpsError("invalid-argument", "Invalid photo reference.");
      }
      const width = Math.min(
        Math.max(Number(maxWidthPx) || 400, 100),
        MAX_PHOTO_WIDTH,
      );
      // skipHttpRedirect returns the image's own URL as JSON instead of a
      // 302, which is what lets the phone load the picture directly from
      // Google afterwards. That URL is short-lived and carries no key, so
      // handing it to the client leaks nothing — and it means one function
      // call per photograph rather than every byte of every image passing
      // through here.
      const data = await callPlaces(
        `https://places.googleapis.com/v1/${photoName}/media` +
          `?maxWidthPx=${width}&skipHttpRedirect=true`,
        { key, method: "GET" },
      );
      return { photoUri: data?.photoUri ?? null };
    }

    throw new HttpsError("invalid-argument", "Unknown request.");
  },
);
