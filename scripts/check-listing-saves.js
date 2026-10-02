#!/usr/bin/env node
//
// A private Save outlives everything except its listing.
//
// `favorites/{uid}_{listingId}` is a bookmark readable by its author alone.
// Two numbers describe it from outside — `listings.saveCount` and the
// seller's `sellerStats.likes` — and neither may ever name who saved what.
//
// Three properties, each one careless edit from gone:
//
//   THE TWO COUNTERS MOVE AS ONE. They were two separate awaits, so a
//   failure between them left the pair disagreeing with nothing to notice
//   and no way to repair it.
//
//   A HARD DELETE TAKES THE SAVES WITH IT. Before the cleanup trigger,
//   favourites outlived their listing and the aggregate counted them
//   forever. It could not be fixed afterwards either: the seller's identity
//   lives on the listing, so once that is gone there is nobody to credit.
//
//   A STATUS CHANGE TAKES NOTHING. Sold, archived, rejected, expired and
//   pending are reversible states of a listing that still exists. If a Save
//   were dropped on any of them, a renewed listing would have to reconstruct
//   counts it should never have lost. Only hard deletion removes them, and
//   the way that is enforced is that the favourite path never reads
//   `status` at all — which is asserted here rather than mimed with a fake
//   state machine in a test.
//
// Run: node scripts/check-listing-saves.js
const fs = require("fs");
const path = require("path");
const { stripComments } = require("./lib/stripComments");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const failures = [];
const fail = (m) => failures.push(m);

const fns = read("functions/index.js");
const saves = read("functions/listingSaves.js");
const rules = read("firestore.rules");

// ── The hard-delete cleanup exists and is wired to the deletion event ───
if (!/exports\.cleanupDeletedListingSaves = onDocumentDeleted\(\s*\n\s*"listings\/\{listingId\}"/.test(fns))
  fail(
    "no cleanup fires when a listing is hard-deleted — favourites would " +
      "outlive it and the seller's aggregate would count them forever",
  );
if (!/cleanupSavesForListing\(/.test(fns))
  fail("the deletion trigger does not call the save cleanup");
// The media cleanup must survive alongside it.
if (!/exports\.cleanupDeletedListingMedia = onDocumentDeleted\(/.test(fns))
  fail("cleanupDeletedListingMedia was removed or folded away");

{
  const trigger =
    /exports\.cleanupDeletedListingSaves = onDocumentDeleted\(([\s\S]*?)\n\);/.exec(fns);
  if (!trigger) fail("could not read the save-cleanup trigger");
  else {
    // The seller comes from the deleted listing's own snapshot. It is the
    // last moment that identity exists anywhere.
    if (!/event\.data\?\.data\(\)\?\.sellerId/.test(trigger[1]))
      fail(
        "the cleanup does not take sellerId from the deleted listing " +
          "snapshot — after the delete there is nowhere else to find it",
      );
    if (!/event\.params\.listingId/.test(trigger[1]))
      fail("the cleanup does not scope itself to the deleted listing");
  }
}

// ── The cleanup counts rows, not the cached total ───────────────────────
{
  const bare = stripComments(saves);
  if (!/where\("listingId", "==", listingId\)/.test(bare))
    fail("the cleanup does not query favourites by listingId");
  if (/saveCount/.test(bare))
    fail(
      "the cleanup reads saveCount — that is a cached total which may " +
        "already be wrong, and subtracting it would corrupt the aggregate. " +
        "The decrement must follow the rows actually removed",
    );
  if (!/removed \+= page\.size/.test(bare))
    fail("the cleanup does not count the rows it removes");
  if (!/Math\.max\(0, current - removed\)/.test(bare))
    fail("the cleanup decrement is not floored at zero");
  if (!/\.limit\(batchSize\)/.test(bare))
    fail(
      "the cleanup is unbounded — Firestore refuses a batch over 500 and a " +
        "popular listing can hold more saves than one batch may carry",
    );
  // Nothing about a saver may be logged or returned.
  if (/userId/.test(bare))
    fail("the cleanup references userId — saver identity must never leave the server");
}

// ── Both counters move inside one transaction ───────────────────────────
{
  const delta = /async function applyFavouriteDelta\(([\s\S]*?)\n\}/.exec(fns);
  if (!delta) fail("applyFavouriteDelta is gone");
  else {
    const body = delta[1];
    if (!/runTransaction\(/.test(body))
      fail(
        "the favourite counters are no longer updated in one transaction — " +
          "a failure between the two writes leaves saveCount and " +
          "sellerStats.likes disagreeing with nothing to notice",
      );
    if (/bumpSellerStat\(/.test(body))
      fail(
        "applyFavouriteDelta calls bumpSellerStat, which runs its OWN " +
          "transaction — that is the split this fix removed",
      );
    if (!/listing\.data\(\)\?\.sellerId/.test(body))
      fail("the seller is not derived from the listing — a client-written favourite must never name it");
    if (!/if \(!listing\.exists\) return;/.test(body))
      fail("a favourite whose listing is gone is no longer a no-op");
    if (!/if \(!listingId\) return;/.test(body))
      fail("a malformed favourite with no listingId is no longer a no-op");
    if (!/Math\.max\(0, currentSaves \+ delta\)/.test(body))
      fail("saveCount is not floored");
    if (!/Math\.max\(0, currentLikes \+ delta\)/.test(body))
      fail("the seller aggregate is not floored");
    // Firestore refuses a read after a write inside a transaction.
    const firstWrite = Math.min(
      ...[/tx\.update\(/, /tx\.set\(/]
        .map((re) => { const m = re.exec(body); return m ? m.index : Infinity; }),
    );
    const lastRead = Math.max(
      ...[...body.matchAll(/await tx\.get\(/g)].map((m) => m.index),
      -1,
    );
    if (lastRead > firstWrite)
      fail("a transaction read happens after a write — Firestore refuses that");
  }
}

// ── Status is never a trigger point ─────────────────────────────────────
//
// Asserted as the absence of the mechanism, because a Save following the
// listing DOCUMENT is exactly the property that no status is consulted.
{
  const bare = stripComments(saves);
  if (/status/.test(bare))
    fail(
      "the save cleanup reads a listing status — a sold, archived, rejected " +
        "or expired listing still exists and keeps its Saves; only a hard " +
        "delete removes them",
    );
  const delta = /async function applyFavouriteDelta\(([\s\S]*?)\n\}/.exec(stripComments(fns));
  if (delta && /status/.test(delta[1]))
    fail("the favourite counter path reads a listing status — Saves do not expire with visibility");
  if (/onDocumentUpdated\(\s*\n?\s*"listings\/\{listingId\}"[\s\S]{0,400}?favorites/.test(fns))
    fail("a listing UPDATE now touches favourites — status changes must not remove Saves");
}

// ── The two systems stay apart ──────────────────────────────────────────
{
  const bare = stripComments(fns);
  const favDelta = /async function applyFavouriteDelta\(([\s\S]*?)\n\}/.exec(bare);
  if (favDelta && /profileLikes/.test(favDelta[1]))
    fail("the favourite path writes profileLikes");
  const likeDelta = /async function applyProfileLikeDelta\(([\s\S]*?)\n\}/.exec(bare);
  if (likeDelta && /(saveCount|"likes")/.test(likeDelta[1]))
    fail("the profile-like path writes the listing-save counters");
  if (/profileLikes|saveCount/.test(stripComments(saves).replace(/likes/g, "")))
    fail("the save cleanup touches profile likes");
}

// ── Privacy: the schema and the rules are unmoved ───────────────────────
{
  const hook = stripComments(read("src/hooks/useFavorites.js"));
  if (/sellerId/.test(hook))
    fail(
      "favourite documents now carry a sellerId. The approved architecture " +
        "takes the seller from the deleted listing's snapshot precisely so " +
        "this field is not needed; adding it is a schema and privacy change " +
        "that has to be decided, not slipped in",
    );
  if (/where\("listingId"/.test(hook))
    fail("the client now queries favourites by listingId — that is the seller-visible enumeration the rules forbid");

  const favBlock = /match \/favorites\/\{favoriteId\} \{([\s\S]*?)\n    \}/.exec(rules);
  if (!favBlock) fail("the favorites rules block is gone");
  else if (
    !/allow read: if request\.auth != null && request\.auth\.uid == resource\.data\.userId;/.test(
      favBlock[1],
    )
  )
    fail("the favorites read rule changed — a Save is private to the person who made it");
}

if (failures.length === 0) {
  console.log(
    "clean: both save counters move in one transaction, a hard delete takes " +
      "the saves with it and decrements by the rows actually removed, a " +
      "status change takes nothing, and no saver identity is reachable",
  );
}
for (const f of failures) console.log(`FAIL ${f}`);
if (failures.length) console.log(`\n${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
