// placesProxy, executed.
//
// The function exists because the Places key used to ship inside the APK.
// Moving it to a server only helps if the server actually holds it, actually
// validates what it is asked, and actually refuses to hand Google's own error
// text — which names the key and the project — back to a phone.
//
// Nothing here touches the network. `global.fetch` is replaced, so every
// Google response is one this file chose, including the failures that are
// difficult to provoke on purpose: a 500, a quota rejection, a timeout.
//
// Run: node scripts/functions-tests/places.test.js
const path = require("path");
const {
  check,
  expectHttpsError,
  callerContext,
  report,
  assert,
} = require("./harness");

// The secret, before the module is required: defineSecret().value() reads
// process.env at call time, and this is what proves the key is read
// server-side rather than sent by the caller.
const FAKE_KEY = "AIza-TEST-KEY-must-never-reach-a-client";
process.env.GOOGLE_PLACES_API_KEY = FAKE_KEY;

const FUNCTIONS = path.join(__dirname, "..", "..", "functions");

// The quota counters live in Firestore, and this suite has no emulator — it
// runs the function in process. So admin.firestore is replaced by an
// in-memory store that implements only what consumeQuota uses.
//
// defineProperty rather than assignment, and that is not fussiness: Phase C
// found admin.storage is an INHERITED accessor, so `admin.storage = stub`
// silently did nothing and a partial-failure test passed while asserting
// against the real thing. admin.firestore is the same shape.
const admin = require(path.join(FUNCTIONS, "node_modules", "firebase-admin"));
const quotaStore = new Map();
function resetQuota() {
  quotaStore.clear();
}
const fakeFirestore = () => ({
  doc: (docPath) => ({ path: docPath }),
  runTransaction: async (fn) =>
    fn({
      get: async (ref) => {
        const data = quotaStore.get(ref.path);
        return { exists: data !== undefined, data: () => data };
      },
      set: (ref, data, options) => {
        const previous = options?.merge ? (quotaStore.get(ref.path) ?? {}) : {};
        quotaStore.set(ref.path, { ...previous, ...data });
      },
    }),
});
Object.defineProperty(admin, "firestore", {
  configurable: true,
  writable: true,
  value: fakeFirestore,
});

const { placesProxy } = require(path.join(FUNCTIONS, "placesProxy.js"));

// Every call fetch was asked to make, so the test can assert on the request
// as well as the response — the key travelling in a header is the whole
// point of the change.
let fetchCalls = [];
let nextResponse = null;

global.fetch = async (url, options) => {
  fetchCalls.push({ url: String(url), options });
  if (typeof nextResponse === "function") return nextResponse();
  return nextResponse;
};

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const httpError = (status, body) => ({ ok: false, status, json: async () => body });

const COTONOU = { latitude: 6.37, longitude: 2.39 };
const AUTHED = callerContext("buyer-uid");

// The field masks the real hooks send, so the shape assertions below are
// about what the app actually asks for.
const PHARMACY_MASK =
  "places.id,places.displayName,places.location,places.formattedAddress," +
  "places.internationalPhoneNumber,places.currentOpeningHours.openNow,places.rating,places.photos";

async function main() {
  // ── The key is read server-side and never returned ────────────────────
  await check("the caller never supplies the key; the server reads it", async () => {
    fetchCalls = [];
    nextResponse = ok({ places: [] });
    await placesProxy.run({
      ...AUTHED,
      data: { kind: "searchNearby", ...COTONOU, radius: 5000, type: "pharmacy", fieldMask: PHARMACY_MASK },
    });
    assert.strictEqual(fetchCalls.length, 1);
    assert.strictEqual(
      fetchCalls[0].options.headers["X-Goog-Api-Key"],
      FAKE_KEY,
      "the key was not sent to Google from the server",
    );
  });

  await check("the key is never in the response handed back to the app", async () => {
    fetchCalls = [];
    nextResponse = ok({ places: [{ id: "p1", displayName: { text: "Pharmacie Zone" } }] });
    const result = await placesProxy.run({
      ...AUTHED,
      data: { kind: "searchNearby", ...COTONOU, radius: 5000, type: "pharmacy", fieldMask: PHARMACY_MASK },
    });
    assert.ok(
      !JSON.stringify(result).includes(FAKE_KEY),
      "the key came back in the payload",
    );
  });

  // ── Valid requests, and the shape the app expects ─────────────────────
  await check("a nearby pharmacy search returns Google's own shape", async () => {
    nextResponse = ok({
      places: [
        {
          id: "p1",
          displayName: { text: "Pharmacie Jonquet" },
          location: { latitude: 6.36, longitude: 2.42 },
          formattedAddress: "Cotonou",
          internationalPhoneNumber: "+229 01 23 45 67 89",
          currentOpeningHours: { openNow: true },
          rating: 4.2,
          photos: [{ name: "places/p1/photos/x", authorAttributions: [{ displayName: "A" }] }],
        },
      ],
    });
    const result = await placesProxy.run({
      ...AUTHED,
      data: { kind: "searchNearby", ...COTONOU, radius: 5000, type: "pharmacy", fieldMask: PHARMACY_MASK },
    });
    // The hooks read exactly these paths; a proxy that reshaped the payload
    // would break them silently.
    assert.ok(Array.isArray(result.places), "no places array");
    const place = result.places[0];
    assert.strictEqual(place.id, "p1");
    assert.strictEqual(place.displayName.text, "Pharmacie Jonquet");
    assert.strictEqual(place.location.latitude, 6.36);
    assert.strictEqual(place.currentOpeningHours.openNow, true);
    assert.ok(place.photos[0].name.startsWith("places/"));
  });

  await check("a restaurant search is allowed too", async () => {
    nextResponse = ok({ places: [{ id: "r1" }] });
    const result = await placesProxy.run({
      ...AUTHED,
      data: { kind: "searchNearby", ...COTONOU, radius: 5000, type: "restaurant", fieldMask: "places.id" },
    });
    assert.strictEqual(result.places[0].id, "r1");
  });

  await check("a text search applies the Bénin rectangle server-side", async () => {
    fetchCalls = [];
    nextResponse = ok({ places: [] });
    await placesProxy.run({
      ...AUTHED,
      data: { kind: "searchText", textQuery: "Les Archanges", type: "pharmacy", fieldMask: PHARMACY_MASK },
    });
    const body = JSON.parse(fetchCalls[0].options.body);
    assert.ok(body.locationRestriction?.rectangle, "no rectangle was applied");
    assert.strictEqual(body.locationRestriction.rectangle.low.latitude, 6.1);
    assert.strictEqual(body.locationRestriction.rectangle.high.longitude, 3.9);
  });

  await check("a photo request returns the resolved URL and no key", async () => {
    fetchCalls = [];
    nextResponse = ok({ photoUri: "https://lh3.googleusercontent.com/places/abc" });
    const result = await placesProxy.run({
      ...AUTHED,
      data: { kind: "photo", photoName: "places/p1/photos/abc", maxWidthPx: 400 },
    });
    assert.strictEqual(result.photoUri, "https://lh3.googleusercontent.com/places/abc");
    assert.ok(fetchCalls[0].url.includes("skipHttpRedirect=true"));
    assert.ok(!result.photoUri.includes(FAKE_KEY));
  });

  await check("empty results come back as an empty list, not an error", async () => {
    nextResponse = ok({});
    const result = await placesProxy.run({
      ...AUTHED,
      data: { kind: "searchNearby", ...COTONOU, radius: 5000, type: "pharmacy", fieldMask: PHARMACY_MASK },
    });
    // Google omits `places` entirely when nothing matched. The hooks read
    // `data.places ?? []`, so passing the payload through unchanged is
    // correct — the point is that it is not turned into a throw.
    assert.ok(result.places === undefined || result.places.length === 0);
  });

  // ── Refusals ──────────────────────────────────────────────────────────
  await check("an unauthenticated caller is refused", async () => {
    nextResponse = ok({ places: [] });
    await expectHttpsError(
      placesProxy.run({
        auth: null,
        data: { kind: "searchNearby", ...COTONOU, radius: 5000, type: "pharmacy" },
      }),
      "unauthenticated",
    );
  });

  await check("an unknown request kind is refused", async () => {
    await expectHttpsError(
      placesProxy.run({ ...AUTHED, data: { kind: "listEverything" } }),
      "invalid-argument",
    );
  });

  await check("a request with no data at all is refused", async () => {
    await expectHttpsError(
      placesProxy.run({ ...AUTHED, data: undefined }),
      "invalid-argument",
    );
  });

  await check("coordinates well outside the region are refused", async () => {
    for (const [name, latitude, longitude] of [
      ["Paris", 48.85, 2.35],
      ["Accra", 5.6, -0.19],
      ["Niamey", 13.51, 2.11],
      // Benin City, Nigeria — the ambiguity the rectangle was introduced
      // for, since Google matches it on the word "Benin".
      ["Benin City", 6.34, 5.62],
    ]) {
      await expectHttpsError(
        placesProxy.run({
          ...AUTHED,
          data: { kind: "searchNearby", latitude, longitude, radius: 5000, type: "pharmacy" },
        }),
        "invalid-argument",
        { messageMustNotInclude: [FAKE_KEY] },
      ).catch((error) => {
        throw new Error(`${name}: ${error.message}`);
      });
    }
  });

  // Known and now pinned: the guard is a RECTANGLE, and Bénin is a narrow
  // country with neighbours inside its bounding box. Lagos and Lomé are both
  // admitted. This is recorded as a passing test rather than left as a
  // surprise, because the comment in useSearchPharmacies used to claim the
  // rectangle "guarantees every result is really in Bénin" and it does not.
  //
  // It is a coarse gate and not a security boundary: what stops this endpoint
  // being a general-purpose Places account is the auth requirement, the place
  // type allowlist and the radius clamp, all tested above. Tightening the
  // rectangle to a polygon would change search results for real Bénin
  // border towns, which is a product decision and not a Phase C one.
  await check("the rectangle is coarse: Lagos and Lomé fall inside it", async () => {
    nextResponse = ok({ places: [] });
    for (const [latitude, longitude] of [
      [6.52, 3.37], // Lagos
      [6.17, 1.23], // Lomé
    ]) {
      const result = await placesProxy.run({
        ...AUTHED,
        data: { kind: "searchNearby", latitude, longitude, radius: 5000, type: "pharmacy" },
      });
      assert.ok(result, "expected the coarse rectangle to admit this point");
    }
  });

  await check("a place type outside the allowlist is refused", async () => {
    await expectHttpsError(
      placesProxy.run({
        ...AUTHED,
        data: { kind: "searchNearby", ...COTONOU, radius: 5000, type: "gas_station" },
      }),
      "invalid-argument",
    );
  });

  await check("an empty text query is refused", async () => {
    await expectHttpsError(
      placesProxy.run({ ...AUTHED, data: { kind: "searchText", textQuery: "   ", type: "pharmacy" } }),
      "invalid-argument",
    );
  });

  await check("an overlong text query is refused", async () => {
    await expectHttpsError(
      placesProxy.run({
        ...AUTHED,
        data: { kind: "searchText", textQuery: "x".repeat(201), type: "pharmacy" },
      }),
      "invalid-argument",
    );
  });

  await check("a photo reference that could climb out of the path is refused", async () => {
    for (const photoName of [
      "places/p1/photos/../../../secret",
      "../../etc/passwd",
      "places/p1/photos/abc?key=leak",
      "",
      42,
    ]) {
      await expectHttpsError(
        placesProxy.run({ ...AUTHED, data: { kind: "photo", photoName } }),
        "invalid-argument",
      );
    }
  });

  // ── Clamping, so a caller cannot spend on our account ─────────────────
  await check("an absurd radius is clamped rather than forwarded", async () => {
    fetchCalls = [];
    nextResponse = ok({ places: [] });
    await placesProxy.run({
      ...AUTHED,
      data: { kind: "searchNearby", ...COTONOU, radius: 9999999, type: "pharmacy" },
    });
    const body = JSON.parse(fetchCalls[0].options.body);
    assert.strictEqual(body.locationRestriction.circle.radius, 50000);
  });

  await check("an absurd photo width is clamped", async () => {
    fetchCalls = [];
    nextResponse = ok({ photoUri: "https://x/y" });
    await placesProxy.run({
      ...AUTHED,
      data: { kind: "photo", photoName: "places/p1/photos/abc", maxWidthPx: 99999 },
    });
    assert.ok(fetchCalls[0].url.includes("maxWidthPx=1200"), fetchCalls[0].url);
  });

  await check("result count is capped regardless of what the caller asks", async () => {
    fetchCalls = [];
    nextResponse = ok({ places: [] });
    await placesProxy.run({
      ...AUTHED,
      data: { kind: "searchNearby", ...COTONOU, radius: 5000, type: "pharmacy", maxResultCount: 5000 },
    });
    const body = JSON.parse(fetchCalls[0].options.body);
    assert.strictEqual(body.maxResultCount, 20);
  });

  // ── Google failing, in the ways Google fails ──────────────────────────
  // Every one of these asserts the client message does NOT carry Google's
  // own text, because Google's error strings name the API key and the
  // project number.
  const LEAKY = [FAKE_KEY, "benin-marketplace-3eb04", "API key not valid"];

  await check("a Google 400 becomes a safe error", async () => {
    nextResponse = httpError(400, {
      error: { message: `API key not valid. Key=${FAKE_KEY} project=benin-marketplace-3eb04` },
    });
    await expectHttpsError(
      placesProxy.run({
        ...AUTHED,
        data: { kind: "searchNearby", ...COTONOU, radius: 5000, type: "pharmacy" },
      }),
      "unavailable",
      { messageMustNotInclude: LEAKY },
    );
  });

  await check("a Google 500 becomes a safe error", async () => {
    nextResponse = httpError(500, { error: { message: "Internal error", details: FAKE_KEY } });
    await expectHttpsError(
      placesProxy.run({
        ...AUTHED,
        data: { kind: "searchText", textQuery: "pharmacie", type: "pharmacy" },
      }),
      "unavailable",
      { messageMustNotInclude: LEAKY },
    );
  });

  await check("a quota rejection becomes a safe error", async () => {
    nextResponse = httpError(429, {
      error: { message: "Quota exceeded for quota metric 'Requests' of service 'places.googleapis.com'" },
    });
    await expectHttpsError(
      placesProxy.run({
        ...AUTHED,
        data: { kind: "searchNearby", ...COTONOU, radius: 5000, type: "pharmacy" },
      }),
      "unavailable",
      { messageMustNotInclude: LEAKY },
    );
  });

  await check("a permission failure becomes a safe error", async () => {
    nextResponse = httpError(403, { error: { message: `Requests to this API are blocked. ${FAKE_KEY}` } });
    await expectHttpsError(
      placesProxy.run({ ...AUTHED, data: { kind: "photo", photoName: "places/p1/photos/abc" } }),
      "unavailable",
      { messageMustNotInclude: LEAKY },
    );
  });

  // A timeout is fetch rejecting rather than answering. This is the one case
  // that does NOT become an HttpsError today — the rejection propagates —
  // and the assertion records exactly that, including that the raw message
  // reaching the client carries nothing secret.
  await check("a network timeout surfaces without leaking the key", async () => {
    nextResponse = () => {
      const error = new Error("network timeout at: https://places.googleapis.com/v1/places:searchNearby");
      error.name = "FetchError";
      throw error;
    };
    let caught = null;
    try {
      await placesProxy.run({
        ...AUTHED,
        data: { kind: "searchNearby", ...COTONOU, radius: 5000, type: "pharmacy" },
      });
    } catch (error) {
      caught = error;
    }
    assert.ok(caught, "a timeout should not resolve successfully");
    for (const secret of LEAKY) {
      assert.ok(
        !String(caught.message).includes(secret),
        `a timeout leaked "${secret}" to the client`,
      );
    }
  });

  // ── Misconfiguration ──────────────────────────────────────────────────
  await check("a missing secret is refused rather than called without one", async () => {
    const saved = process.env.GOOGLE_PLACES_API_KEY;
    process.env.GOOGLE_PLACES_API_KEY = "";
    try {
      await expectHttpsError(
        placesProxy.run({
          ...AUTHED,
          data: { kind: "searchNearby", ...COTONOU, radius: 5000, type: "pharmacy" },
        }),
        "failed-precondition",
      );
    } finally {
      process.env.GOOGLE_PLACES_API_KEY = saved;
    }
  });

  // ── E3: the caller cannot choose what we pay Google ──────────────────
  await check(
    "an expensive field mask sent by the caller is ignored entirely",
    async () => {
      resetQuota();
      fetchCalls = [];
      nextResponse = ok({ places: [] });
      await placesProxy.run({
        ...AUTHED,
        data: {
          kind: "searchNearby",
          latitude: 6.37,
          longitude: 2.42,
          radius: 3000,
          type: "pharmacy",
          // Atmosphere-tier fields: the most expensive SKU Google sells.
          fieldMask: "places.reviews,places.priceLevel,*",
        },
      });
      const sent = fetchCalls[0].options.headers["X-Goog-FieldMask"];
      assert(sent === PHARMACY_MASK, `mask sent to Google was "${sent}"`);
      assert(!sent.includes("reviews"), "the caller's reviews field reached Google");
      assert(!sent.includes("*"), "the caller's wildcard reached Google");
    },
  );

  await check("the field mask is chosen by place type, server side", async () => {
    resetQuota();
    fetchCalls = [];
    nextResponse = ok({ places: [] });
    await placesProxy.run({
      ...AUTHED,
      data: {
        kind: "searchNearby",
        latitude: 6.37,
        longitude: 2.42,
        radius: 3000,
        type: "restaurant",
      },
    });
    const sent = fetchCalls[0].options.headers["X-Goog-FieldMask"];
    assert(sent.includes("userRatingCount"), "restaurant mask missing its own fields");
    assert(sent !== PHARMACY_MASK, "restaurant reused the pharmacy mask");
  });

  // ── E3: per-account rate limiting ────────────────────────────────────
  await check("an ordinary session is never throttled", async () => {
    resetQuota();
    nextResponse = ok({ places: [] });
    for (let i = 0; i < 25; i += 1) {
      await placesProxy.run({
        ...AUTHED,
        data: { kind: "searchNearby", latitude: 6.37, longitude: 2.42, radius: 3000, type: "pharmacy" },
      });
    }
    assert(true, "25 calls went through");
  });

  await check("a caller looping the endpoint is cut off", async () => {
    resetQuota();
    nextResponse = ok({ places: [] });
    let refusedAt = null;
    for (let i = 0; i < 400 && refusedAt === null; i += 1) {
      try {
        await placesProxy.run({
          ...AUTHED,
          data: { kind: "searchNearby", latitude: 6.37, longitude: 2.42, radius: 3000, type: "pharmacy" },
        });
      } catch (error) {
        assert(error.code === "resource-exhausted", `refused with ${error.code}`);
        refusedAt = i;
      }
    }
    assert(refusedAt !== null, "the endpoint never refused a 400-call loop");
    assert(refusedAt > 100, `cut off after only ${refusedAt} calls, too tight for real use`);
  });

  await check("one account's spending does not throttle another account", async () => {
    resetQuota();
    nextResponse = ok({ places: [] });
    // Burn the first account's budget.
    let exhausted = false;
    for (let i = 0; i < 400 && !exhausted; i += 1) {
      try {
        await placesProxy.run({
          ...AUTHED,
          data: { kind: "searchNearby", latitude: 6.37, longitude: 2.42, radius: 3000, type: "pharmacy" },
        });
      } catch {
        exhausted = true;
      }
    }
    assert(exhausted, "the first account was never exhausted");
    // A different uid, same (unknown) IP, must still be served.
    const other = callerContext("other-buyer-uid");
    const result = await placesProxy.run({
      ...other,
      data: { kind: "searchNearby", latitude: 6.37, longitude: 2.42, radius: 3000, type: "pharmacy" },
    });
    assert(result !== undefined, "a second account was refused by the first's quota");
  });

  await check("a throttled call never reaches Google", async () => {
    resetQuota();
    nextResponse = ok({ places: [] });
    let exhausted = false;
    for (let i = 0; i < 400 && !exhausted; i += 1) {
      try {
        await placesProxy.run({
          ...AUTHED,
          data: { kind: "searchNearby", latitude: 6.37, longitude: 2.42, radius: 3000, type: "pharmacy" },
        });
      } catch {
        exhausted = true;
      }
    }
    fetchCalls = [];
    await expectHttpsError(
      placesProxy.run({
        ...AUTHED,
        data: { kind: "searchNearby", latitude: 6.37, longitude: 2.42, radius: 3000, type: "pharmacy" },
      }),
      "resource-exhausted",
    );
    assert(fetchCalls.length === 0, "a throttled call still spent a Places request");
  });

  await check("a malformed request is refused before it costs a quota slot", async () => {
    resetQuota();
    await expectHttpsError(
      placesProxy.run({ ...AUTHED, data: { kind: "searchNearby", type: "pharmacy" } }),
      "invalid-argument",
    );
  });

  report("placesProxy cases");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
