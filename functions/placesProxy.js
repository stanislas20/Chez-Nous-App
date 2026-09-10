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
const admin = require("firebase-admin");

// Set with `firebase functions:secrets:set GOOGLE_PLACES_API_KEY`. The same
// mechanism pharmacyRosterSync already uses for its Anthropic key, so there
// is one way to hold a secret in this project rather than two.
const placesApiKey = defineSecret("GOOGLE_PLACES_API_KEY");

// Bénin's bounding box, enforced here because a text search unrestricted by
// geography is a general-purpose Places account for whoever finds the
// endpoint.
//
// It is a RECTANGLE, and Bénin is a narrow country, so it admits parts of two
// neighbours: Lagos and Lomé both fall inside it. That is measured, not
// guessed — scripts/functions-tests/places.test.js pins it — and it is worth
// writing down because the comment this replaces claimed the rectangle
// "guarantees every result is really in Bénin", which is not true of any
// rectangle drawn around this country.
//
// What it does do, and what it was actually introduced for, is exclude Benin
// City in Nigeria: Google matches that on the word "Benin" and was observed
// interleaving real Nigerian pharmacies with Cotonou ones. At 5.62°E it is
// well outside, along with Accra, Niamey and everywhere else.
//
// Not a security boundary either way. What stops this endpoint being an
// unmetered Places account is the auth requirement, the place-type allowlist
// and the radius clamp below. Tightening this to a polygon would change
// results for real border towns, which is a product decision.
const BENIN_BOUNDS = {
  low: { latitude: 6.1, longitude: 0.75 },
  high: { latitude: 12.45, longitude: 3.9 },
};

// What may be asked for. An allowlist rather than a pass-through of whatever
// `includedTypes` the caller sends: this endpoint exists to answer three
// questions the app asks, and anything else is somebody using our billing.
const ALLOWED_TYPES = new Set(["pharmacy", "restaurant"]);

// ── The billing tier is the server's decision, not the caller's ────────
//
// This used to take `fieldMask` from request.data and forward it verbatim as
// X-Goog-FieldMask. Google prices Places by field-mask tier — Essentials, Pro,
// Enterprise, Enterprise+Atmosphere — so a caller choosing the mask was a
// caller choosing what we pay per request, and `places.reviews` costs
// multiples of `places.id`. Every signed-in account had that switch.
//
// The masks below are exactly what the three hooks were already sending, so
// the response shape does not change. What changed is who picks: the client
// names an operation and a place type, and the server maps that to the fields
// it is willing to buy.
const FIELD_MASKS = {
  pharmacy:
    "places.id,places.displayName,places.location,places.formattedAddress," +
    "places.internationalPhoneNumber,places.currentOpeningHours.openNow,places.rating," +
    "places.photos",
  restaurant:
    "places.id,places.displayName,places.location,places.formattedAddress," +
    "places.internationalPhoneNumber,places.currentOpeningHours.openNow," +
    "places.rating,places.userRatingCount,places.priceLevel,places.photos",
};

function fieldMaskFor(type) {
  const mask = FIELD_MASKS[type];
  if (!mask) {
    // Unreachable while ALLOWED_TYPES and FIELD_MASKS agree; a loud failure
    // is better than silently asking Google for everything.
    throw new HttpsError("invalid-argument", "Unsupported place type.");
  }
  return mask;
}

// ── Abuse control, per account first ───────────────────────────────────
//
// The recovery endpoint next door limits by IP, and in Bénin that is the
// weaker of the two dimensions: carrier-grade NAT puts a great many honest
// subscribers behind one address, so an IP limit tight enough to matter
// throttles real users, and one loose enough not to does not stop anybody.
//
// So the account is the primary key. Every call here is authenticated, which
// means there is always a uid, and an abuser has to create and verify a phone
// number per bucket rather than change networks. The IP window stays as a
// second, much looser dimension: it is what catches one device cycling
// through many accounts, and it is deliberately high enough that a shared
// carrier NAT never reaches it in ordinary use.
//
// A screen costs one search plus up to twenty photo calls, so an hour of
// normal use is well under the per-user ceiling and a loop is not.
const QUOTA_WINDOW_MS = 60 * 60 * 1000;
const QUOTA_MAX_PER_USER = 240;
const QUOTA_MAX_PER_IP = 1500;

async function consumeQuota(db, key, max) {
  const ref = db.doc(`placesQuota/${key}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();
    const windowStart = snap.exists ? (snap.data().windowStart ?? 0) : 0;
    const count = snap.exists ? (snap.data().count ?? 0) : 0;

    if (now - windowStart > QUOTA_WINDOW_MS) {
      tx.set(ref, { windowStart: now, count: 1 });
      return;
    }
    if (count >= max) {
      throw new HttpsError(
        "resource-exhausted",
        "Too many place lookups. Try again later.",
      );
    }
    tx.set(ref, { windowStart, count: count + 1 }, { merge: true });
  });
}

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

    // Before the key is read and long before Google is called, so a throttled
    // caller costs a Firestore transaction rather than a billable request.
    const db = admin.firestore();
    await consumeQuota(db, `u_${request.auth.uid}`, QUOTA_MAX_PER_USER);
    const rawIp = request.rawRequest?.ip || "unknown";
    await consumeQuota(
      db,
      `i_${rawIp.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 100)}`,
      QUOTA_MAX_PER_IP,
    );

    const key = placesApiKey.value();
    if (!key) throw new HttpsError("failed-precondition", "Places not configured.");

    const { kind } = request.data ?? {};

    if (kind === "searchNearby") {
      const { latitude, longitude, radius, type } = request.data;
      assertInBenin(latitude, longitude);
      if (!ALLOWED_TYPES.has(type)) {
        throw new HttpsError("invalid-argument", "Unsupported place type.");
      }
      return callPlaces("https://places.googleapis.com/v1/places:searchNearby", {
        key,
        fieldMask: fieldMaskFor(type),
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
      const { textQuery, type } = request.data;
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
        fieldMask: fieldMaskFor(type),
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
