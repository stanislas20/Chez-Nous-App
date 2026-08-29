// A pharmacy cannot be on duty for longer than a rota.
//
// The form checked that dutyHours was a number greater than zero and nothing
// else. A one-year window went through: 24 pharmacies imported for the week
// of 2 August 2026 carried dutyUntil in August 2027, so they sat on the
// screen claiming to be open all night, every night, for three weeks — and
// would have gone on for another eleven months.
//
// That is the failure this whole screen has to avoid. Everything else in the
// app being wrong wastes somebody's time; this sends a person across a city
// at 2am, with a sick child, to a pharmacy that closed at six.
//
// It also hid the real problem. The roster looked "never updated" because
// those 24 never expired — the sync stopping was a separate fault underneath,
// invisible while stale rows kept the screen populated.
//
// Run: node scripts/check-duty-window.js
const fs = require("fs");
const path = require("path");

const read = (r) => fs.readFileSync(path.join(__dirname, "..", r), "utf8");
const form = read("src/screens/CreateListingScreen.js");

const failures = [];
const check = (label, actual, expected) => {
  if (actual !== expected) {
    failures.push(`${label} — got ${actual}, expected ${expected}`);
  }
};

// The cap exists and is a real number.
const declared = Number((form.match(/MAX_DUTY_HOURS = (\d+)/) ?? [])[1]);
check("the form declares a maximum duty window", Number.isFinite(declared), true);

// A tour de garde is a week. Ten days allows a roster published a couple of
// days early; a month would let one outlive the rota it came from.
check(`the cap covers a week (${declared}h)`, declared >= 168, true);
check(`but not a month (${declared}h)`, declared <= 336, true);

// And it is actually applied, not just declared.
check(
  "the cap is enforced when publishing",
  /numericDutyHours > MAX_DUTY_HOURS/.test(form),
  true,
);
check(
  "the lower bound is still there too",
  /numericDutyHours <= 0/.test(form),
  true,
);

// The message has to say the limit. "Please enter how many hours" leaves
// somebody typing 8760 with no idea why it is refused.
const strings = read("src/i18n/translations.js");
const messages = [...strings.matchAll(/errorInvalidDutyHours:\s*\n?\s*"([^"]*)"/g)].map(
  (m) => m[1],
);
check("both languages have the message", messages.length, 2);
messages.forEach((message) => {
  check(
    `the message names the limit: "${message.slice(0, 44)}…"`,
    message.includes(String(declared)),
    true,
  );
});

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  `clean: duty window — capped at ${declared}h, enforced on publish, and the ` +
    `refusal says why in both languages`,
);
