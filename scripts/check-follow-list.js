#!/usr/bin/env node
//
// Followers and Following are lists of people, not numbers.
//
// The counts were doors already — both the seller's own dashboard and any
// seller's public profile route the taps to FollowList with the viewed
// profile's uid. What the screen behind them did not do was show anybody's
// face: it drew a letter in a coloured circle while sellerStats, the public
// projection that exists precisely to carry displayName and photoUrl, sat
// unread. It also read a flat hundred rows in one realtime listener.
//
// Three properties have to hold together, and each of them is one careless
// edit from being gone:
//
//   THE QUERY ASKS THE RIGHT DIRECTION. followers is sellerId == uid and
//   following is followerId == uid. They are one word apart and swapping
//   them produces a plausible-looking list of entirely the wrong people.
//
//   THE PAGE IS BOUNDED AND MOVES. 25 with a cursor, and a guard so
//   onEndReached — which FlatList fires more than once per scroll — cannot
//   start the same page twice.
//
//   THE FACES COME FROM THE PUBLIC PROJECTION. sellers/{uid} is readable
//   only by its owner, and that rule is what keeps RCCM, IFU and the
//   representative's ID off the wire. A followers list assembled from
//   profiles could not exist without relaxing it.
//
// The query and the name precedence are RUN here rather than read, because
// "the file mentions sellerId" stays true when it is used on the wrong side.
//
// Run: node scripts/check-follow-list.js
const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const failures = [];
const fail = (message) => failures.push(message);
const eq = (what, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    fail(`${what} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
};

const HOOK = "src/hooks/useFollowList.js";
const SCREEN = "src/screens/FollowListScreen.js";
const hook = read(HOOK);
const screen = read(SCREEN);

// ── 1-3. Both entry points still open the list for the VIEWED profile ─────
//
// Not the signed-in user. A visitor tapping "24 followers" on somebody
// else's profile must get that seller's twenty-four, which is the whole
// reason the uid is a route param rather than read from auth.
[
  ["src/screens/SellerDashboardScreen.js", "uid: user?.uid"],
  ["src/screens/SellerProfileScreen.js", "uid: sellerId"],
].forEach(([rel, expectedUid]) => {
  const source = stripComments(read(rel));
  if (!/navigate\("FollowList"/.test(source))
    fail(`${rel} no longer opens FollowList`);
  if (!source.includes(expectedUid))
    fail(
      `${rel} does not pass ${expectedUid} to FollowList — the list would be ` +
        `built for the wrong person`,
    );
  ["followers", "following"].forEach((kind) => {
    if (!new RegExp(`openFollowList\\("${kind}"\\)`).test(source))
      fail(`${rel}: ${kind} is no longer tappable`);
  });
});

// ── 4-5. The query direction, executed ───────────────────────────────────
const fieldSrc = /const field = ([\s\S]*?);\n/.exec(hook);
if (!fieldSrc) {
  fail(`${HOOK}: could not find the relationship field selection`);
} else {
  // eslint-disable-next-line no-new-func
  const pick = (kind) => new Function("kind", `return (${fieldSrc[1]});`)(kind);
  eq("followers reads the sellerId side", pick("followers"), "sellerId");
  eq("following reads the followerId side", pick("following"), "followerId");
}

// ── 6-7. Page size and cursor, executed ──────────────────────────────────
const pageSize = /export const FOLLOW_PAGE = (\d+);/.exec(hook);
if (!pageSize) fail(`${HOOK}: FOLLOW_PAGE is gone`);
else if (Number(pageSize[1]) !== 25)
  fail(`${HOOK}: FOLLOW_PAGE is ${pageSize[1]}, not 25`);

const constraintsSrc = /const constraints = \[([\s\S]*?)\n      \];/.exec(hook);
if (!constraintsSrc) {
  fail(`${HOOK}: could not find the query constraints to run`);
} else {
  const build = (cursor) => {
    const calls = [];
    const rec = (kind) => (...args) => { calls.push([kind, ...args]); return { kind }; };
    // eslint-disable-next-line no-new-func
    new Function(
      "field", "uid", "cursor", "where", "orderBy", "startAfter", "limit", "FOLLOW_PAGE",
      `const constraints = [${constraintsSrc[1]}]; return constraints;`,
    )(
      "sellerId", "UID", cursor,
      rec("where"), rec("orderBy"), rec("startAfter"), rec("limit"),
      Number(pageSize?.[1] ?? 0),
    );
    return calls;
  };

  const first = build(null);
  eq(
    "the first page filters on the relationship field",
    first.find((c) => c[0] === "where"),
    ["where", "sellerId", "==", "UID"],
  );
  eq(
    "the list is newest first",
    first.find((c) => c[0] === "orderBy"),
    ["orderBy", "createdAt", "desc"],
  );
  eq("the first page is bounded to 25", first.find((c) => c[0] === "limit"), ["limit", 25]);
  if (first.some((c) => c[0] === "startAfter"))
    fail("the first page is asking for a cursor it does not have");

  const next = build({ cursor: true });
  if (!next.some((c) => c[0] === "startAfter"))
    fail(
      "the second page does not use startAfter — without a cursor every page " +
        "returns the same twenty-five rows",
    );
  eq("the second page is bounded too", next.find((c) => c[0] === "limit"), ["limit", 25]);
}

// ── 8. The same page cannot be fetched twice ─────────────────────────────
//
// FlatList calls onEndReached on momentum, on layout and on content size
// change. Without a guard the second call starts an identical query before
// the first has moved the cursor, which both double-charges the read and
// appends every row twice.
const code = stripComments(hook);
if (!/inFlightRef/.test(code))
  fail(`${HOOK}: no in-flight guard — onEndReached would fire the same page twice`);
if (!/if \(inFlightRef\.current\) return;/.test(code))
  fail(`${HOOK}: loadMore does not refuse while a page is already in flight`);
if (!/if \(!hasMore\) return;/.test(code))
  fail(`${HOOK}: loadMore does not stop at the end of the list`);

// ── 9-12. The faces, and where they come from ────────────────────────────
if (!/import \{ PublicAvatar \}/.test(screen))
  fail(`${SCREEN} does not use PublicAvatar — the app's one avatar component`);
if (!/<PublicAvatar/.test(screen))
  fail(`${SCREEN} imports PublicAvatar but never renders it`);
if (!/usePublicProfiles/.test(screen))
  fail(`${SCREEN} does not hydrate the public profile projection`);
if (!/photoUrl=\{profiles\[item\.uid\]\?\.photoUrl\}/.test(screen))
  fail(`${SCREEN}: the avatar photo does not come from the public projection`);
// The initials fallback is PublicAvatar's job; it needs the name to draw one.
if (!/<PublicAvatar[\s\S]{0,160}name=\{/.test(screen))
  fail(`${SCREEN}: PublicAvatar is given no name, so it cannot draw an initial`);

const nameSrc = /const nameFor = \(item\) =>\n([\s\S]*?);\n/.exec(screen);
if (!nameSrc) {
  fail(`${SCREEN}: could not find the display-name precedence to run`);
} else {
  // eslint-disable-next-line no-new-func
  const nameFor = (profiles, item) =>
    new Function("profiles", "item", "t", `return (${nameSrc[1]});`)(
      profiles,
      item,
      (key) => `t:${key}`,
    );
  eq(
    "the live public name wins over the stamped one",
    nameFor({ u: { displayName: "Live" } }, { uid: "u", name: "Stamped" }),
    "Live",
  );
  eq(
    "the stamped name is used when there is no projection",
    nameFor({}, { uid: "u", name: "Stamped" }),
    "Stamped",
  );
  eq(
    "a row with neither falls back to the neutral placeholder",
    nameFor({}, { uid: "u", name: null }),
    "t:chatUnknownParticipant",
  );
}

// ── 13-14. The row opens the canonical profile, for the row's person ─────
if (!/navigation\.navigate\("SellerProfile"/.test(screen))
  fail(`${SCREEN}: a row no longer opens SellerProfile`);
if (!/sellerId: item\.uid/.test(screen))
  fail(
    `${SCREEN}: the row does not pass its own uid — every row would open the ` +
      `same profile`,
  );

// ── 15-16. Privacy ───────────────────────────────────────────────────────
//
// The private document is the one that holds RCCM, IFU and the ID. Neither
// the hook nor the screen may reach for it, and no contact detail belongs on
// an identity-and-navigation row.
[[HOOK, hook], [SCREEN, screen]].forEach(([rel, source]) => {
  const bare = stripComments(source);
  if (/collection\(firestore, "sellers"\)|doc\(firestore, "sellers"/.test(bare))
    fail(`${rel} reads the private sellers document`);
  [
    ["phone", /\bphone\b/],
    ["publicPhone", /publicPhone/],
    ["email", /\bemail\b/i],
    ["rccm", /rccm/i],
    ["ifu", /\bifu\b/i],
    ["pushToken", /pushToken/i],
  ].forEach(([what, pattern]) => {
    if (pattern.test(bare)) fail(`${rel} references ${what} — these rows are identity only`);
  });
});
// The projection it IS allowed to read.
if (!/sellerStats/.test(stripComments(read("src/hooks/usePublicProfiles.js"))))
  fail("usePublicProfiles no longer reads the public sellerStats projection");

// ── 17. Loading and empty are different answers ──────────────────────────
if (!/rows === null \?/.test(screen))
  fail(
    `${SCREEN}: loading and empty are no longer distinguished — the empty ` +
      `state would flash before the first page lands`,
  );
["followListEmptyFollowers", "followListEmptyFollowing"].forEach((key) => {
  if (!screen.includes(key)) fail(`${SCREEN}: the ${key} empty state is gone`);
});
if (!/ListFooterComponent/.test(screen))
  fail(`${SCREEN}: no footer indicator for the next page`);

// ── 18. A failed page keeps the rows already on screen ───────────────────
if (!/setRows\(\(current\) => \[\.\.\.\(current \?\? \[\]\), \.\.\.page\]\)/.test(code))
  fail(
    `${HOOK}: pages are not appended — replacing the list on each page loses ` +
      `everything above it`,
  );
{
  // The catch for the NEXT page must not touch rows.
  const loadMore = /const loadMore = useCallback\(([\s\S]*?)\n  \}, \[/.exec(code);
  if (!loadMore) fail(`${HOOK}: could not find loadMore`);
  else {
    const rescue = /\.catch\(\(\) => \{([\s\S]*?)\}\)/.exec(loadMore[1]);
    if (!rescue) fail(`${HOOK}: loadMore has no failure path`);
    else if (/setRows/.test(rescue[1]))
      fail(
        `${HOOK}: a failed next page rewrites the rows — everything already ` +
          `loaded would disappear because page four timed out`,
      );
  }
}

if (failures.length === 0) {
  console.log(
    "clean: follower/following lists page 25 at a time behind a cursor, open " +
      "for the profile being viewed, draw faces from the public projection " +
      "only, and keep what is loaded when a page fails",
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
