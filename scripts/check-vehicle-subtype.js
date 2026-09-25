#!/usr/bin/env node
//
// Vehicles publishes three different things, and the form has to stop being
// a vehicle form for two of them.
//
// partType splits the Vehicles category into vehicle / tyre / battery, and
// the split is enforced by a gate on every vehicle-only block. Get one gate
// wrong and the block does not merely LOOK wrong — the seller answers it and
// the answer is written onto the listing.
//
// That is what happened. The sell-or-rent question was gated on
// `isVehicle && !isTyreOffer`: excluded for a tyre, left in place for a
// battery. Publishing a battery asked whether you were renting it out.
// Two sibling blocks a few hundred lines away used `!isPartOffer` correctly,
// which is what makes this the kind of mistake a file catches and a reader
// does not.
//
// THE MARQUE ESCAPE HATCH. vehicleBrands is 24 names. A Peugeot 504 is not
// exotic here and had no way to be published, so the seller either gave up or
// filed it under a marque it is not — and the search index then believes it.
// BRAND_OTHER is a picker sentinel; the rule that matters is that it never
// reaches a listing. Everything downstream reads brandValue, which resolves
// the sentinel to the typed text, so `brand` on a document stays a plain
// string and every existing listing keeps working.
//
// Run: node scripts/check-vehicle-subtype.js
const fs = require("fs");
const path = require("path");

const SOURCE = path.join(
  __dirname,
  "..",
  "src",
  "screens",
  "CreateListingScreen.js",
);
const src = fs.readFileSync(SOURCE, "utf8");

let failures = 0;
const fail = (message) => {
  console.error(`FAIL ${message}`);
  failures += 1;
};

// ── 1. The three subtypes exist and are distinguishable ────────────────
for (const key of ["vehicle", "tyre", "battery"]) {
  if (!new RegExp(`key:\\s*"${key}"`).test(src))
    fail(`PART_TYPES no longer offers "${key}"`);
}
if (!/const isTyreOffer = isVehicle && partType === "tyre"/.test(src))
  fail("isTyreOffer is no longer derived from partType");
if (!/const isBatteryOffer = isVehicle && partType === "battery"/.test(src))
  fail("isBatteryOffer is no longer derived from partType");
if (!/const isPartOffer = isTyreOffer \|\| isBatteryOffer/.test(src))
  fail("isPartOffer no longer covers both parts");

// ── 2. No vehicle-only block may exclude one part and not the other ────
//
// This is the defect itself, stated as a rule. A gate that names one part is
// almost always a gate that forgot the other; if a block ever genuinely
// applies to a battery but not a tyre it needs its own named condition and a
// comment saying why, not a bare !isTyreOffer.
const oneSided = [
  ...src.matchAll(/isVehicle && !(isTyreOffer|isBatteryOffer)\b/g),
];
if (oneSided.length)
  fail(
    `${oneSided.length} vehicle block(s) gated on one part only ` +
      `(${[...new Set(oneSided.map((m) => m[1]))].join(", ")}) — ` +
      `use !isPartOffer, or name and justify the exception`,
  );

// ── 3. The sell-or-rent question is not asked of a part ────────────────
const purposeAt = src.indexOf('t("sellFieldVehiclePurpose")');
if (purposeAt === -1) {
  fail("the sell-or-rent question has gone missing");
} else {
  const gate = src.lastIndexOf("isVehicle &&", purposeAt);
  const guard = src.slice(gate, purposeAt);
  if (!/!isPartOffer/.test(guard))
    fail(
      "the sell-or-rent question is no longer excluded for parts — a battery " +
        "seller would be asked whether they are renting it out",
    );
}

// ── 4. The marque sentinel never reaches a listing ─────────────────────
if (!/const BRAND_OTHER = /.test(src)) fail("BRAND_OTHER is gone");
if (!/const brandValue = brand === BRAND_OTHER \? brandOther\.trim\(\) : brand/.test(src))
  fail("brandValue no longer resolves the sentinel to the typed marque");

// Every place a marque leaves this screen must read brandValue. `brand` is
// the picker's state and may hold the sentinel.
const leaks = [
  [/if \(!vehicleDeal \|\| !brand \|\|/, "validation accepts an empty Other"],
  [/^\s+brand,$/m, "the submit payload writes the raw picker state"],
  [
    /brand: isVehicle(?: && !isPartOffer)? \? brand :/,
    "the preview payload writes the raw picker state",
  ],
];
for (const [pattern, message] of leaks) {
  if (pattern.test(src)) fail(message);
}
for (const required of [
  /!brandValue/,
  /brand: brandValue,/,
  /brand: isVehicle && !isPartOffer \? brandValue : null/,
]) {
  if (!required.test(src))
    fail(`a marque call site no longer reads brandValue: ${required}`);
}

// ── 5. The preview card shows what will actually be published ──────────
//
// previewListing is the one thing on the screen claiming to show the result.
// Gated on isVehicle alone, a seller who filled in a car and switched to
// Tyres or Battery kept seeing their old marque, model and mileage on it.
// It has to agree with the submit payload, which is gated on !isPartOffer.
const previewAt = src.indexOf("const previewListing = {");
if (previewAt === -1) {
  fail("previewListing has gone missing");
} else {
  const preview = src.slice(previewAt, previewAt + 2600);
  for (const field of [
    "vehicleDeal",
    "brand",
    "model",
    "year",
    "mileage",
    "sellerKind",
    "documents",
    "hasDocuments",
  ]) {
    const bare = new RegExp(`${field}: isVehicle \\?`);
    if (bare.test(preview))
      fail(
        `previewListing.${field} is gated on isVehicle alone — a tyre or ` +
          `battery preview would show a stale vehicle value`,
      );
  }
}

// ── 6. Leaving Other does not leave its text behind ────────────────────
if (!/setBrandOther\(""\)/.test(src))
  fail(
    "choosing a listed marque no longer clears the typed one — an abandoned " +
      "marque could be revived by the payload",
  );

if (failures) process.exit(1);
console.log(
  "clean: vehicle / tyre / battery are gated apart, no vehicle block excludes " +
    "one part only, and the marque sentinel never reaches a listing",
);
