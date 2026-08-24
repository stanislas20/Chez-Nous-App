// Does the seed actually reach the screens it was written for?
//
// A seeding script that produces documents the hooks filter straight back
// out is worse than none: it looks like it worked, the screens stay empty,
// and the next hour goes into debugging the wrong layer. So this runs the
// REAL predicates — the same trade matcher the app uses, and the same field
// tests the hooks apply — against the documents the seed would write.
//
// It doubles as a contract test between the two halves of the feature: if
// somebody renames partType or changes what makes a listing a tyre shop,
// this fails before anyone writes to a database.
//
// Run: node scripts/check-seed-contract.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const { buildDocs } = require("./seedTestListings.js");

function loadModule(relative, expose = []) {
  const source = fs
    .readFileSync(path.join(__dirname, "..", relative), "utf8")
    .replace(/^export /gm, "");
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${source}\n${expose.map((n) => `this.${n} = ${n};`).join("\n")}`,
    context,
  );
  return context;
}

const specialties = loadModule("src/data/garageSpecialties.js");
const tyres = loadModule("src/data/tyres.js");
const batteries = loadModule("src/data/batteries.js");

const docs = buildDocs("seller-1", "Vendeur test", 0);
const failures = [];
const text = (doc) =>
  `${doc.titleFr ?? ""} ${doc.titleEn ?? ""} ${doc.descriptionFr ?? ""} ${doc.descriptionEn ?? ""}`;

// --- the hooks' own filters, transcribed from useTyreOffers /
//     useBatteryOffers / useGarageProviders / useTyreProviders /
//     useBatteryProviders. Kept in one place so a drift shows up here.
const isTyreOffer = (doc) =>
  doc.categoryKey === "vehicles" &&
  doc.partType === "tyre" &&
  Boolean(tyres.formatTyreSize(doc.tyreWidth, doc.tyreRatio, doc.tyreDiameter));

const isBatteryOffer = (doc) =>
  doc.categoryKey === "vehicles" &&
  doc.partType === "battery" &&
  Number(doc.batteryAh) > 0;

const isProvider = (doc) =>
  doc.categoryKey === "services" && specialties.isGarageListing(text(doc));

const hasSpecialty = (doc, key) =>
  isProvider(doc) && specialties.garageSpecialtiesFor(text(doc)).includes(key);

const expect = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label}: expected ${expected}, got ${actual}`);
  }
};

const byTitle = (needle) =>
  docs.find((doc) => doc.titleFr.toLowerCase().includes(needle));

// Every seeded document must land in exactly the list it was written for.
const michelin = byTitle("michelin");
const continental = byTitle("continental");
const bosch = byTitle("bosch");
const fulmen = byTitle("fulmen");
const tyreShop = byTitle("géométrie");
const batteryShop = byTitle("batterie express");

expect("Michelin reaches Pneus", isTyreOffer(michelin), true);
expect("Continental reaches Pneus", isTyreOffer(continental), true);
expect("Bosch reaches Batterie", isBatteryOffer(bosch), true);
expect("Fulmen reaches Batterie", isBatteryOffer(fulmen), true);

// ...and in no other. A battery showing up among tyres would be a silent
// mess to unpick from a live list.
expect("Bosch is not a tyre", isTyreOffer(bosch), false);
expect("Michelin is not a battery", isBatteryOffer(michelin), false);
expect("tyre shop is not an offer", isTyreOffer(tyreShop), false);

// The providers depend on the words, not on a flag — which is exactly the
// part most likely to be got wrong when writing test data by hand.
expect("tyre shop is a provider", isProvider(tyreShop), true);
expect("tyre shop matches pneu", hasSpecialty(tyreShop, "pneu"), true);
expect("battery shop is a provider", isProvider(batteryShop), true);
expect("battery shop matches batt", hasSpecialty(batteryShop, "batt"), true);

// The declared arrays the two screens filter on.
expect(
  "tyre shop declares fitting",
  (tyreShop.tyreServices ?? []).includes("fitting"),
  true,
);
expect(
  "battery shop declares testing",
  (batteryShop.batteryServices ?? []).includes("test"),
  true,
);
expect(
  "tyre shop stocks the searched size",
  (tyreShop.tyreSizes ?? []).includes("195/65 R15"),
  true,
);

// Both offers share a size, so "du moins cher" has something to order.
expect(
  "two offers in one size",
  tyres.formatTyreSize(
    michelin.tyreWidth,
    michelin.tyreRatio,
    michelin.tyreDiameter,
  ) ===
    tyres.formatTyreSize(
      continental.tyreWidth,
      continental.tyreRatio,
      continental.tyreDiameter,
    ),
  true,
);
expect("cheaper one is the used one", continental.price < michelin.price, true);

// The used tyre is meant to be old enough to render the DOT warning.
expect(
  "used tyre trips the age warning",
  tyres.isAgedTyre(continental.tyreDotYear),
  true,
);

// A card whose first button is "Appeler" needs a number, and the form now
// requires one — the seed must not be able to create what the app forbids.
[michelin, continental, bosch, fulmen].forEach((doc) => {
  if (!doc.phone) failures.push(`${doc.titleFr}: no phone`);
});

// Every seeded document must be removable by the flag, or cleanup is manual.
docs.forEach((doc) => {
  if (doc.isTestSeed !== true)
    failures.push(`${doc.titleFr}: missing isTestSeed`);
  if (!doc.titleFr.startsWith("TEST —")) {
    failures.push(`${doc.titleFr}: title is not marked as test data`);
  }
  if (doc.status !== "approved") {
    failures.push(`${doc.titleFr}: not approved, so no screen would show it`);
  }
});

// The battery capacities must pass the same validation the form applies.
[bosch, fulmen].forEach((doc) => {
  if (!batteries.isValidBatteryCapacity(doc.batteryAh)) {
    failures.push(`${doc.titleFr}: capacity out of range`);
  }
  if (!batteries.isValidCrankingAmps(doc.batteryAmps)) {
    failures.push(`${doc.titleFr}: cranking amps out of range`);
  }
});

// --- and the seeded rows must get out of the way on their own, or the
// first real professional to post lands next to something titled "TEST —".
const { withoutTestSeed } = loadModule("src/utils/testSeed.js", [
  "withoutTestSeed",
]);

const real = { titleFr: "Pneus Zongo", isTestSeed: undefined };
const seeded = docs.filter((doc) => doc.categoryKey === "vehicles");

expect("empty list stays empty", withoutTestSeed([]).length, 0);
expect("null is survivable", withoutTestSeed(null).length, 0);
expect(
  "seeded rows show while nothing real exists",
  withoutTestSeed(seeded).length,
  seeded.length,
);
expect(
  "one real post clears every seeded row",
  withoutTestSeed([...seeded, real]).length,
  1,
);
expect(
  "and the survivor is the real one",
  withoutTestSeed([...seeded, real])[0].titleFr,
  "Pneus Zongo",
);
// Order must survive, or a list sorted by price silently reshuffles the
// moment the first genuine listing arrives.
expect(
  "order is preserved",
  withoutTestSeed([real, { titleFr: "B" }, ...seeded])
    .map((doc) => doc.titleFr)
    .join(","),
  "Pneus Zongo,B",
);

if (failures.length) {
  failures.forEach((line) => console.error(line));
  console.error(`\n${failures.length} problem(s)`);
  process.exit(1);
}
console.log(
  `clean: ${docs.length} seeded documents reach their screens, and yield to real posts (23 contract checks)`,
);
