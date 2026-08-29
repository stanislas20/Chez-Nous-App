// Being featured has to cost something and has to end.
//
// It used to cost a tap. The dashboard's megaphone opened the publish form
// with isPromoted: true in the route params, the form wrote it onto the
// document, and nothing disagreed — firestore.rules never mentioned the
// field, so the check lived only in the app, where it stops only the people
// using the app. Any seller who could publish could feature every listing
// they owned, free, for ever, and the winner of the one slot was whoever
// happened to sort first.
//
// Three things hold it now, and each fails silently if it slips:
//
//   the rules refuse a client-written isPromoted, so the app is not the
//   only thing standing between a seller and the slot;
//   the form asks rather than grants;
//   and every screen reads isPromotionLive, not the raw flag, so a grant
//   nobody renews lapses instead of becoming permanent by neglect.
//
// The last one is the quiet one. Reading listing.isPromoted directly still
// compiles, still renders, and still looks right on the day it is written —
// it only goes wrong a month later, on somebody else's phone.
//
// Run: node scripts/check-promotion.js
const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");
const vm = require("vm");
const babel = require("@babel/core");

const root = path.join(__dirname, "..");
const raw = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
// Line comments first, then block comments — not the other way round.
// CreateListingScreen has "image/*" inside a // comment, and stripping
// blocks first treats that as an opening delimiter: the non-greedy match
// then runs to the next */ and eats 45KB of real source, including the
// lines this check is looking for. It reported them missing and was
// believed, because a check that says FAIL is assumed to have looked.
const read = (rel) => stripComments(raw(rel));

const failures = [];

// 1. The rules, which are the only half a seller cannot edit around.
{
  const rules = read("firestore.rules");
  // Scoped to the listings block. Several collections have an "allow
  // create: if request.auth != null" and a bare indexOf finds the ads one,
  // twenty lines earlier, which says nothing about listings.
  const listings = rules.slice(rules.indexOf("match /listings/{listingId}"));
  const create = listings.slice(
    listings.indexOf("allow create:"),
    listings.indexOf("allow update:"),
  );
  if (!/get\('isPromoted', false\) == false/.test(create)) {
    failures.push(
      "firestore.rules lets a client create a listing with isPromoted set — " +
        "a seller can feature themselves with the SDK, whatever the app shows",
    );
  }
  if (!/hasAny\(\[[^\]]*'isPromoted'/.test(rules)) {
    failures.push(
      "firestore.rules lets the seller's own update touch isPromoted — they " +
        "can promote an approved listing by editing it",
    );
  }
  if (!/duration\.value\(90, 'd'\)/.test(rules)) {
    failures.push(
      "firestore.rules no longer bounds promotedUntil — a grant can be " +
        "written for any date, which is the permanent placement again",
    );
  }
}

// 2. The form asks; it does not grant.
{
  const form = read("src/screens/CreateListingScreen.js");
  if (/isPromoted: !!isPromoted/.test(form)) {
    failures.push(
      "CreateListingScreen writes isPromoted from its route params again — " +
        "that is the self-service promotion this check exists for",
    );
  }
  if (!/promotionRequested: !!isPromoted/.test(form)) {
    failures.push(
      "CreateListingScreen no longer records promotionRequested, so a " +
        "seller who asks to be featured never reaches the moderator",
    );
  }
}

// 3. Every screen asks whether the promotion is still live.
{
  const dirs = ["src/screens", "src/components", "src/hooks"];
  // useRecentlyViewed and the moderation screen legitimately handle the raw
  // fields: one snapshots them into storage, the other writes them.
  const WRITERS = new Set([
    "useRecentlyViewed.js",
    "ModerationScreen.js",
    "CreateListingScreen.js",
  ]);
  for (const dir of dirs) {
    for (const file of fs.readdirSync(path.join(root, dir))) {
      if (!file.endsWith(".js") || WRITERS.has(file)) continue;
      const source = read(path.join(dir, file));
      const match = source.match(/\b(\w+)\.isPromoted\b/);
      if (match) {
        failures.push(
          `${dir}/${file} reads ${match[0]} directly — use isPromotionLive, ` +
            `or a promotion that ended keeps its badge for ever`,
        );
      }
    }
  }
}

// 4. And the logic itself, lifted out and run rather than read.
{
  const source = raw("src/data/promotion.js");
  const code = babel.transformSync(source, {
    presets: [["@babel/preset-env", { targets: { node: "current" } }]],
  }).code;
  const sandbox = { module: { exports: {} }, exports: {} };
  sandbox.module.exports = sandbox.exports;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  const { isPromotionLive, promotionExpiry, promotionDaysLeft } =
    sandbox.module.exports;

  const now = 1_700_000_000_000;
  const day = 86_400_000;
  const cases = [
    ["not promoted at all", { isPromoted: false }, false],
    // The one that matters most: every listing written before this change
    // looks exactly like this, and reading it as live would keep the free
    // permanent placements it is meant to end.
    ["promoted with no end date", { isPromoted: true }, false],
    [
      "promoted, expired yesterday",
      { isPromoted: true, promotedUntil: now - day },
      false,
    ],
    [
      "promoted, a week left",
      { isPromoted: true, promotedUntil: now + 7 * day },
      true,
    ],
    // Firestore hands back a Timestamp, and AsyncStorage hands back the
    // JSON of one. Both have to answer.
    [
      "a Firestore Timestamp",
      { isPromoted: true, promotedUntil: { toMillis: () => now + day } },
      true,
    ],
    [
      "a Timestamp through JSON.stringify",
      { isPromoted: true, promotedUntil: { seconds: (now + day) / 1000 } },
      true,
    ],
  ];
  for (const [label, listing, expected] of cases) {
    const actual = isPromotionLive(listing, now);
    if (actual !== expected) {
      failures.push(
        `isPromotionLive(${label}) returned ${actual}, expected ${expected}`,
      );
    }
  }

  if (promotionExpiry(30, now).getTime() !== now + 30 * day) {
    failures.push("promotionExpiry does not land 30 days out");
  }
  if (promotionExpiry(9999, now).getTime() !== now + 90 * day) {
    failures.push(
      "promotionExpiry no longer caps at PROMOTION_MAX_DAYS — the rules " +
        "would reject the write, and the moderator would see only a failure",
    );
  }
  if (promotionDaysLeft({ isPromoted: true, promotedUntil: now + 3 * day }, now) !== 3) {
    failures.push("promotionDaysLeft is wrong");
  }
}

if (failures.length) {
  failures.forEach((line) => console.error(`FAIL ${line}`));
  console.error(`\n${failures.length} failing`);
  process.exit(1);
}
console.log(
  "clean: promotion — moderator-granted, time-limited, and read through " +
    "isPromotionLive everywhere",
);
