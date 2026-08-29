// Every property field a seller fills in has to be read back under the
// same name.
//
// This exists because of a split that survived a long time in silence. The
// publish form wrote `surfaceArea`; the Immobilier list and the property
// detail both read `listing.surface`, a key nothing has ever written. So a
// seller typed the surface, saw it accepted, and it appeared nowhere — not
// on the card, not on the detail, and not in the price-per-m² a land
// listing is judged on. Reported as "there is no option to specify the
// size", which is exactly what it looks like from the outside.
//
// Nothing failed. No screen crashed, no key was missing, the value sat in
// Firestore being correct and unread. Only a check that compares the two
// halves can see it, so: collect what the form writes for a property, and
// require that every property field a screen reads is one of them.
//
// Run: node scripts/check-real-estate-fields.js
const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const readCode = (rel) => stripComments(read(rel));

const form = read("src/screens/CreateListingScreen.js");
const readers = [
  "src/screens/RealEstateScreen.js",
  "src/screens/RealEstateDetailScreen.js",
];

const failures = [];

// What the form stores for a property, taken from the realEstate payload
// object rather than from a hand-kept list — a list would drift from the
// thing it describes, which is the whole bug being guarded against.
const payload = form.slice(
  form.indexOf("              realEstateDeal,"),
  form.indexOf("            }", form.indexOf("              realEstateDeal,")),
);
if (!payload || payload.length < 100) {
  console.error("FAIL could not locate the real-estate payload in the form");
  process.exit(1);
}
const written = new Set(
  [...payload.matchAll(/^\s*(\w+)[,:]/gm)].map((match) => match[1]),
);
// Fields every listing carries whatever its category, so they are never in
// the property-specific block.
[
  "id", "city", "price", "phone", "titleFr", "titleEn", "media",
  "descriptionFr", "descriptionEn", "categoryKey", "createdAt", "status",
  "sellerId", "sellerName", "isPromoted", "popular", "viewCount", "quartier",
  "latitude", "longitude", "whatsapp", "trade",
].forEach((key) => written.add(key));

if (written.size < 8) {
  console.error(`FAIL only ${written.size} written field(s) found — parse likely broke`);
  process.exit(1);
}

// Fields a screen reads defensively, each behind `??` or a truthiness
// check, for listing shapes that predate this form or come from elsewhere.
// Reading one costs nothing when it is absent; the bug this file exists for
// is a field read INSTEAD of the one that holds the value, not one read as
// well. Kept explicit so adding to it is a decision rather than a slip.
const OPTIONAL = new Set([
  "mediaUrl", // ?? media[0]?.mediaUrl
  "sellerPhone", // listing.phone ?? listing.sellerPhone
  "sellerVerified", // only ever coerced with !!
  "sellerMemberSince", // ?? null
]);

// Anything a property screen reads off a listing has to be something the
// form actually writes.
//
// Comments are stripped first. The note explaining this very bug names the
// wrong fields in prose, and the first run of this check duly reported them.
for (const rel of readers) {
  const source = readCode(rel);
  const seen = new Set();
  for (const match of source.matchAll(/\blisting\.(\w+)/g)) {
    const field = match[1];
    if (seen.has(field)) continue;
    seen.add(field);
    if (!written.has(field) && !OPTIONAL.has(field)) {
      failures.push(
        `${rel} reads listing.${field}, which the publish form never writes`,
      );
    }
  }
}

// And the one that started it, named directly so the message says what to
// do rather than only that something is wrong.
readers.forEach((rel) => {
  const code = readCode(rel);
  if (/listing\.surface\b/.test(code)) {
    failures.push(
      `${rel} still reads listing.surface — the form writes surfaceArea`,
    );
  }
});

// The quartier has to be answerable in every commune.
//
// Four of the sixty-one cities have curated quartiers. Gating the field on
// that list meant a seller in Bohicon could not say where the property was
// beyond the commune — reported as the picker not showing the quartiers for
// the chosen city, which is what it looks like when there are none. The
// names cannot simply be written out: this app's own quartier file says the
// list is unverified, and INStaD's roll is a scanned PDF.
{
  const code = stripComments(form);
  if (/\{getQuartiers\(selectedCity\)\.length \? \(/.test(code)) {
    failures.push(
      "CreateListingScreen gates the quartier field on the curated list — " +
        "sellers in the other 57 communes get no field at all",
    );
  }
  if (!/sellFieldQuartierPlaceholder/.test(code)) {
    failures.push(
      "CreateListingScreen has no free-text quartier input, so the list can " +
        "never grow beyond the four curated communes",
    );
  }
  const filter = read("src/screens/RealEstateScreen.js");
  if (!/quartiersFor\(city, listings\)/.test(filter)) {
    failures.push(
      "RealEstateScreen does not build its quartier filter from listings, " +
        "so what sellers type is never offered to buyers",
    );
  }
}

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: real-estate fields — ${readers.length} screens read only fields ` +
    `the form writes`,
);
