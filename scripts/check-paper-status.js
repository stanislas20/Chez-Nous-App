// Guards the only arithmetic on the Papiers screen.
//
// The screen has no providers and no prices, so nothing here can be wrong
// about the world — but it can be wrong about a date, and a date is what the
// reader is trusting. Telling somebody their insurance is valid on the day it
// lapsed is the failure that matters, and it lives entirely at the
// boundaries: the day of expiry, and the edge of the warning window.
//
// Run: node scripts/check-paper-status.js
const babel = require("@babel/core");
const vm = require("vm");
const path = require("path");

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
  paperKinds,
  paperStatus,
  sortPapers,
  countNeedingAttention,
  EXPIRY_WARNING_DAYS,
} = loadEsm("src/data/vehiclePapers.js");

const failures = [];
const check = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label} — got ${actual}, expected ${expected}`);
  }
};

const TODAY = new Date(2026, 7, 25); // 25 August 2026, local midnight
const plusDays = (n) => new Date(2026, 7, 25 + n).toISOString();

const renewable = paperKinds.find((k) => k.renewable);
const permanent = paperKinds.find((k) => !k.renewable);
const stateOn = (offset) =>
  paperStatus(renewable, plusDays(offset), TODAY).state;

// ── The two boundaries ──────────────────────────────────────────────────
// A document that expires today is still valid today. Off-by-one here reads
// as "expired" to somebody whose paper is good until midnight.
check("expires today is not expired", stateOn(0), "soon");
check("expired yesterday", stateOn(-1), "expired");
check("expired long ago", stateOn(-400), "expired");

// The warning window is inclusive at its far edge and silent one day beyond.
check(
  `${EXPIRY_WARNING_DAYS} days out still warns`,
  stateOn(EXPIRY_WARNING_DAYS),
  "soon",
);
check(
  `${EXPIRY_WARNING_DAYS + 1} days out is quiet`,
  stateOn(EXPIRY_WARNING_DAYS + 1),
  "valid",
);
check("a year out is quiet", stateOn(365), "valid");

// ── The counts the days report ──────────────────────────────────────────
check("days remaining", paperStatus(renewable, plusDays(30), TODAY).days, 30);
check("days overdue", paperStatus(renewable, plusDays(-12), TODAY).days, -12);

// ── Nothing entered is never mistaken for good news ─────────────────────
check(
  "no date is unknown",
  paperStatus(renewable, null, TODAY).state,
  "unknown",
);
check(
  "no date has no day count",
  paperStatus(renewable, null, TODAY).days,
  null,
);

// ── A carte grise has no deadline to invent ─────────────────────────────
check("held", paperStatus(permanent, true, TODAY).state, "held");
check("not held", paperStatus(permanent, null, TODAY).state, "missing");
check(
  "permanent papers never count days",
  paperStatus(permanent, true, TODAY).days,
  null,
);

// ── Order: what needs doing comes first ─────────────────────────────────
const entries = [
  { key: "valid", status: paperStatus(renewable, plusDays(300), TODAY) },
  { key: "expired", status: paperStatus(renewable, plusDays(-3), TODAY) },
  { key: "unknown", status: paperStatus(renewable, null, TODAY) },
  { key: "soonLater", status: paperStatus(renewable, plusDays(40), TODAY) },
  { key: "soonSooner", status: paperStatus(renewable, plusDays(5), TODAY) },
];
const order = sortPapers(entries).map((e) => e.key);
check(
  "expired first, then nearest expiry, then the rest",
  order.join(","),
  "expired,soonSooner,soonLater,unknown,valid",
);

// The headline count must mean "needs doing" and nothing else — an unknown
// date is not a problem the reader has, it is one the app has.
check("count of things to deal with", countNeedingAttention(entries), 3);

// ── Every kind must be renderable ───────────────────────────────────────
paperKinds.forEach((kind) => {
  check(
    `${kind.key} has both labels`,
    Boolean(kind.labelEn && kind.labelFr),
    true,
  );
  check(`${kind.key} has an icon`, Boolean(kind.icon), true);
});

// ── The reminder that now sits behind the switch ────────────────────────
//
// The screen promises a notification 30, 7 and 1 day before each date. That
// promise is kept by functions/paperReminders.js, which holds its own copy
// of the paper labels because a Cloud Function cannot import the app's ES
// modules. A duplicated table is only safe while something checks it, so
// this is that something: add a renewable paper to the screen without adding
// it to the function and the reminder silently never fires for it, which is
// the worst possible failure for a feature whose entire job is to fire.
const reminders = require("../functions/paperReminders").internals;

const renewableKeys = paperKinds
  .filter((kind) => kind.renewable)
  .map((kind) => kind.key)
  .sort()
  .join(",");
check(
  "the function knows every renewable paper",
  Object.keys(reminders.PAPER_LABELS).sort().join(","),
  renewableKeys,
);
Object.entries(reminders.PAPER_LABELS).forEach(([key, label]) => {
  check(
    `${key} reminder has both languages`,
    Boolean(label.fr && label.en),
    true,
  );
});

// The leads the screen's copy names. If these diverge, the app is promising
// notifications on days nothing is sent.
check("leads promised on screen", reminders.LEAD_DAYS.join(","), "30,7,1,0");

// The day itself must be in the list. A reminder system that counts down
// and then says nothing on the morning the cover lapses has gone quiet at
// the only moment it was built for.
check("the expiry day itself warns", reminders.LEAD_DAYS.includes(0), true);

// And nothing after it. Reminders about a date that has passed are a
// reproach, and they are how somebody learns to ignore the app.
check(
  "nothing is sent after expiry",
  reminders.LEAD_DAYS.some((day) => day < 0),
  false,
);
check(
  "today reads as today, not 'in 0 days'",
  reminders.buildMessage("insurance", 0, "2026-08-25", "en").title,
  "Your insurance expires today",
);
check(
  "et en français",
  reminders.buildMessage("insurance", 0, "2026-08-25", "fr").title,
  "Votre assurance expire aujourd’hui",
);

// ── Calendar dates, not instants ────────────────────────────────────────
//
// The client sends "2026-08-26", not an ISO instant, precisely so that this
// arithmetic cannot drift by a day depending on where the phone was. These
// tests run on a laptop in America/Chicago and must give the same answers as
// a server in Bénin, which is the property being checked: the only timezone
// that appears anywhere below is Bénin's own, for "today".
const at = (y, m, d, h, min) => new Date(Date.UTC(y, m - 1, d, h, min));

// 06:30 UTC is 07:30 in Bénin — the same calendar day either way.
check("tomorrow", reminders.daysUntil("2026-08-26", at(2026, 8, 25, 6, 30)), 1);
// 23:30 UTC is already the 26th in Bénin, so "tomorrow" is now today.
check(
  "late enough that Bénin has turned the page",
  reminders.daysUntil("2026-08-26", at(2026, 8, 25, 23, 30)),
  0,
);
// ...and 22:30 UTC has not: still the 25th locally, so still one day out.
check(
  "an hour earlier, Bénin has not",
  reminders.daysUntil("2026-08-26", at(2026, 8, 25, 22, 30)),
  1,
);
check(
  "today is zero, not minus one",
  reminders.daysUntil("2026-08-25", at(2026, 8, 25, 6, 30)),
  0,
);
check(
  "thirty days out",
  reminders.daysUntil("2026-09-24", at(2026, 8, 25, 6, 30)),
  30,
);
check(
  "a date already gone",
  reminders.daysUntil("2026-08-20", at(2026, 8, 25, 6, 30)),
  -5,
);
check(
  "across a year boundary",
  reminders.daysUntil("2027-01-01", at(2026, 12, 25, 6, 30)),
  7,
);

// Date's own parser accepts a startling amount of rubbish and returns a
// plausible instant for it. A reminder fired off a misread date is worse
// than no reminder, so anything that is not a plain calendar date is
// refused outright rather than coerced.
[
  "bananas",
  "",
  null,
  undefined,
  "2026-13-01",
  "2026-02-31",
  "26/08/2026",
  "2026-08-26T00:00:00.000Z",
  1756166400000,
].forEach((value) =>
  check(`refuses ${JSON.stringify(value)}`, reminders.parseDay(value), null),
);
check("accepts a plain date", reminders.parseDay("2026-08-26") !== null, true);
check(
  "accepts 29 February in a leap year",
  reminders.parseDay("2028-02-29") !== null,
  true,
);
check("refuses 29 February otherwise", reminders.parseDay("2027-02-29"), null);

// The date in the message is the date the reader typed, written the way the
// forms write it. Off-by-one here contradicts the screen they are looking at.
check(
  "date is written dd/mm/yyyy",
  reminders.formatDate("2026-08-26"),
  "26/08/2026",
);
check("new year's day", reminders.formatDate("2027-01-01"), "01/01/2027");

// ── What the message may claim ──────────────────────────────────────────
//
// We hold a date somebody typed, not their insurance certificate. Every
// message has to point back at the date as the thing we know, so that a
// reader who renewed last week reads it as "your record is stale" rather
// than "you are uninsured".
["fr", "en"].forEach((language) => {
  const message = reminders.buildMessage(
    "insurance",
    7,
    "2026-09-01",
    language,
  );
  check(`${language}: message exists`, Boolean(message), true);
  check(`${language}: names the day count`, message.title.includes("7"), true);
  check(
    `${language}: points at the recorded date`,
    message.body.includes("01/09/2026"),
    true,
  );
});
check(
  "one day out says tomorrow, not 'in 1 days'",
  reminders.buildMessage("insurance", 1, "2026-08-26", "en").title,
  "Your insurance expires tomorrow",
);
check(
  "no message for a paper we do not track",
  reminders.buildMessage("carte-bleue", 7, "2026-09-01", "fr"),
  null,
);

// One send per lead per expiry date, keyed so that correcting a date re-arms
// the leads that have not passed.
check("send key shape", reminders.sentKey("insurance", 30), "insurance_30");
check(
  "send key has no dot",
  reminders.sentKey("insurance", 30).includes("."),
  false,
);

// ── The official links on "Où aller" ────────────────────────────────────
//
// These point at government portals, and each was checked against both the
// procedure title and its delivering agency before being written down. What
// a test can still hold is the shape: https only, no hand-typed link that
// slipped in without its label, and no link on a row that has no official
// site to point at.
const { paperPlaces } = loadEsm("src/data/vehiclePapers.js");

paperPlaces.forEach((place) => {
  check(`${place.key} has a map query`, Boolean(place.query), true);
  if (!place.site) {
    // No site is a valid answer and must stay a deliberate one: labels
    // without a URL would render an empty row that goes nowhere.
    check(`${place.key} has no orphan label`, Boolean(place.siteEn), false);
    return;
  }
  // http:// on a government form is somewhere to lose an identity document.
  check(`${place.key} site is https`, place.site.startsWith("https://"), true);
  check(
    `${place.key} site is labelled in both languages`,
    Boolean(place.siteEn && place.siteFr),
    true,
  );
  // A link the reader cannot place is a link they should not follow — the
  // label has to name who is on the other end.
  check(
    `${place.key} label names the body`,
    /CNSR|ANaTT|GUCE/.test(place.siteEn) &&
      /CNSR|ANaTT|GUCE/.test(place.siteFr),
    true,
  );
});

// Insurance is the row that must NOT gain a link: the agencies are private
// and numerous, so any single one is an advert wearing an official coat.
check(
  "insurance has no official site",
  paperPlaces.find((place) => place.key === "insurance").site,
  null,
);

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
const linked = paperPlaces.filter((place) => place.site).length;
console.log(
  `clean: paper status — ${paperKinds.length} kinds, boundaries at 0 and ` +
    `${EXPIRY_WARNING_DAYS} days, reminders at ${reminders.LEAD_DAYS.join("/")}, ` +
    `${linked}/${paperPlaces.length} places carry an official link`,
);
