// The Vérifié badge is granted, never asserted.
//
// It is the one claim in this app that means a person checked an RCCM and an
// IFU against Bénin's national registry, and it travels denormalised on each
// listing because a buyer cannot read sellers/{uid} — that rule is what
// keeps the RCCM, the IFU and the representative's ID off the wire.
//
// The cost of that denormalisation was the hole: the field went into the
// document the phone wrote, and no rule looked at it. Anybody with the
// Firestore SDK could publish wearing the badge, and ModerationScreen files
// sellerVerified under PLUMBING, so the moderator approving the listing was
// never shown the claim being made.
//
// Three things now have to stay true together, and each of them fails
// silently on its own:
//
//   the rules refuse a create that carries it, and freeze it on update;
//   the two screens that create listings send false rather than a value
//     read from the seller's own profile — send the old value and every
//     publish by a verified company is refused, which is the one account
//     type the badge exists for;
//   and something server-side still grants it, or closing the hole quietly
//     unverifies every company that earned it.
//
// scripts/rules-tests/rules.test.js proves the first from the outside. This
// checks the other two, which no rules test can see.
//
// Run: node scripts/check-verified-badge.js
const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const read = (rel) => stripComments(fs.readFileSync(path.join(root, rel), "utf8"));

const failures = [];

// 1. The two screens that write a listing document must not assert either
//    name of the badge. Every other `sellerVerified:` in src/ is a read —
//    a card rendering the badge off a listing it was handed — which is the
//    whole point of the field and is left alone.
const WRITERS = [
  "src/screens/CreateListingScreen.js",
  "src/screens/ParkInventoryScreen.js",
];
for (const rel of WRITERS) {
  const source = read(rel);
  for (const field of ["sellerVerified", "verified"]) {
    const assignments = [
      ...source.matchAll(new RegExp(`\\b${field}:\\s*([^,\\n]+)`, "g")),
    ];
    for (const [, value] of assignments) {
      if (value.trim() !== "false") {
        failures.push(
          `${rel} sets ${field} to \`${value.trim()}\`. A listing writer may ` +
            `only ever send false — firestore.rules refuses anything else, ` +
            `so this would refuse every publish by a verified company.`,
        );
      }
    }
  }
}

// 2. The rules refuse it on the way in and freeze it afterwards.
{
  const rules = read("firestore.rules");
  if (!/badgeUnclaimed\(request\.resource\.data\)/.test(rules)) {
    failures.push(
      "firestore.rules does not call badgeUnclaimed on listing create, so " +
        "the badge can be self-granted at publish",
    );
  }
  const frozen = rules.match(/hasAny\(\[([\s\S]*?)\]\)/g) ?? [];
  const freezesBadge = frozen.some(
    (block) => /'sellerVerified'/.test(block) && /'verified'/.test(block),
  );
  if (!freezesBadge) {
    failures.push(
      "firestore.rules does not freeze sellerVerified and verified on the " +
        "owner-update branch, so the badge can be switched on after approval",
    );
  }
}

// 3. Something server-side still grants it. Without this the rules above
//    are not a fix, they are a removal of the feature.
{
  const functions = read("functions/index.js");
  const grants = /sellerVerified:\s*true/.test(functions);
  if (!grants) {
    failures.push(
      "functions/index.js never sets sellerVerified: true, so no verified " +
        "company would ever get the badge on a new listing",
    );
  }
  // The grant has to be the same test the profile itself records.
  if (
    !/accountType === "company"[\s\S]{0,200}verificationStatus === "verified"/.test(
      functions,
    )
  ) {
    failures.push(
      "functions/index.js grants the badge without checking accountType and " +
        "verificationStatus together",
    );
  }
  // And the job-post copy has to move with it, or the hole simply relocates.
  if (!/categoryKey === "jobs"[\s\S]{0,120}verified = true/.test(functions)) {
    failures.push(
      "functions/index.js grants sellerVerified but not the `verified` copy " +
        "a job post carries, so job listings would lose the badge",
    );
  }
}

if (failures.length) {
  console.error("check-verified-badge: FAIL");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  "clean: the badge is refused from the client, frozen after approval, and " +
    "still granted server-side for both of its names",
);
