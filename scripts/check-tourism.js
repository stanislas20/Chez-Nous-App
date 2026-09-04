// The tourism directory: in the country, on the map, and credited.
//
// This list is fetched rather than written, which removes one class of
// mistake and adds another: whatever the source says arrives, including
// the things it is wrong about. Three of those actually happened.
//
//   - the Grande Muraille Verte is tagged country=Bénin and sits at 17°N
//     10°E, in the Sahara. A card 1,200 km into Niger.
//   - Wikidata's "located in" gave Ghana, Burkina Faso and the Région de
//     la Kara — which is in Togo — for the transboundary parks, and
//     nothing at all for nineteen sites.
//   - a first pass at type filtering returned 1,624 "sites", 1,500 of them
//     unnamed seasonal streams.
//
// None of those is an error anything reports. They are simply wrong rows
// in a list that looks fine.
//
// Run: node scripts/check-tourism.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const sites = JSON.parse(read("src/data/tourismSites.json"));
const screen = read("src/screens/TourismScreen.js");
const detail = read("src/screens/TourismDetailScreen.js");

const failures = [];
const check = (label, ok) => {
  if (!ok) failures.push(label);
};

check("the directory is not empty", sites.length > 50);

// ── Every one of them is in Bénin ──────────────────────────────────────
sites.forEach((site) => {
  const inside =
    site.latitude >= 6.1 &&
    site.latitude <= 12.5 &&
    site.longitude >= 0.7 &&
    site.longitude <= 3.9;
  check(
    `${site.name} is inside Bénin (${site.latitude}, ${site.longitude})`,
    inside,
  );
});
check(
  "the fetcher enforces it too, so a refetch cannot bring one back",
  /IN_BENIN/.test(read("scripts/fetchTourismSites.js")),
);

// ── Every one has what a card needs ────────────────────────────────────
sites.forEach((site) => {
  check(`${site.name} has a name`, Boolean(site.name));
  check(`${site.name} has coordinates`, typeof site.latitude === "number");
  check(`${site.name} has an id`, Boolean(site.id));
});
check(
  "no two sites share an id",
  new Set(sites.map((site) => site.id)).size === sites.length,
);

// ── A photograph carries its licence and its photographer ─────────────
//
// These are CC BY-SA and CC BY files. Showing one without crediting the
// person who took it is the one thing the licence does not allow, and it
// is invisible: the card looks finished.
const photos = sites.filter((site) => site.photo);
check("some sites have a photograph", photos.length > 20);
photos.forEach((site) => {
  check(`${site.name}'s photo names its licence`, Boolean(site.photo.licence));
  check(`${site.name}'s photo names its author`, Boolean(site.photo.author));
  check(
    `${site.name}'s photo is served from our own bucket`,
    site.photo.url.includes("firebasestorage"),
  );
});
check(
  "the card shows the credit",
  /tourismPhotoCredit/.test(screen) && /tourismPhotoCredit/.test(detail),
);

// Why the bucket and not Commons, so nobody "simplifies" it back.
check(
  "the reason for re-hosting is written down",
  /okhttp/.test(read("src/screens/TourismScreen.js")) ||
    /okhttp/.test(read("scripts/uploadTourismPhotos.js")),
);

// ── No price, no opening time ─────────────────────────────────────────
//
// The design document supplies both for every site and nothing sources
// them. A visitor who drives two hours on a number this app invented has
// been failed by the app.
sites.forEach((site) => {
  check(
    `${site.name} claims no entry price`,
    !("entry" in site) && !("price" in site),
  );
  check(`${site.name} claims no opening hours`, !("hours" in site));
});
check(
  "and the card says the tariff is not published",
  /tourismNoTariff/.test(screen),
);

// ── Phone numbers are the ten-digit form or absent ────────────────────
//
// Bénin renumbered in 2020 by prefixing 01, and every number published for
// these places is still the dead eight-digit form.
sites
  .filter((site) => site.phone)
  .forEach((site) => {
    site.phone.split("/").forEach((number) => {
      check(
        `${site.name}'s number is a current Bénin number (${number})`,
        /^01\d{8}$/.test(number),
      );
    });
  });
check(
  "and it is shown as unverified",
  /tourismPhoneUnverified/.test(detail),
);

// ── Nobody is sent to an encyclopedia ─────────────────────────────────
//
// The description comes from Wikipedia and is credited at the foot; that
// is attribution. A button labelled "read the article" is a destination,
// and a visitor deciding whether to drive wants the place's own site.
check(
  "no card links to Wikipedia",
  !/Linking\.openURL\(site\.article\)/.test(screen) &&
    !/Linking\.openURL\(site\.article\)/.test(detail),
);
check(
  "the source of the descriptions is credited",
  /tourismSourceNote/.test(screen),
);

if (failures.length) {
  failures.slice(0, 20).forEach((line) => console.error(`FAIL ${line}`));
  if (failures.length > 20) console.error(`… and ${failures.length - 20} more`);
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
const photographed = photos.length;
const withPhone = sites.filter((site) => site.phone).length;
console.log(
  `clean: tourism — ${sites.length} sites, all inside Bénin, ` +
    `${photographed} photographs credited and self-hosted, ${withPhone} with a ` +
    `current-format number, no invented price or opening time`,
);
