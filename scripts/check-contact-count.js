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

const walkSrc = (dir = "src") =>
  fs
    .readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walkSrc(path.join(dir, entry.name))
        : entry.name.endsWith(".js")
          ? [path.join(dir, entry.name)]
          : [],
    );
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
  // The shared Appeler button, and the four screens that were reaching a
  // seller's phone without counting it.
  "src/components/PhoneCallButtons.js",
  "src/screens/PharmacyDetailScreen.js",
  "src/screens/RealEstateScreen.js",
  "src/screens/RestaurantsScreen.js",
  "src/screens/ImportationScreen.js",
  "src/screens/HotelsScreen.js",
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

// Screens whose phone number belongs to nobody who could be credited for
// the call. Named here so that "not in WIRED" is a decision rather than an
// omission — the scan below fails on anything that is in neither list.
const NOT_A_LEAD = {
  "src/screens/SellerProfileScreen.js":
    "the seller's own number on their profile — not about any one listing, " +
    "and crediting whichever listing was last on screen would be an invention",
  "src/screens/CarsScreen.js":
    "a fixed help number in the screen's own data, not a provider's",
  "src/screens/ModerationScreen.js":
    "a moderator ringing a seller about their advert — that is us, not a buyer",
  "src/screens/JobApplicationsScreen.js":
    "an employer ringing a candidate. The opposite direction: counting it " +
    "would make a vacancy look popular because the person who posted it " +
    "made calls",
  "src/screens/ForYouScreen.js":
    "a pharmacy row in the duty rail, drawn from the directory rather than " +
    "from a listing somebody is selling",
  "src/screens/TourismDetailScreen.js":
    "a museum's own switchboard, published by the museum on Wikidata. " +
    "Nobody is selling anything and there is no listing to credit the tap " +
    "to — a contactCount here would be a number about a place that never " +
    "joined the marketplace",
};

// The scan the first version of this check was missing.
//
// WIRED was a hand-kept list, and a hand-kept list only says what somebody
// remembered to add. Four screens reached a seller's phone and counted
// nothing — and on the two biggest, ProductDetail and CategoryListings, it
// was the Appeler button that was silent while WhatsApp beside it counted,
// because Appeler is drawn by the shared PhoneCallButtons and WhatsApp is
// hand-rolled next to it. A seller reading those totals would conclude
// their buyers prefer WhatsApp, which was never true.
//
// So: every file that opens a tel: link or a wa.me link has to appear in
// one of the three lists above.
const REACHES_A_PHONE = /tel:\$\{|"tel:|'tel:|buildLinkUrl\(["']whatsapp/;
for (const file of walkSrc()) {
  if (!REACHES_A_PHONE.test(read(file))) continue;
  const known =
    WIRED.includes(file) || PENDING.includes(file) || file in NOT_A_LEAD;
  if (!known) {
    failures.push(
      `${file} opens a phone or WhatsApp link and is in none of WIRED, ` +
        `PENDING or NOT_A_LEAD — either count the tap or say in NOT_A_LEAD ` +
        `whose number it is`,
    );
  }
}

// The shared button is the one place a tap on Appeler can be seen: it owns
// the Android confirmation and the multi-number picker, so a caller cannot
// wrap its onPress without counting numbers nobody rang.
const shared = read("src/components/PhoneCallButtons.js");
if (!/countContact\(/.test(shared)) {
  failures.push(
    "PhoneCallButtons does not count — every Appeler it draws is invisible, " +
      "including the one on the product detail screen",
  );
}

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

// ── Phase E changed WHERE the counter is written, not whether ──────────
//
// The client no longer increments contactCount at all. It creates a
// counterMarkers document whose id is listingId_uid_kind_day — Firestore
// refuses the second create of the same id, which is the rate limit — and
// onCounterMarkerCreated applies the increment with the Admin SDK. Any client
// that still writes the field directly would now be denied by the rules, so
// finding one is a harder failure than it used to be, not a softer one.
const directWriters = walk("src").filter((file) =>
  /contactCount:\s*increment\(/.test(read(file)),
);
if (directWriters.length) {
  failures.push(
    `${directWriters.join(", ")} still increments contactCount directly. The ` +
      `rules refuse that now, so every tap would be silently denied. Use ` +
      `countEvent(listing, COUNTER_CONTACT).`,
  );
}

// One helper, still, for the same reason as before: twenty-two screens reach
// a seller's phone and the moment the second one records its own event they
// drift.
const markerWriters = walk("src").filter((file) =>
  /counterMarkers/.test(read(file)),
);
if (
  markerWriters.length !== 1 ||
  markerWriters[0] !== path.join("src", "utils", "countEvent.js")
) {
  failures.push(
    `counted events are written from ${markerWriters.join(", ") || "nowhere"} — ` +
      `they belong only in src/utils/countEvent.js`,
  );
}

// The two rules that keep the number honest, both learned the hard way on
// the view counter: a seller's own tap is not a lead, and a listing the app
// invented for a demonstration has nobody to call.
// contactCount.js now delegates, so the two honesty rules live one level
// down in the shared helper.
const helper = read("src/utils/countEvent.js");
if (!/COUNTER_CONTACT/.test(read("src/utils/contactCount.js"))) {
  failures.push("countContact no longer routes through countEvent");
}
if (!/currentUser\?\.uid/.test(helper)) {
  failures.push(
    "countContact does not skip the owner — a seller opening their own card " +
      "to check the phone number adds a call to their own total",
  );
}
if (!/isSample/.test(helper)) {
  failures.push("countContact does not skip sample listings");
}

// And the seller's landing screen shows it, not only the list behind it.
if (!/contactCount/.test(read("src/screens/SellerDashboardScreen.js"))) {
  failures.push(
    "the seller dashboard shows views without calls — half a sentence, and " +
      "the half that invites the wrong conclusion",
  );
}

// A count that the rules refuse is a count that silently never happens.
// These two assertions were inverted by Phase E, and the inversion is the
// point. They used to require that firestore.rules ALLOWED a client to write
// contactCount, +1 at a time — which it did, with great care about the
// increment and none at all about how many times it could happen. Any signed
// -in account could loop it.
//
// The rules must now refuse it outright, and the marker collection must exist
// to replace it.
const rules = read("firestore.rules");
if (/hasOnly\(\['contactCount', 'contactCountToday', 'contactCountDate'\]\)/.test(rules)) {
  failures.push(
    "firestore.rules still lets a client write the contact counter directly, " +
      "which is unlimited: +1 per write, with no limit on writes",
  );
}
if (!/match \/counterMarkers\//.test(rules)) {
  failures.push(
    "firestore.rules has no counterMarkers collection, so nothing records a " +
      "counted contact at all",
  );
}
if (!/markerId == request\.resource\.data\.listingId/.test(rules)) {
  failures.push(
    "the counterMarkers id is not pinned to listingId_uid_kind_day, so the " +
      "one-per-person-per-day limit is not enforced by the id",
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
    `${Object.keys(NOT_A_LEAD).length} that reach a phone belonging to nobody ` +
    `creditable, ${PENDING.length} still to do, rule pins the increment to +1`,
);
