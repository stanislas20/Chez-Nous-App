// Camions & utilitaires: what the screen is allowed to claim.
//
// A design draft for this vertical arrived with named hauliers, star ratings
// and per-trip prices — "Calavi Express, 4,5 ★, 28 000 FCFA". None of those
// companies exist and none of those prices were quoted by anyone. That draft
// is the reason this file exists: the screen sits between somebody and a
// stranger who is about to drive away with their goods, and the only things
// it may state as fact are ANaTT's, verbatim and dated.
//
// So this asserts two different kinds of thing. That every factual claim
// traces to the agency — the fee amounts, the validity, the licence rules.
// And that the tempting inventions stay out: a tonnage threshold ANaTT does
// not publish, a payload no listing declares, a rating nobody gave.
//
// Run: node scripts/check-trucks.js
const babel = require("@babel/core");
const vm = require("vm");
const path = require("path");
const fs = require("fs");

function loadEsm(relative) {
  const shim = { exports: {} };
  vm.runInNewContext(
    babel.transformFileSync(path.join(__dirname, "..", relative), {
      presets: [["@babel/preset-env", { targets: { node: "current" } }]],
      babelrc: false,
      configFile: false,
    }).code,
    { module: shim, exports: shim.exports, require: () => ({}), console },
  );
  return shim.exports;
}

const {
  ANATT_AUTHORISATION_URL,
  ANATT_LICENCE_URL,
  ANATT_SYGFR_URL,
  ANATT_TRANSPORT_CARD_URL,
  authorisationConditions,
  bodiesForLoad,
  goodsBodyTypes,
  goodsLicence,
  isGoodsVehicle,
  isHaulierListing,
  loadSizes,
  transportCard,
  truckModes,
  trucksReviewedOn,
} = loadEsm("src/data/truckTransport.js");
const { vehicleBodyTypes } = loadEsm("src/data/vehicles.js");

const read = (relative) =>
  fs.readFileSync(path.join(__dirname, "..", relative), "utf8");
const screen = read("src/screens/TrucksScreen.js");
const hook = read("src/hooks/useTrucks.js");
const data = read("src/data/truckTransport.js");
const tiles = read("src/data/carServiceCategories.js");

const failures = [];
const check = (label, actual, expected) => {
  if (actual !== expected) failures.push(`${label} — got ${actual}, expected ${expected}`);
};

// ── Every link is ANaTT's own ──────────────────────────────────────────
//
// These are the addresses a reader taps to check the app's homework. One
// pointing at a lookalike is worse than no link at all.
const ANATT_HOST = /^https:\/\/([a-z0-9-]+\.)*anatt\.bj\//;
[
  ["transport card", ANATT_TRANSPORT_CARD_URL],
  ["authorisations", ANATT_AUTHORISATION_URL],
  ["licence", ANATT_LICENCE_URL],
  ["sygfr", ANATT_SYGFR_URL + "/"],
].forEach(([name, url]) => {
  check(`${name} link is on anatt.bj (${url})`, ANATT_HOST.test(String(url)), true);
});

// ── Provenance ─────────────────────────────────────────────────────────
check(
  "the review date is a real date",
  /^\d{4}-\d{2}-\d{2}$/.test(String(trucksReviewedOn)),
  true,
);
check("not dated in the future", new Date(trucksReviewedOn) <= new Date(), true);
check(
  "and the screen prints it",
  /trucksLawNote", \{ date: reviewed \}/.test(screen),
  true,
);
check(
  "built from parts, not new Date(string)",
  /trucksReviewedOn\.split\("-"\)\.map\(Number\)/.test(screen),
  true,
);

// ── The fees are ANaTT's, itemised, never summed ───────────────────────
//
// Exactly as the e-service page publishes them. A total is refused on
// purpose: it depends on the country count and on urgency, so any single
// figure is wrong for most readers and right for nobody in particular.
const FEES = { anatt: 3000, national: 1000, international: 1000, urgent: 2000 };
Object.entries(FEES).forEach(([key, amount]) => {
  const fee = transportCard.fees.find((f) => f.key === key);
  check(`fee "${key}" is present`, Boolean(fee), true);
  if (fee) check(`fee "${key}" matches ANaTT`, fee.amount, amount);
});
check("the card is valid one year", transportCard.validityMonths, 12);
check("processing time is ANaTT's", transportCard.processingHours, 48);
check(
  "no total is computed anywhere",
  /reduce\(|totalFee|feeTotal/.test(data + screen),
  false,
);
check(
  "and the screen says why there is none",
  /trucksCardNote/.test(screen),
  true,
);

// ── The licence, and the tonnage that is not there ─────────────────────
check("goods licence is category C", goodsLicence.category, "C");
check("minimum age is 21", goodsLicence.minAge, 21);
check("category B is a prerequisite", goodsLicence.requiresB, true);
// ANaTT's page names the vehicles a category covers and states no weight.
// A "3,5 t" line would be a number this app invented and hung on the
// agency's name, which is the worst of both.
check(
  "no tonnage threshold is attributed to the agency",
  /\d\s*[,.]?\d*\s*(t\b|tonne|kg)/i.test(JSON.stringify(goodsLicence)),
  false,
);
check(
  "and the screen says the silence is theirs",
  /trucksNoTonnageNote/.test(screen),
  true,
);

// ── Conditions are quoted, not paraphrased into certainty ──────────────
const capacity = authorisationConditions.find((c) => c.key === "capacity");
check("the professional-capacity condition exists", Boolean(capacity), true);
// ANaTT hedges this one — "dans certains cas". Dropping the hedge turns a
// sometimes into an always and sends somebody to a counter expecting to be
// refused.
check(
  "and it keeps ANaTT's own hedge",
  /dans certains cas/.test(capacity?.fr ?? ""),
  true,
);
["status", "carteGrise", "visite", "insurance"].forEach((key) => {
  const item = authorisationConditions.find((c) => c.key === key);
  check(`condition "${key}" is present`, Boolean(item), true);
  check(
    `condition "${key}" is stated in both languages`,
    Boolean(item?.en && item?.fr),
    true,
  );
});

// ── The load chooser asks a question a listing can answer ──────────────
//
// The draft filtered on payload bands in tonnes. No listing carries a
// payload, so every band would have been a guess dressed as a filter. This
// asks what the load is and resolves it to body types the seller actually
// declared on the publish form.
const bodyKeys = vehicleBodyTypes.map((b) => b.key);
goodsBodyTypes.forEach((key) => {
  check(`"${key}" is a body type the form offers`, bodyKeys.includes(key), true);
});
loadSizes.forEach((size) => {
  check(`load "${size.key}" maps to at least one body`, size.bodies.length > 0, true);
  size.bodies.forEach((body) => {
    check(
      `load "${size.key}" maps to a real body type ("${body}")`,
      bodyKeys.includes(body),
      true,
    );
  });
  check(
    `load "${size.key}" states no weight`,
    /\d\s*[,.]?\d*\s*(t\b|tonne|kg)/i.test(`${size.labelFr} ${size.exampleFr}`),
    false,
  );
});
check("an unknown load falls back to every goods body", bodiesForLoad("nope").length, goodsBodyTypes.length);

// ── The matcher believes a declaration over a word ─────────────────────
check(
  "a declared haulier is one",
  isHaulierListing("", "haulier"),
  true,
);
// A garage that mentions déménagement in passing is still a garage. Any
// other declared trade is a positive statement that this is something else.
check(
  "another declared trade is not",
  isHaulierListing("nous faisons du déménagement", "garage"),
  false,
);
check(
  "an undeclared listing is read for words",
  isHaulierListing("transport de marchandises Cotonou", null),
  true,
);
check(
  "and an unrelated one is left alone",
  isHaulierListing("vente de pneus", null),
  false,
);
check("a truck is a goods vehicle", isGoodsVehicle({ bodyType: "truck" }), true);
// A saloon with a hopeful description is not. This is the text search the
// vertical exists to replace.
check("a saloon is not", isGoodsVehicle({ bodyType: "sedan" }), false);
check("and neither is one that declared nothing", isGoodsVehicle({}), false);

// ── Nothing invented on the cards ──────────────────────────────────────
check(
  "no rating anywhere on the screen",
  /rating|étoile|\bstar\b/i.test(screen),
  false,
);
check(
  "no invented price: the shared formatter decides",
  /listingPrice\(item, t, language\)/.test(screen),
  true,
);
check(
  "and a listing without one says so rather than showing 0",
  /trucksNoPrice/.test(screen),
  true,
);
// Sorting by rating would need ratings; sorting by price would put the
// cheapest truck first whether or not it can carry the load just described.
//
// Comments are stripped first. The hook explains at length why it sorts on
// neither, and the first version of this check read that explanation as the
// offence it was warning about.
const hookCode = hook.replace(/\/\/[^\n]*/g, "");
check(
  "the hook sorts by distance, not by price or rating",
  /byDistance/.test(hookCode) && !/\.price\b|rating/i.test(hookCode),
  true,
);

// ── The three errands ──────────────────────────────────────────────────
check("there are three modes", truckModes.length, 3);
["buy", "rent", "haul"].forEach((key) => {
  check(`mode "${key}" exists`, truckModes.some((m) => m.key === key), true);
  check(`mode "${key}" has a title`, /trucksTitle_/.test(screen), true);
});
// Hauling is a Service like every other trade; buying and hiring are
// ordinary vehicle listings. Publishing must land in the right one.
check(
  "hauliers publish as a service with a declared trade",
  /categoryKey: "services",\s*\n\s*trade: "haulier"/.test(screen),
  true,
);
check(
  "vehicles publish as vehicles",
  /categoryKey: "vehicles"/.test(screen),
  true,
);

// ── And the tile goes to the screen, not to a search ───────────────────
check(
  "the trucks tile routes to the vertical",
  /key: "trucks",[^}]*route: "Trucks"/.test(tiles),
  true,
);
check(
  "and no longer runs a text search",
  /key: "trucks",[^}]*query:/.test(tiles),
  false,
);

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: trucks — ${truckModes.length} modes, ${loadSizes.length} load sizes ` +
    `over ${goodsBodyTypes.length} declared bodies, ${authorisationConditions.length} ` +
    `ANaTT conditions and ${transportCard.fees.length} itemised fees read ` +
    `${trucksReviewedOn}, no tonnage and no ratings invented`,
);
