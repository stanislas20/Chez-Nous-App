// The pharmacy sync's blindness detector, checked against dates.
//
// "No new post since last check" is the correct message for a quiet week and
// the only message for a sync that has stopped seeing the source at all. The
// guard this exercises is what separates them — and because it decides
// whether anyone is told, getting its thresholds wrong is either a silent
// failure or an alert nobody reads.
//
// Run: node scripts/check-roster-staleness.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "functions/pharmacyRosterSync.js"),
  "utf8",
);

// Lift just the pure function and its constants out of a module that would
// otherwise pull in firebase-admin, cheerio and the network.
const start = source.indexOf("const DUTY_GRACE_DAYS");
const end = source.indexOf("// Separate from notifyFailure");
if (start === -1 || end === -1) {
  console.error("could not locate rosterStaleness in pharmacyRosterSync.js");
  process.exit(1);
}
const context = {};
vm.createContext(context);
vm.runInContext(
  source.slice(start, end) +
    "\nthis.rosterStaleness = rosterStaleness;" +
    "\nthis.DUTY_GRACE_DAYS = DUTY_GRACE_DAYS;" +
    "\nthis.NO_DATE_STALE_DAYS = NO_DATE_STALE_DAYS;",
  context,
);
const { rosterStaleness, DUTY_GRACE_DAYS, NO_DATE_STALE_DAYS } = context;

const failures = [];
const NOW = new Date("2026-08-24T08:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
const daysAhead = (n) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);
// Firestore Timestamps expose toDate(); the real documents carry those, so
// the fixtures must too or this would pass on a shape the function never sees.
const stamp = (date) => ({ toDate: () => date });

const expect = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label}: expected ${expected}, got ${actual}`);
  }
};
const reasonOf = (state) => rosterStaleness(state, NOW)?.reason ?? "fresh";

// --- a roster still inside its duty period is not stale, at any age
expect(
  "duty runs until next week",
  reasonOf({ lastDutyUntil: stamp(daysAhead(5)) }),
  "fresh",
);
expect("duty ends today", reasonOf({ lastDutyUntil: stamp(NOW) }), "fresh");

// --- the grace window: a roster a day late is ONPB being ONPB
expect(
  "one day past duty",
  reasonOf({ lastDutyUntil: stamp(daysAgo(1)) }),
  "fresh",
);
expect(
  "exactly at the grace limit",
  reasonOf({ lastDutyUntil: stamp(daysAgo(DUTY_GRACE_DAYS)) }),
  "fresh",
);
expect(
  "one day past grace",
  reasonOf({ lastDutyUntil: stamp(daysAgo(DUTY_GRACE_DAYS + 1)) }),
  "dutyExpired",
);
expect(
  "a month past duty",
  reasonOf({ lastDutyUntil: stamp(daysAgo(30)) }),
  "dutyExpired",
);

// --- no readable date on the last roster: fall back to ingest age
const noDate = (days) => ({ lastProcessedAt: stamp(daysAgo(days)) });
expect("ingested yesterday", reasonOf(noDate(1)), "fresh");
expect("a skipped week", reasonOf(noDate(9)), "fresh");
expect("at the fallback limit", reasonOf(noDate(NO_DATE_STALE_DAYS)), "fresh");
expect(
  "past the fallback limit",
  reasonOf(noDate(NO_DATE_STALE_DAYS + 1)),
  "noNewRoster",
);

// --- the duty date wins over the ingest age when both are present, or a
// roster ingested today for a period that already ended would read as fresh
expect(
  "ingested today, duty long over",
  reasonOf({ lastDutyUntil: stamp(daysAgo(20)), lastProcessedAt: stamp(NOW) }),
  "dutyExpired",
);
expect(
  "ingested long ago, duty still running",
  reasonOf({
    lastDutyUntil: stamp(daysAhead(3)),
    lastProcessedAt: stamp(daysAgo(60)),
  }),
  "fresh",
);

// --- states that carry nothing must not raise a false alarm. A region that
// has never synced has no roster to be stale.
expect("no state at all", reasonOf(null), "fresh");
expect("empty state", reasonOf({}), "fresh");
expect(
  "url only, never processed",
  reasonOf({ lastProcessedPostUrl: "x" }),
  "fresh",
);
// Documents written before this field existed carry a null, not a Timestamp.
expect(
  "null duty, null processed",
  reasonOf({ lastDutyUntil: null, lastProcessedAt: null }),
  "fresh",
);
expect(
  "null duty falls through to ingest age",
  reasonOf({ lastDutyUntil: null, lastProcessedAt: stamp(daysAgo(40)) }),
  "noNewRoster",
);

// --- and the message a human reads has to name the number
const detail =
  rosterStaleness({ lastDutyUntil: stamp(daysAgo(10)) }, NOW)?.detail ?? "";
// Days past the duty date, not days past the grace window — the reader
// cares when the roster expired, not when our tolerance for it ran out.
if (!/\b10 day\(s\) ago\b/.test(detail)) {
  failures.push(`detail should count days past the duty date, got "${detail}"`);
}

if (failures.length) {
  failures.forEach((line) => console.error(line));
  console.error(`\n${failures.length} problem(s)`);
  process.exit(1);
}
console.log(
  `clean: 16 staleness cases — duty grace ${DUTY_GRACE_DAYS}d, ` +
    `no-date fallback ${NO_DATE_STALE_DAYS}d`,
);
