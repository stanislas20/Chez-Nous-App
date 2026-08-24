// The city guess, which was wrong in a way nobody could argue with.
//
// Every listing stores one of 61 named Bénin cities, so a GPS fix has to be
// resolved to one of them. Taking the nearest unconditionally always
// produces an answer, however absurd — a default simulator fix in Cupertino
// came back as Tanguiéta, 12 000 km away, and then overwrote whatever the
// seller had chosen. This pins both halves: the radius, and the refusal.
//
// Run: node scripts/check-nearest-city.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function load(relative, expose) {
  const source = fs
    .readFileSync(path.join(__dirname, "..", relative), "utf8")
    .replace(/^import .*$/gm, "")
    .replace(/^export /gm, "");
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${source}\n${expose.map((n) => `this.${n} = ${n};`).join("\n")}`,
    context,
  );
  return context;
}

// nearestCity.js imports its data, so it is assembled here rather than run
// through a module loader the app does not use.
const { cities } = load("src/data/cities.js", ["cities"]);
const { cityCoordinates } = load("src/data/cityCoordinates.js", [
  "cityCoordinates",
]);
const { distanceInKm } = load("src/utils/geo.js", ["distanceInKm"]);
const helper = fs
  .readFileSync(path.join(__dirname, "..", "src/utils/nearestCity.js"), "utf8")
  .replace(/^import .*$/gm, "")
  .replace(/^export /gm, "");
const context = { cities, cityCoordinates, distanceInKm };
vm.createContext(context);
vm.runInContext(
  `${helper}\nthis.nearestKnownCity = nearestKnownCity;\nthis.MAX_CITY_GUESS_KM = MAX_CITY_GUESS_KM;`,
  context,
);
const { nearestKnownCity, MAX_CITY_GUESS_KM } = context;

const failures = [];
const fail = (line) => failures.push(line);

// Every city must resolve to itself. If one does not, its coordinates are
// wrong and every listing published from there lands in the wrong place.
cities.forEach((city) => {
  const result = nearestKnownCity(cityCoordinates[city]);
  if (!result) {
    fail(`${city}: does not resolve to any city from its own coordinates`);
    return;
  }
  if (result.city !== city) {
    fail(`${city}: resolves to ${result.city} (${result.distanceKm} km)`);
  }
});

// Fixes that must be refused. Each of these produced a confident Bénin city
// before the radius existed.
const OUT_OF_RANGE = [
  ["Cupertino simulator default", { latitude: 37.3318, longitude: -122.0312 }],
  ["Null Island", { latitude: 0, longitude: 0 }],
  ["Paris", { latitude: 48.8566, longitude: 2.3522 }],
  ["Nairobi", { latitude: -1.2921, longitude: 36.8219 }],
  ["north of the country", { latitude: 14.5, longitude: 2.0 }],
];
OUT_OF_RANGE.forEach(([label, coords]) => {
  const result = nearestKnownCity(coords);
  if (result) {
    fail(
      `${label}: guessed ${result.city} at ${Math.round(result.distanceKm)} km`,
    );
  }
});

// And fixes that must still be accepted, including one just over the border:
// somebody in Lagos genuinely is next to Avrankou.
const IN_RANGE = [
  ["Cotonou", { latitude: 6.3703, longitude: 2.3912 }, "Cotonou"],
  ["Parakou", { latitude: 9.34, longitude: 2.63 }, "Parakou"],
  ["Lagos", { latitude: 6.5244, longitude: 3.3792 }, null],
];
IN_RANGE.forEach(([label, coords, expected]) => {
  const result = nearestKnownCity(coords);
  if (!result) {
    fail(`${label}: refused, but it is inside the radius`);
    return;
  }
  if (expected && result.city !== expected) {
    fail(`${label}: resolved to ${result.city}, expected ${expected}`);
  }
});

// No coordinates at all is not an error, it is simply no answer.
if (nearestKnownCity(null) !== null) fail("null coords should give null");
if (nearestKnownCity(undefined) !== null)
  fail("undefined coords should give null");

// The radius has to stay wide enough to cover the gaps between cities, or a
// real fix in a thinly-covered region would be refused. The widest gap
// between any city and its nearest neighbour is the floor.
let widestGap = 0;
let widestPair = "";
cities.forEach((city) => {
  let nearest = Infinity;
  let other = null;
  cities.forEach((candidate) => {
    if (candidate === city) return;
    const distance = distanceInKm(
      cityCoordinates[city],
      cityCoordinates[candidate],
    );
    if (distance < nearest) {
      nearest = distance;
      other = candidate;
    }
  });
  if (nearest > widestGap) {
    widestGap = nearest;
    widestPair = `${city} → ${other}`;
  }
});
if (MAX_CITY_GUESS_KM < widestGap) {
  fail(
    `radius ${MAX_CITY_GUESS_KM} km is under the widest gap between cities ` +
      `(${Math.round(widestGap)} km, ${widestPair}) — real fixes would be refused`,
  );
}

if (failures.length) {
  failures.forEach((line) => console.error(line));
  console.error(`\n${failures.length} problem(s)`);
  process.exit(1);
}
console.log(
  `clean: ${cities.length} cities resolve to themselves, ${OUT_OF_RANGE.length} bad fixes refused, ` +
    `radius ${MAX_CITY_GUESS_KM} km vs widest gap ${Math.round(widestGap)} km (${widestPair})`,
);
