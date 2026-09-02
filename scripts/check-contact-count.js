// A tap on Appeler is the closest thing this app has to a result.
//
// Views were counted from early on; contacts were not counted anywhere. So
// a seller could see that eleven people opened the Corolla and had no way
// to learn whether any of them rang. Those two facts point at opposite
// actions — eleven views and no calls is a price or a photograph problem,
// three views and three calls means the listing is right and nobody is
// finding it — and only one of them was being recorded.
//
// The rule this check exists to hold: one helper, called from every route
// out of the app to a seller's phone. Twenty-two screens place calls. The
// moment the second one writes its own increment they drift, half the taps
// stop counting, and nothing anywhere says so — the number simply reads
// low, which is indistinguishable from a quiet week.
//
// WIRED is what has been done. It is a list rather than "every screen with
// tel:" on purpose: the rest are named in PENDING below so they are
// enumerated in code instead of remembered, and this check fails the day
// somebody wires one without moving it across.
//
// Run: node scripts/check-contact-count.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const failures = [];

const WIRED = [
  "src/screens/ProductDetailScreen.js",
  "src/screens/ServicesScreen.js",
  "src/screens/GaragesScreen.js",
  "src/screens/TyresScreen.js",
  "src/screens/BatteryScreen.js",
  "src/screens/PartsScreen.js",
  "src/screens/CarWashScreen.js",
  "src/screens/DriversScreen.js",
  "src/screens/AirconScreen.js",
  "src/screens/ElectricScreen.js",
  "src/screens/KeysScreen.js",
  "src/screens/InsuranceScreen.js",
  "src/screens/TrackingScreen.js",
  "src/screens/BodyworkScreen.js",
  "src/screens/BreakdownScreen.js",
  "src/screens/RealEstateDetailScreen.js",
  "src/screens/CategoryListingsScreen.js",
];

// Screens that contact a seller and do not count it yet. Every one is a
// listing's phone number, so every one is a lead nobody is counting.
// Two screens ring a number that belongs to no listing, so they are not
// pending — there is nothing there to count.
//
//   SellerProfileScreen — the seller's own number on their profile. A call
//   from there is not about any one listing, and crediting it to whichever
//   listing happened to be on screen would be an invention.
//   CarsScreen — a fixed help number in the screen's own data, not a
//   provider's.
//
// Anything else that reaches a seller's phone belongs in WIRED.
const PENDING = [];

for (const file of WIRED) {
  const source = read(file);
  if (!/countContact\(/.test(source)) {
    failures.push(`${file} is listed as wired but never calls countContact`);
  }
  // A screen that counts must not also hand-roll the increment.
  if (/contactCount: increment\(/.test(source)) {
    failures.push(
      `${file} increments contactCount itself instead of going through the ` +
        `helper — two writers is how half the taps stop counting`,
    );
  }
}

// The helper stays the only writer.
//
// Written as a plain recursion rather than a clever one: the first version
// used flatMap with a default parameter for the directory, and flatMap
// passes the index as its second argument, so every call after the first
// looked for a folder called "0".
const walk = (dir) =>
  fs
    .readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walk(path.join(dir, entry.name))
        : entry.name.endsWith(".js")
          ? [path.join(dir, entry.name)]
          : [],
    );

const writers = walk("src").filter((file) =>
  /contactCount: increment\(/.test(read(file)),
);
if (writers.length !== 1 || writers[0] !== path.join("src", "utils", "contactCount.js")) {
  failures.push(
    `contactCount is incremented in ${writers.join(", ") || "nowhere"} — it ` +
      `belongs only in src/utils/contactCount.js`,
  );
}

// A count that the rules refuse is a count that silently never happens.
const rules = read("firestore.rules");
if (!/hasOnly\(\['contactCount', 'contactCountToday', 'contactCountDate'\]\)/.test(rules)) {
  failures.push(
    "firestore.rules does not allow the contact counter to be written — " +
      "every tap would be denied, quietly, on the client",
  );
}
if (!/contactCount == resource\.data\.get\('contactCount', 0\) \+ 1/.test(rules)) {
  failures.push(
    "the contact rule does not pin the increment to exactly +1, so any " +
      "number could be written by anybody",
  );
}

// And the seller has to be able to see it, or it is a statistic for us.
if (!/contactCount/.test(read("src/screens/MyListingsScreen.js"))) {
  failures.push(
    "MyListingsScreen does not show the contact count — a number the seller " +
      "cannot see is telemetry, not insight",
  );
}

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: contact counting — one writer, ${WIRED.length} screen(s) wired, ` +
    `${PENDING.length} still to do, rule pins the increment to +1`,
);
