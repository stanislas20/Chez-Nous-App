// What a private Save does to the two counters, and what happens to both
// when the listing is hard-deleted.
//
// The real exported handlers run here via CloudFunction.run(), the same way
// deleteAccount and the profile-like counter are exercised: the arithmetic
// under test is the arithmetic that ships. Nothing is reimplemented.
//
// Two properties are the point of this file:
//
//   BOTH COUNTERS MOVE AS ONE. sellerStats.likes and listing.saveCount
//   describe the same event and used to be two separate awaits, so a
//   failure between them left the pair disagreeing with nothing to notice.
//
//   A HARD DELETE TAKES THE SAVES WITH IT. Before, favourites outlived
//   their listing and the aggregate kept counting them forever — and could
//   never be repaired, because the seller's identity lives on the listing.
//
// Status changes are not represented here as machinery because the code has
// none: nothing in the favourite path reads `status`. That is asserted
// statically in check-listing-saves.js instead of mimed with a fake state
// machine.
const path = require("path");
const { check, report, assert } = require("./harness");

const FUNCTIONS = path.join(__dirname, "..", "..", "functions");

const SELLER = "save-seller";
const OTHER_SELLER = "save-other-seller";
const SAVER_A = "save-user-a";
const SAVER_B = "save-user-b";

let admin;
let db;
let index;
let cleanupSavesForListing;

const eventFor = (data, params = {}) => ({ data: { data: () => data }, params });

const listingOf = async (id) => (await db.doc(`listings/${id}`).get()).data() ?? {};
const statsOf = async (uid) => (await db.doc(`sellerStats/${uid}`).get()).data() ?? {};
const savesFor = async (listingId) =>
  (await db.collection("favorites").where("listingId", "==", listingId).get()).size;

const seedListing = (id, sellerId, extra = {}) =>
  db.doc(`listings/${id}`).set({ sellerId, status: "approved", saveCount: 0, ...extra });

// A Save written exactly as the client writes it: deterministic id, and no
// sellerId — the favourite never names the seller, by design.
const seedSave = (uid, listingId) =>
  db.doc(`favorites/${uid}_${listingId}`).set({
    userId: uid,
    listingId,
    createdAt: new Date(),
  });

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error("FIRESTORE_EMULATOR_HOST is not set — refusing to run.");
    process.exit(1);
  }

  index = require(path.join(FUNCTIONS, "index.js"));
  ({ cleanupSavesForListing } = require(path.join(FUNCTIONS, "listingSaves.js")));
  admin = require(path.join(FUNCTIONS, "node_modules", "firebase-admin"));
  db = admin.firestore();

  // ── 1-4. The ordinary lifecycle, both counters together ──────────────
  await seedListing("L1", SELLER);
  await db.doc(`sellerStats/${SELLER}`).set({ likes: 0, profileLikes: 5, followers: 2, following: 1 });

  await check("a save takes both counters 0 → 1", async () => {
    await index.onFavoriteCreated.run(eventFor({ userId: SAVER_A, listingId: "L1" }));
    assert.strictEqual((await listingOf("L1")).saveCount, 1);
    assert.strictEqual((await statsOf(SELLER)).likes, 1);
  });
  await check("a second, independent saver takes both 1 → 2", async () => {
    await index.onFavoriteCreated.run(eventFor({ userId: SAVER_B, listingId: "L1" }));
    assert.strictEqual((await listingOf("L1")).saveCount, 2);
    assert.strictEqual((await statsOf(SELLER)).likes, 2);
  });
  await check("un-saving takes both 2 → 1", async () => {
    await index.onFavoriteDeleted.run(eventFor({ userId: SAVER_B, listingId: "L1" }));
    assert.strictEqual((await listingOf("L1")).saveCount, 1);
    assert.strictEqual((await statsOf(SELLER)).likes, 1);
  });
  await check("the last un-save takes both 1 → 0", async () => {
    await index.onFavoriteDeleted.run(eventFor({ userId: SAVER_A, listingId: "L1" }));
    assert.strictEqual((await listingOf("L1")).saveCount, 0);
    assert.strictEqual((await statsOf(SELLER)).likes, 0);
  });

  // ── 5. Both floors ───────────────────────────────────────────────────
  await check("a replayed un-save drives neither counter negative", async () => {
    await index.onFavoriteDeleted.run(eventFor({ userId: SAVER_A, listingId: "L1" }));
    await index.onFavoriteDeleted.run(eventFor({ userId: SAVER_A, listingId: "L1" }));
    assert.strictEqual((await listingOf("L1")).saveCount, 0);
    assert.strictEqual((await statsOf(SELLER)).likes, 0);
  });

  // ── 6-8. Data the handler must survive ───────────────────────────────
  await check("a favourite with no listingId is a no-op", async () => {
    await index.onFavoriteCreated.run(eventFor({ userId: SAVER_A }));
    assert.strictEqual((await statsOf(SELLER)).likes, 0);
  });
  await check("a favourite whose listing is gone is a no-op", async () => {
    await index.onFavoriteCreated.run(
      eventFor({ userId: SAVER_A, listingId: "no-such-listing" }),
    );
    assert.strictEqual((await statsOf(SELLER)).likes, 0);
  });
  await check("a listing with no sellerId cannot corrupt an aggregate", async () => {
    await db.doc("listings/L-NOSELLER").set({ status: "approved", saveCount: 0 });
    await index.onFavoriteCreated.run(
      eventFor({ userId: SAVER_A, listingId: "L-NOSELLER" }),
    );
    // Its own count still moves; nobody else's does.
    assert.strictEqual((await listingOf("L-NOSELLER")).saveCount, 1);
    assert.strictEqual((await statsOf(SELLER)).likes, 0);
    assert.strictEqual((await statsOf(OTHER_SELLER)).likes, undefined);
  });

  // ── 9-12. Hard deletion ──────────────────────────────────────────────
  await check("deleting a listing with no saves changes nothing", async () => {
    await seedListing("L2", SELLER);
    await db.doc(`sellerStats/${SELLER}`).set({ likes: 3 }, { merge: true });
    await index.cleanupDeletedListingSaves.run(
      eventFor({ sellerId: SELLER }, { listingId: "L2" }),
    );
    assert.strictEqual((await statsOf(SELLER)).likes, 3);
  });

  await check(
    "deleting a listing with one save removes it and decrements once",
    async () => {
      await seedListing("L3", SELLER, { saveCount: 1 });
      await seedSave(SAVER_A, "L3");
      await db.doc(`sellerStats/${SELLER}`).set({ likes: 1 }, { merge: true });
      await index.cleanupDeletedListingSaves.run(
        eventFor({ sellerId: SELLER }, { listingId: "L3" }),
      );
      assert.strictEqual(await savesFor("L3"), 0);
      assert.strictEqual((await statsOf(SELLER)).likes, 0);
    },
  );

  await check(
    "deleting a listing with several saves decrements by all of them",
    async () => {
      await seedListing("L4", SELLER, { saveCount: 3 });
      await seedSave(SAVER_A, "L4");
      await seedSave(SAVER_B, "L4");
      await seedSave("save-user-c", "L4");
      await db.doc(`sellerStats/${SELLER}`).set({ likes: 3 }, { merge: true });
      await index.cleanupDeletedListingSaves.run(
        eventFor({ sellerId: SELLER }, { listingId: "L4" }),
      );
      assert.strictEqual(await savesFor("L4"), 0);
      assert.strictEqual((await statsOf(SELLER)).likes, 0);
    },
  );

  await check("an unrelated seller's aggregate is untouched", async () => {
    await db.doc(`sellerStats/${OTHER_SELLER}`).set({ likes: 9 });
    await seedListing("L5", SELLER, { saveCount: 1 });
    await seedSave(SAVER_A, "L5");
    await db.doc(`sellerStats/${SELLER}`).set({ likes: 1 }, { merge: true });
    await index.cleanupDeletedListingSaves.run(
      eventFor({ sellerId: SELLER }, { listingId: "L5" }),
    );
    assert.strictEqual((await statsOf(OTHER_SELLER)).likes, 9);
  });

  // ── 13. Replay ───────────────────────────────────────────────────────
  await check(
    "a replayed cleanup removes zero and decrements by zero",
    async () => {
      await seedListing("L6", SELLER, { saveCount: 2 });
      await seedSave(SAVER_A, "L6");
      await seedSave(SAVER_B, "L6");
      await db.doc(`sellerStats/${SELLER}`).set({ likes: 2 }, { merge: true });
      const ev = eventFor({ sellerId: SELLER }, { listingId: "L6" });
      await index.cleanupDeletedListingSaves.run(ev);
      assert.strictEqual((await statsOf(SELLER)).likes, 0);
      await index.cleanupDeletedListingSaves.run(ev);
      assert.strictEqual((await statsOf(SELLER)).likes, 0);
      assert.strictEqual(await savesFor("L6"), 0);
    },
  );

  // ── 14. A stale saveCount must not be believed ───────────────────────
  //
  // This is the case that decides which number the decrement comes from.
  // The listing claims 50 saves and only 1 row exists; using saveCount
  // would wipe an aggregate that other listings legitimately contribute to.
  await check(
    "the decrement follows the rows removed, not a stale saveCount",
    async () => {
      await seedListing("L7", SELLER, { saveCount: 50 });
      await seedSave(SAVER_A, "L7");
      await db.doc(`sellerStats/${SELLER}`).set({ likes: 10 }, { merge: true });
      await index.cleanupDeletedListingSaves.run(
        eventFor({ sellerId: SELLER }, { listingId: "L7" }),
      );
      // 10 − 1 row actually removed, not 10 − 50 floored to 0.
      assert.strictEqual((await statsOf(SELLER)).likes, 9);
    },
  );

  // ── 15. More than one batch ──────────────────────────────────────────
  //
  // The production batch size is 300; proving the loop with 301 documents
  // would cost the emulator far more than it proves. The helper takes the
  // size as an argument for exactly this, and production calls it with the
  // default, so the loop under test is the loop that ships.
  await check("cleanup pages through more than one batch", async () => {
    await seedListing("L8", SELLER, { saveCount: 5 });
    for (const uid of ["b1", "b2", "b3", "b4", "b5"]) await seedSave(uid, "L8");
    await db.doc(`sellerStats/${SELLER}`).set({ likes: 5 }, { merge: true });
    const removed = await cleanupSavesForListing("L8", SELLER, { batchSize: 2 });
    assert.strictEqual(removed, 5);
    assert.strictEqual(await savesFor("L8"), 0);
    assert.strictEqual((await statsOf(SELLER)).likes, 0);
  });

  // ── 16. The race ─────────────────────────────────────────────────────
  //
  // An un-save and a listing deletion arriving together. Whichever order
  // they land in, the terminal state must be the same: no listing, no
  // favourites pointing at it, and an aggregate that was not decremented
  // twice for the same save.
  await check("un-save racing a listing deletion lands safely", async () => {
    await seedListing("L9", SELLER, { saveCount: 1 });
    await seedSave(SAVER_A, "L9");
    await db.doc(`sellerStats/${SELLER}`).set({ likes: 1 }, { merge: true });

    // The cleanup wins the race, then the per-row delete event arrives.
    await index.cleanupDeletedListingSaves.run(
      eventFor({ sellerId: SELLER }, { listingId: "L9" }),
    );
    await db.doc("listings/L9").delete();
    await index.onFavoriteDeleted.run(eventFor({ userId: SAVER_A, listingId: "L9" }));

    assert.strictEqual(await savesFor("L9"), 0);
    const likes = (await statsOf(SELLER)).likes;
    assert.strictEqual(likes, 0, `aggregate ended at ${likes}`);
    assert.ok(likes >= 0, "the aggregate went negative");
  });

  // ── 17-18. The two account-deletion directions ───────────────────────
  await check(
    "a saver leaving still decrements the surviving listing's seller",
    async () => {
      await seedListing("L10", OTHER_SELLER, { saveCount: 1 });
      await db.doc(`sellerStats/${OTHER_SELLER}`).set({ likes: 1 });
      // deleteAccount batch-deletes the saver's own favourites; each one
      // fires this handler, and the listing still exists.
      await index.onFavoriteDeleted.run(eventFor({ userId: SAVER_A, listingId: "L10" }));
      assert.strictEqual((await statsOf(OTHER_SELLER)).likes, 0);
      assert.strictEqual((await listingOf("L10")).saveCount, 0);
    },
  );
  await check(
    "a seller leaving leaves no received saves behind",
    async () => {
      await seedListing("L11", SELLER, { saveCount: 2 });
      await seedSave(SAVER_A, "L11");
      await seedSave(SAVER_B, "L11");
      // deleteAccount deletes the seller's listings; that fires the cleanup.
      await index.cleanupDeletedListingSaves.run(
        eventFor({ sellerId: SELLER }, { listingId: "L11" }),
      );
      assert.strictEqual(await savesFor("L11"), 0);
    },
  );

  // ── 19-20. The neighbouring counters ─────────────────────────────────
  await check("Profile Likes were never touched", async () => {
    assert.strictEqual((await statsOf(SELLER)).profileLikes, 5);
  });
  await check("Follow counters were never touched", async () => {
    const stats = await statsOf(SELLER);
    assert.strictEqual(stats.followers, 2);
    assert.strictEqual(stats.following, 1);
  });

  report("listing-save lifecycle cases");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
