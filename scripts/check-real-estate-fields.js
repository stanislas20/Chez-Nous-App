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
  // Hotels are property listings: a room for the night is the shortStay
  // deal and a salle de fête is the commercial deal with the hall type.
  // The screen therefore reads the same document and is bound by the same
  // rule — it may not show a fact the form never asked for.
  "src/screens/HotelsScreen.js",
  "src/hooks/useHotels.js",
];

const failures = [];

// What the form stores for a property, taken from the realEstate payload
// object rather than from a hand-kept list — a list would drift from the
// thing it describes, which is the whole bug being guarded against.
// The end of the block is a line that is EXACTLY twelve spaces and a brace.
//
// This used to be an indexOf for the string "            }", which matches
// that substring inside any deeper indentation too — so the first nested
// object literal in the payload ended the slice early and every field below
// it read as "never written". Harmless-looking, and it reported four real
// fields as missing the day one was added.
const payloadStart = form.indexOf("              realEstateDeal,");
const payloadEnd = form.slice(payloadStart).search(/^ {12}\}/m);
const payload =
  payloadStart === -1 || payloadEnd === -1
    ? ""
    : form.slice(payloadStart, payloadStart + payloadEnd);
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
  // Written beside `media` for every listing whatever its category — the
  // cover's kind, denormalised so a card can draw from one document. It is
  // in this list rather than in OPTIONAL below because it is genuinely
  // written, not read defensively: a property screen asking whether its
  // cover is a video is asking a question the form answers.
  "mediaType",
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
  // Written by scripts/seedHotels.js, never by the form. A directory entry
  // is a rate the operator confirmed by telephone on a stated day, and the
  // card prints that day; a hotel that publishes its own listing states its
  // own rate and has no such date. Read behind a truthiness check, so its
  // absence on every ordinary listing costs nothing.
  "confirmedOn",
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

// ── Séjour + voiture, end to end ──────────────────────────────────────
//
// A property let together with a car. The Véhicules hub carried this tile
// pointing at a text search of Services for "séjour voiture", which could
// never match: the thing it describes is a property, Services holds trades,
// and no listing of any kind could declare a car came with it.
//
// It is whole now — the form asks, the browse screen filters, both the card
// and the detail carry a badge — and nothing was watching any of it. Every
// other tile rescued from a text search has a check saying so; this is the
// one that did not, and each of the five joints below fails silently rather
// than loudly if it comes apart.
{
  const tiles = read("src/data/carServiceCategories.js");
  const tile = tiles.match(/\{[^{}]*key: "stayCar"[^{}]*\}/s);
  if (!tile) {
    failures.push("the stayCar tile has gone from carServiceCategories.js");
  } else {
    if (!/route: "RealEstate"/.test(tile[0])) {
      failures.push("the stayCar tile no longer routes to Immobilier");
    }
    if (!/realEstateDeal: "shortStay"/.test(tile[0])) {
      failures.push(
        "the stayCar tile no longer opens the short-stay tab, so it lands on " +
          "long rentals and the errand it names is a tab away",
      );
    }
    if (!/withCar: true/.test(tile[0])) {
      failures.push(
        "the stayCar tile no longer turns the car filter on, so it opens " +
          "every short stay and the reader does the filtering",
      );
    }
    if (/query:/.test(tile[0])) {
      failures.push(
        "the stayCar tile runs a text search again — the search it replaced " +
          "could never match a property, because Services holds trades",
      );
    }
  }

  // Which deals can carry a car. A sale or a plot cannot, and offering the
  // box there would collect an answer to a question nobody asked.
  const data = readCode("src/data/realEstate.js");
  const option = data.match(/function realEstateHasCarOption[\s\S]{0,160}?\n\}/);
  if (!option) {
    failures.push("realEstateHasCarOption has gone");
  } else {
    for (const deal of ["rent", "shortStay"]) {
      if (!option[0].includes(`"${deal}"`)) {
        failures.push(
          `realEstateHasCarOption no longer covers ${deal}, so a real ` +
            `arrangement can no longer be declared`,
        );
      }
    }
  }

  // The form: gated by that function, and the note cleared when unticked —
  // a note left behind describes a car that is no longer on offer.
  const form = readCode("src/screens/CreateListingScreen.js");
  if (!/realEstateHasCarOption\(realEstateDeal\)/.test(form)) {
    failures.push(
      "the car checkbox is no longer gated on realEstateHasCarOption, so it " +
        "is offered on sales and plots",
    );
  }
  // All four car fields, each cleared when the box is unticked. A note or a
  // driver left behind describes a car that is no longer on offer.
  for (const field of [
    "withCarNote",
    "withCarTypes",
    "withCarDriver",
    "withCarCost",
  ]) {
    if (!new RegExp(`${field}: withCar \\? `).test(form)) {
      failures.push(
        `${field} is no longer conditional on withCar, so unticking the box ` +
          `leaves it in the document describing a car that is not on offer`,
      );
    }
  }

  // The browse screen: filters on it, and drops the filter when the deal
  // cannot carry a car. Without that reset the pill vanishes while the
  // filter stays on, and a tab silently shows nothing with no visible
  // control to explain why — the worst shape an empty list can take.
  const browse = readCode("src/screens/RealEstateScreen.js");
  if (!/withCarOnly && !item\.withCar/.test(browse)) {
    failures.push(
      "Immobilier no longer filters on withCar, so the tile's parameter is " +
        "accepted and ignored",
    );
  }
  if (!/if \(!realEstateHasCarOption\(key\)\) setWithCarOnly\(false\)/.test(browse)) {
    failures.push(
      "switching to a deal with no car option no longer clears the filter — " +
        "the pill disappears, the filter stays on, and the tab reads as empty",
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
