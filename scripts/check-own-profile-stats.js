#!/usr/bin/env node
//
// What a seller can see and share about their own account.
//
// Two defects, both of them a thing that existed and was not wired up:
//
//   THE COUNT WITH NOWHERE TO READ IT. sellerStats has carried `following`
//   since the counter was written — applyFollowDelta bumps both sides of a
//   follow in one go, and production data balances exactly. The public
//   profile has always shown it. The seller's OWN dashboard never rendered
//   it, so following somebody looked like a number that refused to move.
//   Nothing about the count was wrong; there was nowhere to read it.
//
//   THE SHARE WITH NO LINK. Every Share in this app wraps its sentence in
//   withListingLink or withProfileLink. The dashboard's profile share was
//   the one that did not, so what arrived in somebody's WhatsApp was a line
//   of text with nowhere to tap.
//
// Both are asserted as properties rather than spellings: the dashboard must
// render `following` FROM the projection, and the share must go through the
// helper — not merely mention them.
//
// Run: node scripts/check-own-profile-stats.js
const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

let failures = 0;
const fail = (m) => { console.error(`FAIL ${m}`); failures += 1; };

const dash = stripComments(read("src/screens/SellerDashboardScreen.js"));
const profile = stripComments(read("src/screens/SellerProfileScreen.js"));

// ── 1. The three numbers, from the canonical projection ────────────────
if (!/const ownStats = useSellerStats\(user\?\.uid\)/.test(dash))
  fail("the dashboard no longer reads its own sellerStats projection");

// `profileLikes`, not `likes`. The dashboard's third figure used to be
// `likes`, which counts private listing SAVES received. That cell is now a
// door onto Likes Received, and a door onto saver identities is one the
// favorites rules forbid — so what it counts and what it opens were made
// the same thing: people who publicly liked this profile. The save figure
// keeps its home on the listing itself, labelled Saves.
for (const [field, label] of [
  ["followers", "Followers"],
  ["following", "Following"],
  ["profileLikes", "Likes"],
]) {
  if (!new RegExp(`ownStats\\?\\.${field} \\?\\? 0`).test(dash))
    fail(`the dashboard does not render ${label} from ownStats.${field} — that is the canonical projection and the only place this figure may come from`);
}

// THE DEFECT: rendering `followers` where `following` belongs. Both are on
// the same row, both read the same way, and the wrong one looks right.
const rowAt = dash.indexOf("<OwnStatRow>");
const row = rowAt === -1 ? "" : dash.slice(rowAt, dash.indexOf("</OwnStatRow>", rowAt));
if (!row) fail("could not locate the dashboard stat row — the rest of this section is not being tested");
else {
  const followers = (row.match(/ownStats\?\.followers/g) ?? []).length;
  const following = (row.match(/ownStats\?\.following/g) ?? []).length;
  if (following < 1)
    fail("the stat row shows no Following at all — this is the defect: the count was correct and simply never displayed");
  if (followers < 1) fail("the stat row no longer shows Followers");
  if (!/profileStatFollowing/.test(row))
    fail("the Following cell carries no Following label");
  if (!/profileStatFollowers/.test(row))
    fail("the Followers cell carries no Followers label");
}

// No optimistic counter beside the projection: a second source of truth
// for a number the server owns.
// The BINDING, not the argument. /useState\([^)]*following/ looks at the
// right-hand side, and `const [following, setFollowing] = useState(0)` puts
// the name on the left — so the shadow it was meant to catch walked past it.
const shadow = [...dash.matchAll(/const \[\s*(\w+)\s*,\s*(\w+)\s*\]\s*=\s*useState/g)]
  .find(([, a, b]) => /^follow/i.test(a) || /^setFollow/i.test(b));
if (shadow)
  fail(`the dashboard keeps local state \`${shadow[1]}\` — sellerStats is the canonical projection for follow counts and must not be shadowed`);

// ── 2. Following opens the same list the public profile opens ──────────
if (!/navigation\.navigate\("FollowList"/.test(dash))
  fail("the dashboard cannot open the follow list");
const dashRoute = dash.match(/navigate\("FollowList",\s*\{([^}]*)\}/);
const profileRoute = profile.match(/navigate\("FollowList",\s*\{([^}]*)\}/);
if (!dashRoute || !profileRoute) fail("could not read the FollowList route arguments on both screens");
else {
  // KEYS, not values. Matching /(\w+)\s*[:,]/ picked up the right-hand
  // side too, so `{ uid: user?.uid }` read as two keys and the two screens
  // never compared equal.
  const keys = (m) =>
    [...m[1].matchAll(/(?:^|,)\s*(\w+)\s*(?::|,|$)/g)]
      .map((x) => x[1])
      .sort()
      .join(",");
  if (keys(dashRoute) !== keys(profileRoute))
    fail(`the dashboard opens FollowList with different arguments (${keys(dashRoute)}) than the public profile (${keys(profileRoute)}) — same list, same semantics`);
}
if (!/openFollowList\("following"\)/.test(dash))
  fail("nothing on the dashboard opens the Following list");

// ── 3. The share carries a link ────────────────────────────────────────
if (!/import \{ withProfileLink \} from "\.\.\/utils\/profileLink";/.test(dash))
  fail("the dashboard does not import withProfileLink");

const shareAt = dash.indexOf("const handleShareProfile");
const share = shareAt === -1 ? "" : dash.slice(shareAt, shareAt + 900);
if (!share) fail("could not locate handleShareProfile");
else {
  if (!/withProfileLink\(/.test(share))
    fail("handleShareProfile shares a bare message again — the recipient gets text with nowhere to tap");
  if (!/withProfileLink\([\s\S]*user\?\.uid/.test(share))
    fail("handleShareProfile does not pass the seller's own uid to withProfileLink");
  if (/withListingLink/.test(share))
    fail("handleShareProfile uses the LISTING link helper — this action shares a profile, and /l/{id} is not /s/{uid}");
  // message: t(...) with nothing around it is the regression.
  if (/message:\s*t\(/.test(share))
    fail("handleShareProfile passes a translated string straight to Share.share — that is the message-only regression");
}

// Every Share in the app goes through a link helper. Stated once, here,
// so a new share site cannot quietly ship without one.
for (const rel of [
  "src/screens/SellerDashboardScreen.js",
  "src/screens/SellerProfileScreen.js",
  "src/screens/ProductDetailScreen.js",
  "src/components/ListingCard.js",
  "src/screens/MyListingsScreen.js",
  "src/screens/EventsScreen.js",
]) {
  const src = stripComments(read(rel));
  for (const m of src.matchAll(/Share\.share\(\{([\s\S]{0,260}?)\}\)/g)) {
    if (!/with(Listing|Profile)Link\(/.test(m[1]))
      fail(`${rel}: a Share.share has no link helper — it would send text with nowhere to tap`);
  }
}

// ── 4. The URL shape is unchanged ──────────────────────────────────────
const profileLink = stripComments(read("src/utils/profileLink.js"));
if (!/\/s\/\$\{uid\}/.test(profileLink))
  fail("the profile share URL is no longer /s/{uid} — the page functions/profilePage.js serves");
const listingLink = stripComments(read("src/utils/listingLink.js"));
if (!/\/l\/\$\{id\}/.test(listingLink))
  fail("the listing share URL changed; this phase must not touch it");
if (/itunes|apps\.apple|play\.google|APP_DOWNLOAD_URL/i.test(dash))
  fail("the dashboard has acquired a store URL — there is no store listing yet and one must not be invented");

// ── 5. The counters stay the server's ──────────────────────────────────
const fns = stripComments(read("functions/index.js"));
if (!/bumpSellerStat\(sellerId, "followers", delta\)/.test(fns) ||
    !/bumpSellerStat\(followerId, "following", delta\)/.test(fns))
  fail("applyFollowDelta no longer bumps both sides of a follow — this phase must not touch the counters");

if (failures) process.exit(1);
console.log(
  "clean: own profile — the dashboard reads Followers, Following and profile Likes " +
    "from sellerStats and shadows none of them, Following opens the same " +
    "list the public profile opens, and every Share in the app carries a link",
);
