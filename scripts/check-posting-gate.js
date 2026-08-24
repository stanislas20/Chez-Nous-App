// The Bénin-only posting rule, checked in all four places it is written.
//
// The rule lives in the client (so it can explain itself), in a Cloud
// Function (which grants the claim), and in the Firestore rules (which
// enforce it). Three copies of one constant is how a gate comes to be shown
// in the app and not applied in the database, or the reverse — so this pins
// them together and fails the moment one is edited alone.
//
// Run: node scripts/check-posting-gate.js

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { parsePhoneNumberFromString } = require("libphonenumber-js");

const read = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

const failures = [];
const fail = (line) => failures.push(line);

// --- the constant, in each of its homes
const countriesSrc = read("src/data/countries.js");
const context = {};
vm.createContext(context);
vm.runInContext(
  countriesSrc.replace(/^export /gm, "") +
    "\nthis.countries = countries;\nthis.POSTING_DIAL = POSTING_DIAL;" +
    "\nthis.POSTING_COUNTRY = POSTING_COUNTRY;\nthis.findCountryByPhone = findCountryByPhone;",
  context,
);
const { countries, POSTING_DIAL, POSTING_COUNTRY } = context;

const functionsDial = read("functions/index.js").match(
  /const POSTING_DIAL = "([^"]+)"/,
);
if (!functionsDial) {
  fail("functions/index.js: no POSTING_DIAL constant");
} else if (functionsDial[1] !== POSTING_DIAL) {
  fail(
    `functions/index.js says ${functionsDial[1]}, src/data/countries.js says ${POSTING_DIAL}`,
  );
}

// The country the dial code belongs to must be the one named.
const home = countries.find((item) => item.code === POSTING_COUNTRY);
if (!home) fail(`POSTING_COUNTRY ${POSTING_COUNTRY} is not in the list`);
else if (home.dial !== POSTING_DIAL) {
  fail(`${POSTING_COUNTRY} dials ${home.dial}, not ${POSTING_DIAL}`);
}

// --- the rule that actually binds
const rules = read("firestore.rules");
const createBlock = rules.slice(
  rules.indexOf("match /listings/{listingId}"),
  rules.indexOf("allow update", rules.indexOf("match /listings/{listingId}")),
);
if (!/request\.auth\.token\.canPost == true/.test(createBlock)) {
  fail(
    "firestore.rules: listing create does not require the canPost claim — " +
      "the gate would exist only in the app",
  );
}
// Everything that publishes must carry the same gate. A new collection that
// accepts user content and forgets it is exactly the hole this file exists
// to catch.
["ads", "carParks", "jobApplications"].forEach((name) => {
  const start = rules.indexOf(`match /${name}/{`);
  if (start === -1) {
    fail(`firestore.rules: no ${name} block`);
    return;
  }
  const block = rules.slice(start, rules.indexOf("allow update", start));
  if (!/request\.auth\.token\.canPost == true/.test(block)) {
    fail(`firestore.rules: ${name} create does not require the canPost claim`);
  }
});

// And everything that is contact, safety or personal must NOT carry it.
// Somebody in Lagos has to be able to message a seller, report a fraud and
// save a listing — blocking those would not protect Bénin from anything.
["conversations", "messages", "reports", "favorites", "follows"].forEach(
  (name) => {
    const start = rules.indexOf(`match /${name}/{`);
    if (start === -1) return;
    const block = rules.slice(start, start + 700);
    if (/request\.auth\.token\.canPost/.test(block)) {
      fail(
        `firestore.rules: ${name} requires canPost — reading, contacting and ` +
          `reporting must stay open to the world`,
      );
    }
  },
);

// --- moderation is a claim, and a narrow one.
//
// The danger with a role that can change a listing is scope creep: the day
// it can also touch a price, "moderator" has quietly become "can edit
// anybody's listing". These pin the shape.
const modBlock = rules.slice(
  rules.indexOf("Moderation, from inside the app"),
  rules.indexOf("Lets anyone who can already read an approved listing"),
);
if (!/request\.auth\.token\.moderator == true/.test(modBlock)) {
  fail(
    "firestore.rules: moderation update does not require the moderator claim",
  );
}
if (!/request\.auth\.uid != resource\.data\.sellerId/.test(modBlock)) {
  fail("firestore.rules: a moderator can approve their own listing");
}
if (!/hasOnly\(\['status', 'approvedAt', 'moderationNote'\]\)/.test(modBlock)) {
  fail("firestore.rules: moderation is not limited to the status fields");
}

// Judging what you cannot open is a coin toss, so the read has to match the
// write. This is the pairing to check: a build that grants one without the
// other is worse than granting neither.
const readBlock = rules.slice(
  rules.indexOf("match /listings/{listingId}"),
  rules.indexOf("allow create", rules.indexOf("match /listings/{listingId}")),
);
if (!/request\.auth\.token\.moderator == true/.test(readBlock)) {
  fail("firestore.rules: a moderator can approve listings they cannot read");
}

// Reading must stay open, or the whole point of the app is lost.
if (!/allow read: if resource\.data\.status == 'approved'/.test(rules)) {
  fail("firestore.rules: approved listings are no longer world-readable");
}

// --- every account-creating path must record the verified number.
//
// This exists because one of them did not. Advertisers sign up through their
// own function, it was never given the claim call, and gating the ads
// collection therefore stopped every new advertiser from publishing the one
// thing their account is for — with nothing on screen to say why. A gate is
// only as complete as the number of doors it is fitted to.
const SIGNUP_PATHS = [
  ["src/auth/phoneAuth.js", "recordVerifiedNumber"],
  ["src/auth/advertiserAuth.js", "claimPostingRight"],
];
SIGNUP_PATHS.forEach(([file, call]) => {
  const src = read(file);
  if (!src.includes(call)) {
    fail(`${file}: creates accounts without recording the verified number`);
  }
  if (!/phoneIdToken/.test(src)) {
    fail(`${file}: no phoneIdToken threaded through sign-up`);
  }
});

// And each must refuse rather than half-succeed when the proof is missing.
SIGNUP_PATHS.forEach(([file]) => {
  if (!/signup\/missing-verification/.test(read(file))) {
    fail(`${file}: does not refuse a sign-up with no verification token`);
  }
});

// --- the client's own copy of the decision
const canPublishSrc = read("src/utils/canPublish.js");
if (!/startsWith\(POSTING_DIAL\)/.test(canPublishSrc)) {
  fail("canPublish.js no longer decides on POSTING_DIAL");
}

// --- and the decision itself, exercised
const ctx = {
  POSTING_DIAL,
  findCountryByCode: (code) =>
    countries.find((item) => item.code === code) ?? null,
  findCountryByPhone: context.findCountryByPhone,
  parsePhoneNumberFromString,
};
vm.createContext(ctx);
vm.runInContext(
  // Multi-line import statements too: a `^import .*$` strip left the
  // dangling `} from "../data/countries";` behind and the vm refused it.
  canPublishSrc
    .replace(/import[\s\S]*?from\s*["'][^"']+["'];\n/g, "")
    .replace(/^export /gm, "") +
    "\nthis.canPublish = canPublish;\nthis.accountCountry = accountCountry;" +
    "\nthis.publishBlockReason = publishBlockReason;",
  ctx,
);

const account = (digits) => ({ email: `${digits}@chez-nous.app` });

const MAY = [["2290197000001", "Bénin mobile"]];
const MAY_NOT = [
  ["22890123456", "Togo"],
  ["22501234567", "Côte d’Ivoire"],
  ["22370123456", "Mali"],
  ["221701234567", "Sénégal"],
  ["33612345678", "France"],
  ["2348012345678", "Nigeria"],
  ["12125551234", "United States"],
];

MAY.forEach(([digits, label]) => {
  if (!ctx.canPublish(account(digits))) fail(`${label} should be able to post`);
});
MAY_NOT.forEach(([digits, label]) => {
  if (ctx.canPublish(account(digits)))
    fail(`${label} must not be able to post`);
});

// A number that only looks Béninese must not slip through on a prefix: +2290
// is Bénin, but +22 90… is not a thing and +229 is not a prefix of +2290000
// by accident anywhere else.
[["2291", true]].forEach(([digits, expected]) => {
  if (ctx.canPublish(account(digits)) !== expected) {
    fail(`+${digits} decided wrongly`);
  }
});

// Signed out is a door, not a wall — the app must send them to sign-up
// rather than tell them their country is the problem.
if (ctx.publishBlockReason(null) !== "signedOut") {
  fail("a signed-out visitor should be offered an account, not a country rule");
}
if (ctx.publishBlockReason(account("2290197000001")) !== null) {
  fail("a Bénin account should have no block reason");
}
if (ctx.publishBlockReason(account("33612345678")) !== "country") {
  fail("a foreign account should be blocked for its country");
}

// --- the country the app names for a number, which people read
const NAMED = [
  ["12125551234", "US"],
  ["2290197000001", "BJ"],
  ["33612345678", "FR"],
];
NAMED.forEach(([digits, code]) => {
  const found = ctx.accountCountry(account(digits));
  if (found?.code !== code) {
    fail(`+${digits} named as ${found?.code ?? "nothing"}, expected ${code}`);
  }
});

// --- and the picker's own integrity
const seenCodes = new Set();
countries.forEach((item) => {
  if (seenCodes.has(item.code)) fail(`duplicate country code ${item.code}`);
  seenCodes.add(item.code);
  if (!/^\+\d+$/.test(item.dial)) fail(`${item.code}: bad dial ${item.dial}`);
  if (!item.nameEn || !item.nameFr) fail(`${item.code}: missing a name`);
  if (!item.flag) fail(`${item.code}: missing a flag`);
});

if (failures.length) {
  failures.forEach((line) => console.error(line));
  console.error(`\n${failures.length} problem(s)`);
  process.exit(1);
}
console.log(
  `clean: ${countries.length} countries may sign up, only ${POSTING_DIAL} may post; ` +
    `client, function and Firestore rules agree (${MAY.length + MAY_NOT.length} accounts tested)`,
);
