// The festival calendar: recurrences, not dates, and every one sourced.
//
// This tier exists because the Events screen ships nothing until somebody
// posts it, and nobody is going to post a national holiday. That makes it
// app-supplied data about the real world, which is the kind this codebase
// is strictest about — the same rules the bank register and the hotel
// seeds follow.
//
// The trap here is specific: a festival date looks like a fact and is not.
// Vodun Days grew from the 10 January holiday into three days, Nonvitcha
// follows Pentecost, the Gaani follows the Muslim calendar and slides
// through the seasons, and FITHEB happens every OTHER year. An app that
// prints "10 janvier" against all of them is wrong about most of them, and
// wrong in a way that costs somebody a journey.
//
// Run: node scripts/check-festivals.js
const babel = require("@babel/core");
const vm = require("vm");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

function loadEsm(relative) {
  const shim = { exports: {} };
  const code = babel.transformFileSync(path.join(root, relative), {
    presets: [["@babel/preset-env", { targets: { node: "current" } }]],
    babelrc: false,
    configFile: false,
  }).code;
  const req = (spec) => {
    if (spec.endsWith(".json")) {
      return JSON.parse(read(path.join(path.dirname(relative), spec)));
    }
    return loadEsm(path.join(path.dirname(relative), `${spec}.js`));
  };
  vm.runInNewContext(code, {
    module: shim,
    exports: shim.exports,
    require: req,
    console,
    Intl,
  });
  return shim.exports;
}

const { beninFestivals, festivalPhoto } = loadEsm("src/data/beninFestivals.js");
const { cities } = loadEsm("src/data/cities.js");
const screen = read("src/screens/EventsScreen.js");
const failures = [];
const check = (label, ok) => {
  if (!ok) failures.push(label);
};

check("the calendar is not empty", beninFestivals.length >= 5);
check(
  "every key is unique",
  new Set(beninFestivals.map((f) => f.key)).size === beninFestivals.length,
);

beninFestivals.forEach((festival) => {
  check(`${festival.name} names a town`, Boolean(festival.city));
  // The town is handed to Hôtels, Tourisme and Restaurants so they open
  // on it. A name none of them knows does not error — it filters to
  // nothing, and an empty screen reads as "no hotels in Nikki" when it
  // means "no such town in our list".
  check(
    `${festival.name}'s town is one the other screens know (${festival.city})`,
    cities.includes(festival.city),
  );
  // Where it was read, and when. A calendar without a date on the reading
  // is a calendar nobody can age.
  check(`${festival.name} names its source`, /^https:\/\//.test(festival.source ?? ""));
  check(
    `${festival.name} records when the source was read`,
    /^\d{4}-\d{2}-\d{2}$/.test(festival.confirmedOn ?? ""),
  );
  check(
    `${festival.name} was not read in the future`,
    new Date(festival.confirmedOn) <= new Date(),
  );
  // Recurrence in words, in both languages.
  check(`${festival.name} says when it usually falls`, Boolean(festival.recurrenceFr));
  check(`${festival.name} says it in English too`, Boolean(festival.recurrenceEn));

  // No price. A festival that was free last year is not free by law.
  check(
    `${festival.name} claims no price`,
    !("price" in festival) && !("entry" in festival),
  );

  // And no date pretending to be next year's. An edition may be recorded
  // only as the one that was ANNOUNCED, which the screen labels as such.
  check(
    `${festival.name} states no bare date`,
    !("date" in festival) && !("startsOn" in festival),
  );
});

check(
  "the screen labels an edition as the last announced, not the next",
  /festivalsLastEdition/.test(screen),
);
check(
  "and warns that dates move",
  /festivalsIntro/.test(screen),
);

// ── Photographs are of the festival, freely licensed, credited ────────
//
// Not the official poster: that is the organiser's copyright, and
// re-hosting it is republishing work with no licence to do so.
const photographed = beninFestivals.filter((f) => festivalPhoto(f));
check("some festivals have a photograph", photographed.length > 0);
photographed.forEach((festival) => {
  const photo = festivalPhoto(festival);
  check(`${festival.name}'s photo names its licence`, Boolean(photo.licence));
  check(`${festival.name}'s photo names its author`, Boolean(photo.author));
  check(
    `${festival.name}'s photo says what it shows`,
    Boolean(photo.shows),
  );
  check(
    `${festival.name}'s photo is served from our own bucket`,
    String(photo.url).includes("firebasestorage"),
  );
});
check("the card shows the credit", /tourismPhotoCredit/.test(screen));
// The files are named in the fetcher rather than searched at run time.
check(
  "photographs are named, not searched",
  /const FILES = \{/.test(read("scripts/fetchFestivalPhotos.js")),
);

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: festivals — ${beninFestivals.length} sourced and dated by reading, ` +
    `${photographed.length} photographed under a free licence with the ` +
    `photographer named, recurrences in words and no invented date or price`,
);
