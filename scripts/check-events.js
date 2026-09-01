// Every event field the publish form writes has to be read back, and has to
// be cleared when the category changes away.
//
// Two failures this is here to catch, both silent.
//
// The first is the one check-real-estate-fields.js was written for: the form
// writes `eventPriceGate`, a screen reads `listing.gatePrice`, and the door
// price a poster typed appears nowhere. Nothing throws.
//
// The second is specific to this vertical and worse. An event is the only
// listing this app hides on its own — once its day has passed EventsScreen
// drops it. So a listing edited from Événements to Électronique keeps a date
// in the past, and if that field is not cleared the listing is filtered out
// of a screen it no longer belongs to by a rule that no longer applies. The
// seller sees an approved listing that is simply not anywhere.
//
// Run: node scripts/check-events.js
const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const readCode = (rel) => stripComments(read(rel));

const form = readCode("src/screens/CreateListingScreen.js");
const eventsData = readCode("src/data/events.js");
const readers = [
  "src/hooks/useEvents.js",
  "src/screens/EventsScreen.js",
  "src/data/events.js",
].map(readCode);

const failures = [];

// 1. The payload block. Anchored the same way the stay-car check is: the
// object literal is flat on purpose, because that is what makes it readable
// from here at all.
// The eight-space indent is the whole point of this anchor. The event
// block was first written one level deeper, inside the isRealEstate
// spread, where it would only ever have run for a property listing — an
// event would have published with no date and then been filtered out of
// its own screen forever. Matching only at payload level is what catches
// that, so do not relax the indent to \s+.
const payloadStart = form.indexOf("        ...(isCommunity ? { communityType } : {}),");
if (payloadStart === -1) {
  failures.push("could not find the listing payload in the publish form");
}
const payloadEnd =
  payloadStart === -1 ? -1 : form.slice(payloadStart).search(/^ {6}\};/m);
const payload =
  payloadStart === -1 || payloadEnd === -1
    ? form
    : form.slice(payloadStart - 4000, payloadStart + payloadEnd);

const writtenFields = [
  ...new Set(
    [...payload.matchAll(/^ {8}(event[A-Z]\w*)\s*:/gm)].map((m) => m[1]),
  ),
].sort();

if (writtenFields.length === 0) {
  failures.push(
    "the publish form writes no event* fields — did the payload move?",
  );
}

// 2. Everything written is read by something.
writtenFields.forEach((field) => {
  // eventDate is the typed text kept only so editing shows it back; the
  // screens read eventDateMs. It is written deliberately and read by the
  // form itself, so it is exempt from the reader requirement.
  if (field === "eventDate") return;
  const isRead = readers.some((code) => code.includes(field));
  if (!isRead) {
    failures.push(
      `the form writes ${field}, but no events screen or hook ever reads it`,
    );
  }
});

// 3. Everything written is cleared. EVENT_CLEARED is what a listing keeps
// when it stops being an event.
const clearedStart = eventsData.indexOf("EVENT_CLEARED = {");
if (clearedStart === -1) {
  failures.push("EVENT_CLEARED is missing from src/data/events.js");
} else {
  const clearedBlock = eventsData.slice(
    clearedStart,
    eventsData.indexOf("};", clearedStart),
  );
  writtenFields.forEach((field) => {
    if (!new RegExp(`\\b${field}\\s*:`).test(clearedBlock)) {
      failures.push(
        `${field} is written by the form but absent from EVENT_CLEARED — ` +
          `a listing moved out of Événements would keep it`,
      );
    }
  });
}

// 4. Events must have its own arm of the price-validation chain.
//
// That chain ends in a generic else which requires `price` — the goods
// field. The events form does not render `price`, so falling through meant
// publishing was refused with "enter a valid price" and no field on screen
// that could ever satisfy it. Somebody typing 5 000 into "Prix en avance"
// was told to enter a valid price, forever.
if (!/}\s*else if \(isEvents\)\s*{/.test(form)) {
  failures.push(
    "the price validation has no isEvents arm — an event falls through to " +
      "the goods branch and is refused for an empty field it never shows",
  );
}

// 5. The category has to exist, or the whole flow routes nowhere.
if (!readCode("src/data/categories.js").includes("key: 'events'")) {
  failures.push("there is no 'events' category — the publish flow has no home");
}

// 6. The date parser has to reject a day that does not exist. `new Date(2026,
// 1, 31)` is the 3rd of March: without the overflow guard an event entered
// as 31/02 silently moves itself and nobody finds out until the day.
const { parseEventDate, eventWindowsFor } = loadEvents();
if (parseEventDate("31/02/2026", "20h") !== null) {
  failures.push("parseEventDate accepts 31/02 — the overflow guard is gone");
}
if (parseEventDate("05/09/2026", "21h30") === null) {
  failures.push("parseEventDate rejects a valid date");
}
// A past event is in no window, which is what hides it.
const past = new Date(2020, 0, 1).getTime();
if (eventWindowsFor(past, Date.now()).length !== 0) {
  failures.push("eventWindowsFor still places a past event in a window");
}

// And every FUTURE event is in at least one, which is what shows it.
//
// This is the check that matters. useEvents drops any event whose window
// list is empty, so a gap in the windows is not a filtering quirk — it is a
// listing that was accepted, approved and then displayed nowhere, under any
// tab, with nothing the organiser could press to find it. The first version
// of this had exactly that gap at seven days out, which is where most
// events are announced.
const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;
[0, 1, 3, 6, 7, 8, 30, 200, 400].forEach((days) => {
  const when = now + days * DAY + 2 * 60 * 60 * 1000;
  if (eventWindowsFor(when, now).length === 0) {
    failures.push(
      `an event ${days} day(s) from now falls into no window — it would be ` +
        `published, approved and then shown on no tab at all`,
    );
  }
});

function loadEvents() {
  const babel = require("@babel/core");
  const vm = require("vm");
  const code = babel.transformFileSync(
    path.join(root, "src/data/events.js"),
    {
      presets: [["@babel/preset-env", { targets: { node: "current" } }]],
      babelrc: false,
      configFile: false,
    },
  ).code;
  const box = { module: { exports: {} }, exports: {} };
  box.module.exports = box.exports;
  vm.createContext(box);
  vm.runInContext(code, box);
  return box.module.exports;
}

if (failures.length) {
  console.error("check-events found problems:\n");
  failures.forEach((line) => console.error(`  - ${line}`));
  process.exit(1);
}

console.log(
  `clean: ${writtenFields.length} event field(s) written, read and cleared`,
);
