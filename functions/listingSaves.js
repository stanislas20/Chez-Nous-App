const admin = require("firebase-admin");
const { logger } = require("firebase-functions");

// What happens to private Saves when the listing they point at is deleted.
//
// A Save is `favorites/{userId}_{listingId}` and it is private to the person
// who made it — firestore.rules lets nobody else read one, which is also why
// no client can clean these up. The seller's aggregate, `sellerStats.likes`,
// is the only public trace of them.
//
// Before this existed, a hard delete left both behind: the favourite rows
// survived pointing at nothing, and the aggregate kept counting them. It
// could never be repaired afterwards either, because the seller's identity
// lives on the LISTING — once that is gone, `applyFavouriteDelta` has
// nothing to credit and returns early. The window to act is the deletion
// event itself, which still carries the listing's own snapshot.
//
// ── Why the count comes from the rows and not from saveCount ────────────
//
// The deleted listing carries a `saveCount`, and using it would be one less
// query. It is also the one number here that can already be wrong — it is a
// cached total, and a historical drift would be subtracted from the
// aggregate as if it were real. Counting the rows actually removed cannot
// drift, because it IS the thing being removed.
//
// ── Why this is replay-safe ─────────────────────────────────────────────
//
// Cloud Functions are at-least-once. A second delivery re-runs this, finds
// no favourites left, removes zero and decrements by zero. The idempotency
// is a property of counting what was deleted rather than of any marker.
const SAVE_CLEANUP_BATCH = 300;

// Deleting these rows fires onFavoriteDeleted once per row, and that handler
// begins by reading the listing. The listing is already gone, so every one
// of those is a no-op — which is what keeps this from double-decrementing.
// The aggregate is adjusted exactly once, here, by the number removed.
async function cleanupSavesForListing(
  listingId,
  sellerId,
  { batchSize = SAVE_CLEANUP_BATCH } = {},
) {
  if (!listingId) return 0;

  const db = admin.firestore();
  let removed = 0;

  // Paged rather than fetched whole: a popular listing can hold more saves
  // than one batch may carry, and Firestore refuses a batch over 500.
  // `limit` + re-query is used instead of a cursor because every pass
  // deletes what it read, so the next pass's first row is the cursor.
  for (;;) {
    const page = await db
      .collection("favorites")
      .where("listingId", "==", listingId)
      .limit(batchSize)
      .get();
    if (page.empty) break;

    const batch = db.batch();
    page.docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
    removed += page.size;

    if (page.size < batchSize) break;
  }

  if (removed === 0) return 0;

  // No seller to credit. The rows are still worth removing — they point at
  // a listing that no longer exists — but there is no counter to correct.
  if (!sellerId) {
    logger.warn(
      `Listing ${listingId}: removed ${removed} save(s) but the deleted ` +
        `listing carried no sellerId, so no aggregate was adjusted.`,
    );
    return removed;
  }

  // Floored, and read inside the transaction: a bare increment() cannot see
  // the stored value, and a counter that drifted low before this ran must
  // not be driven negative by a correct decrement.
  const statsRef = db.collection("sellerStats").doc(sellerId);
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(statsRef);
    const current = Number(snapshot.data()?.likes) || 0;
    tx.set(statsRef, { likes: Math.max(0, current - removed) }, { merge: true });
  });

  logger.info(
    `Listing ${listingId} deleted: removed ${removed} save(s) and reduced ` +
      `the seller's aggregate by the same.`,
  );
  return removed;
}

module.exports = { cleanupSavesForListing, SAVE_CLEANUP_BATCH };
