#!/usr/bin/env node
//
// Four things a person can do to a seller, and they must stay four.
//
//   follow        tell me what this seller posts        follows
//   profile like  this seller is worth dealing with     profileLikes
//   save          remember this listing for me          favorites  (PRIVATE)
//   rate          a review, behind the interaction gate ratings
//
// The one that matters most here is the third. `favorites` is readable by
// its author and nobody else — firestore.rules says so, and the backend
// comment says plainly that "a seller cannot count their own listing's
// saves from the client". Somebody who tapped a heart on a listing was told
// they were bookmarking it; the UI calls it Saved in both languages and
// always has. Profile likes exist as a SEPARATE collection precisely so
// that promise is never retroactively broken, and the loudest thing this
// file does is fail if the two are ever joined up.
//
// The query and the rules are read as structure rather than as prose: a
// read rule admitting one extra principal is a few characters, and it is
// the few characters that would turn a private bookmark into a public one.
//
// Run: node scripts/check-profile-likes.js
const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const failures = [];
const fail = (m) => failures.push(m);
const eq = (what, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    fail(`${what} — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
};

const rules = read("firestore.rules");
const hook = read("src/hooks/useProfileLike.js");
const listHook = read("src/hooks/useProfileLikesReceived.js");
const screen = read("src/screens/LikesReceivedScreen.js");
const dash = stripComments(read("src/screens/SellerDashboardScreen.js"));
const profile = stripComments(read("src/screens/SellerProfileScreen.js"));
const fns = read("functions/index.js");
const del = read("functions/deleteAccount.js");

// ── The rules block, by structure ────────────────────────────────────────
const block = /match \/profileLikes\/\{likeId\} \{([\s\S]*?)\n    \}/.exec(rules);
if (!block) {
  fail("firestore.rules has no profileLikes block");
} else {
  const r = block[1];
  // 1. Deterministic id, 2. no self-like, 3. liker cannot be spoofed.
  if (!/likeId == request\.auth\.uid \+ '_' \+ request\.resource\.data\.sellerId/.test(r))
    fail(
      "the document id is not pinned to {liker}_{seller} — without it the " +
        "same person can like a profile many times under different ids",
    );
  if (!/request\.resource\.data\.likerId == request\.auth\.uid/.test(r))
    fail("create does not pin likerId to the caller — likes could be forged in someone else's name");
  if (!/request\.resource\.data\.sellerId != request\.auth\.uid/.test(r))
    fail("self-likes are not rejected — an account could inflate its own counter");
  // 4. Identity immutable.
  if (!/allow update: if false;/.test(r))
    fail(
      "update is not denied — the only thing an update could do to this " +
        "document is repoint an existing like at somebody else",
    );
  // Read: exactly the two principals, no more.
  if (!/request\.auth\.uid == resource\.data\.likerId/.test(r))
    fail("the liker cannot read their own like, so a profile cannot show its liked state");
  if (!/request\.auth\.uid == resource\.data\.sellerId/.test(r))
    fail("the person liked cannot read their own likes, so Likes Received cannot work");
  if (/allow read: if true/.test(r) || /allow read: if request\.auth != null;/.test(r))
    fail(
      "profileLikes is readable by any signed-in user — this is not a public " +
        "directory of who admires whom",
    );
  // Delete belongs to the liker alone.
  if (!/allow delete: if request\.auth != null && request\.auth\.uid == resource\.data\.likerId;/.test(r))
    fail("delete is not restricted to the liker");
}

// ── 16-17. The privacy boundary this feature must not move ──────────────
const favBlock = /match \/favorites\/\{favoriteId\} \{([\s\S]*?)\n    \}/.exec(rules);
if (!favBlock) {
  fail("firestore.rules has no favorites block — this check is asserting nothing");
} else {
  const f = favBlock[1];
  if (!/allow read: if request\.auth != null && request\.auth\.uid == resource\.data\.userId;/.test(f))
    fail(
      "the favorites read rule changed. A listing save is a private bookmark: " +
        "widening it is how every historical saver becomes visible to a seller " +
        "who was never promised that",
    );
  if (/sellerId/.test(f))
    fail(
      "favorites rules now mention sellerId — the collection is being reshaped " +
        "towards seller-visible likes, which is the migration this feature was " +
        "designed to avoid",
    );
}
// Nothing in the new code may read favourites at all.
[["src/hooks/useProfileLike.js", hook],
 ["src/hooks/useProfileLikesReceived.js", listHook],
 ["src/screens/LikesReceivedScreen.js", screen]].forEach(([rel, src]) => {
  if (/"favorites"|saveCount/.test(stripComments(src)))
    fail(`${rel} touches favorites/saveCount — profile likes must not read listing saves`);
});
// The saver's own screen still reads the saver's own favourites.
if (!/useFavorites\(user\?\.uid\)/.test(stripComments(read("src/screens/SavedListingsScreen.js"))))
  fail("SavedListingsScreen no longer reads the signed-in user's own favourites");

// ── 5-6. A dedicated counter; the legacy one untouched ──────────────────
if (!/bumpSellerStat\(sellerId, "profileLikes", delta\)/.test(fns))
  fail("no server-maintained profileLikes counter");
if (!/bumpSellerStat\(listing\.data\(\)\?\.sellerId, "likes", delta\)/.test(fns))
  fail(
    "sellerStats.likes is no longer maintained from listing favourites — that " +
      "field is the save analytic and must keep its meaning",
  );
{
  // The profile-like trigger must not write the legacy field.
  const delta = /async function applyProfileLikeDelta\(([\s\S]*?)\n\}/.exec(fns);
  if (!delta) fail("applyProfileLikeDelta is gone");
  else {
    if (/"likes"/.test(delta[1]))
      fail("applyProfileLikeDelta writes sellerStats.likes — that is the listing-save counter");
    if (!/likerId === sellerId\) return;/.test(delta[1]))
      fail("applyProfileLikeDelta does not ignore a self-like");
  }
}
if (!/profileLikes: atLeastZero\(data\?\.profileLikes\)/.test(read("src/hooks/useSellerStats.js")))
  fail("the public projection does not expose profileLikes");

// ── 7-8. The dashboard ──────────────────────────────────────────────────
if (!/ownStats\?\.profileLikes \?\? 0/.test(dash))
  fail("the dashboard Likes figure does not read profileLikes");
if (/formatCount\(ownStats\?\.likes \?\? 0/.test(dash))
  fail(
    "the dashboard still renders ownStats.likes — that counts private listing " +
      "saves, and the cell beside it is now a door onto identities",
  );
if (!/navigation\.navigate\("LikesReceived"\)/.test(dash))
  fail("the Likes cell does not open LikesReceived");

// ── 9-10. The profile action ────────────────────────────────────────────
if (!/useProfileLike\(sellerId, user\?\.uid\)/.test(profile))
  fail("SellerProfile has no profile-like action");
if (!/profileLikeActionDone|profileLikeAction/.test(profile))
  fail("the like action renders no label");
{
  const guard = /const canLike = Boolean\(([\s\S]*?)\);/.exec(hook);
  if (!guard) fail("useProfileLike has no canLike guard");
  else {
    // eslint-disable-next-line no-new-func
    const can = new Function(
      "isFirebaseConfigured", "sellerId", "userId",
      `return Boolean(${guard[1]});`,
    );
    eq("you cannot like your own profile", can(true, "me", "me"), false);
    eq("signed out, there is no like button", can(true, "other", null), false);
    eq("another profile can be liked", can(true, "other", "me"), true);
  }
}

// ── 11. Owner-only, from auth rather than a route param ─────────────────
if (/route\.params/.test(stripComments(listHook)))
  fail(
    "the Likes Received hook reads a route param — ownership must come from " +
      "auth, or anyone who can type a uid gets somebody else's list",
  );
if (!/const \{ user \} = useAuth\(\)/.test(stripComments(listHook)))
  fail("the Likes Received hook does not take its uid from auth");
if (/sellerId/.test(stripComments(screen)) && !/SellerProfile/.test(screen))
  fail("the Likes Received screen takes a sellerId from somewhere other than auth");

// ── 12. Pagination, executed ────────────────────────────────────────────
const page = /export const PROFILE_LIKES_PAGE = (\d+);/.exec(listHook);
if (!page) fail("PROFILE_LIKES_PAGE is gone");
else if (Number(page[1]) !== 25) fail(`PROFILE_LIKES_PAGE is ${page[1]}, not 25`);
{
  const q = /const snapshot = await getDocs\(\s*query\(([\s\S]*?)\n        \),\s*\n      \);/.exec(listHook);
  if (!q) fail("could not find the Likes Received query to run");
  else {
    const build = (cursor) => {
      const calls = [];
      const rec = (kind) => (...args) => { calls.push([kind, ...args]); return { kind }; };
      // eslint-disable-next-line no-new-func
      new Function(
        "collection", "firestore", "where", "orderBy", "startAfter", "limit",
        "uid", "cursor", "PROFILE_LIKES_PAGE", "getDocs", "query",
        `return (async () => { const snapshot = await getDocs(query(${q[1]})); })();`,
      )(
        () => ({}), {}, rec("where"), rec("orderBy"), rec("startAfter"), rec("limit"),
        "ME", cursor, Number(page?.[1] ?? 0),
        async () => ({ docs: [] }), (...a) => a,
      );
      return calls;
    };
    const first = build(null);
    eq("the list is scoped to the signed-in owner",
      first.find((c) => c[0] === "where"), ["where", "sellerId", "==", "ME"]);
    eq("newest first", first.find((c) => c[0] === "orderBy"), ["orderBy", "createdAt", "desc"]);
    eq("bounded to one page", first.find((c) => c[0] === "limit"), ["limit", 25]);
    if (first.some((c) => c[0] === "startAfter"))
      fail("the first page asks for a cursor it does not have");
    if (!build({ c: 1 }).some((c) => c[0] === "startAfter"))
      fail("the next page does not use a cursor — every page would repeat the first");
  }
}
const lh = stripComments(listHook);
if (!/if \(inFlightRef\.current\) return;/.test(lh))
  fail("loadMore does not refuse while a page is in flight");
if (!/setRows\(\(current\) => \[\.\.\.\(current \?\? \[\]\), \.\.\.page\]\)/.test(lh))
  fail("pages replace instead of appending");
{
  const loadMore = /const loadMore = useCallback\(([\s\S]*?)\n  \}, \[/.exec(lh);
  const rescue = loadMore && /\.catch\(\(\) => \{([\s\S]*?)\}\)/.exec(loadMore[1]);
  if (!rescue) fail("loadMore has no failure path");
  else if (/setRows/.test(rescue[1]))
    fail("a failed next page rewrites the rows — everything loaded would vanish");
}

// ── 13-14. Reuse, not reinvention ───────────────────────────────────────
if (!/import \{ PublicAvatar \}/.test(screen) || !/<PublicAvatar/.test(screen))
  fail("the Likes Received rows do not use PublicAvatar");
if (!/usePublicProfiles/.test(screen))
  fail("the rows do not hydrate from the public profile projection");
if (!/photoUrl=\{profiles\[item\.uid\]\?\.photoUrl\}/.test(screen))
  fail("the avatar photo does not come from the public projection");
if (!/navigation\.navigate\("SellerProfile"/.test(screen) || !/sellerId: item\.uid/.test(screen))
  fail("a row does not open the canonical SellerProfile for that row's person");
if (!/rows === null \?/.test(screen))
  fail("loading and empty are not distinguished");
if (!/likesReceivedEmpty/.test(screen)) fail("the translated empty state is gone");

// ── 15. Deletion, both directions ───────────────────────────────────────
['["profileLikes", "likerId"]', '["profileLikes", "sellerId"]'].forEach((entry) => {
  if (!del.includes(entry))
    fail(`deleteAccount does not sweep ${entry} — the other direction leaves orphans`);
});

// ── 18. No notifications in this phase ──────────────────────────────────
{
  const created = /exports\.onProfileLikeCreated = onDocumentCreated\(([\s\S]*?)\n\);/.exec(fns);
  if (!created) fail("onProfileLikeCreated is gone");
  else if (/recordNotification|sendPush|messaging\(\)/.test(created[1]))
    fail("the profile-like trigger sends a notification — not in this phase");
}

if (failures.length === 0) {
  console.log(
    "clean: profile likes are their own public relationship — deterministic, " +
      "unspoofable, immutable, self-like refused, counted in their own field, " +
      "listed owner-only behind a cursor — and listing saves stay private",
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
