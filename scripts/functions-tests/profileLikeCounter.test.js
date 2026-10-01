// The Profile Like counter, executed rather than reasoned about.
//
// The rules suite proves who may write a profileLikes document. It cannot
// prove what happens next, because the emulators it runs under are
// firestore/storage/auth — no Functions emulator — so the trigger never
// fires there. That left the one number this feature exists to move
// asserted only by reading the source.
//
// So the real exported handlers are invoked here the same way deleteAccount
// is: firebase-functions v2 gives every CloudFunction a `.run()`, which
// calls the production handler with a synthetic event. applyProfileLikeDelta
// and bumpSellerStat are the ones that run — nothing is reimplemented, and
// the arithmetic under test is the arithmetic that ships. What is skipped is
// Google's delivery of the event, which is not ours.
//
// The counter the dashboard shows is `profileLikes`. The counter beside it,
// `likes`, counts private listing saves and belongs to a different feature
// written under a different promise; several cases below exist only to
// prove this lifecycle never touches it.
const path = require("path");
const { check, report, assert } = require("./harness");

const FUNCTIONS = path.join(__dirname, "..", "..", "functions");

const SELLER = "counter-seller";
const LIKER_A = "counter-liker-a";
const LIKER_B = "counter-liker-b";

// A listing save seeded alongside, so "the other counters did not move" is
// measured rather than assumed.
const LISTING = "counter-listing";
const SEEDED_LIKES = 7;
const SEEDED_FOLLOWERS = 3;
const SEEDED_FOLLOWING = 2;
const SEEDED_SAVES = 4;

let admin;
let db;
let onProfileLikeCreated;
let onProfileLikeDeleted;

// The event shape the handler reads: `event.data?.data()`. Anything else on
// a real FirestoreEvent is untouched by this code path.
const eventFor = (data) => ({ data: { data: () => data } });

const statsOf = async () => (await db.doc(`sellerStats/${SELLER}`).get()).data() ?? {};
const listingOf = async () => (await db.doc(`listings/${LISTING}`).get()).data() ?? {};

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error(
      "FIRESTORE_EMULATOR_HOST is not set — refusing to run, because these " +
        "writes would otherwise land somewhere real.",
    );
    process.exit(1);
  }

  // index.js calls admin.initializeApp() itself, so it is required first and
  // the admin handle is taken from the same module instance afterwards.
  const index = require(path.join(FUNCTIONS, "index.js"));
  ({ onProfileLikeCreated, onProfileLikeDeleted } = index);
  admin = require(path.join(FUNCTIONS, "node_modules", "firebase-admin"));
  db = admin.firestore();

  // Deterministic start: a seller who already has the other three counters,
  // so a profile like moving one of them by accident is visible.
  await db.doc(`sellerStats/${SELLER}`).set({
    likes: SEEDED_LIKES,
    followers: SEEDED_FOLLOWERS,
    following: SEEDED_FOLLOWING,
  });
  await db.doc(`listings/${LISTING}`).set({
    sellerId: SELLER,
    status: "approved",
    saveCount: SEEDED_SAVES,
  });

  // ── 1. Nothing, then one ──────────────────────────────────────────────
  await check("a profile like takes the counter from absent to 1", async () => {
    await onProfileLikeCreated.run(
      eventFor({ likerId: LIKER_A, sellerId: SELLER }),
    );
    assert.strictEqual((await statsOf()).profileLikes, 1);
  });

  // ── 2. A second, independent liker ────────────────────────────────────
  await check("a second liker takes it to 2", async () => {
    await onProfileLikeCreated.run(
      eventFor({ likerId: LIKER_B, sellerId: SELLER }),
    );
    assert.strictEqual((await statsOf()).profileLikes, 2);
  });

  // ── 3-4. Taking them back ─────────────────────────────────────────────
  await check("removing one like takes it back to 1", async () => {
    await onProfileLikeDeleted.run(
      eventFor({ likerId: LIKER_B, sellerId: SELLER }),
    );
    assert.strictEqual((await statsOf()).profileLikes, 1);
  });
  await check("removing the last like takes it to 0", async () => {
    await onProfileLikeDeleted.run(
      eventFor({ likerId: LIKER_A, sellerId: SELLER }),
    );
    assert.strictEqual((await statsOf()).profileLikes, 0);
  });

  // ── 5. The floor ──────────────────────────────────────────────────────
  //
  // Triggers are at-least-once, so a delete can be replayed after the
  // counter has already reached zero. "-1 J'aime" must be unreachable.
  await check("a replayed delete cannot drive it negative", async () => {
    await onProfileLikeDeleted.run(
      eventFor({ likerId: LIKER_A, sellerId: SELLER }),
    );
    await onProfileLikeDeleted.run(
      eventFor({ likerId: LIKER_B, sellerId: SELLER }),
    );
    assert.strictEqual((await statsOf()).profileLikes, 0);
  });

  // ── 6-8. Data the rules would have refused ────────────────────────────
  //
  // The rules reject these, but a trigger must not depend on that: a row
  // written by a console, a migration or an older client reaches the same
  // handler, and a self-like would inflate one account's own number.
  await check("a self-like passed to the server does not count", async () => {
    await onProfileLikeCreated.run(
      eventFor({ likerId: SELLER, sellerId: SELLER }),
    );
    assert.strictEqual((await statsOf()).profileLikes, 0);
  });
  await check("a like with no liker does not count", async () => {
    await onProfileLikeCreated.run(eventFor({ sellerId: SELLER }));
    assert.strictEqual((await statsOf()).profileLikes, 0);
  });
  await check("a like with no seller does not count", async () => {
    await onProfileLikeCreated.run(eventFor({ likerId: LIKER_A }));
    assert.strictEqual((await statsOf()).profileLikes, 0);
  });

  // ── 9-11. The counters this lifecycle must never touch ────────────────
  await check(
    "the legacy listing-save counter was never modified",
    async () => {
      assert.strictEqual((await statsOf()).likes, SEEDED_LIKES);
    },
  );
  await check("the follow counters were never modified", async () => {
    const stats = await statsOf();
    assert.strictEqual(stats.followers, SEEDED_FOLLOWERS);
    assert.strictEqual(stats.following, SEEDED_FOLLOWING);
  });
  await check("the listing's own save count was never modified", async () => {
    assert.strictEqual((await listingOf()).saveCount, SEEDED_SAVES);
  });

  // And the other direction: the favourite lifecycle still moves the legacy
  // counter and leaves profileLikes alone, so the two are provably separate
  // rather than merely differently named.
  await check(
    "a listing save still moves `likes` and not `profileLikes`",
    async () => {
      await index.onFavoriteCreated.run(
        eventFor({ userId: LIKER_A, listingId: LISTING }),
      );
      const stats = await statsOf();
      assert.strictEqual(stats.likes, SEEDED_LIKES + 1);
      assert.strictEqual(stats.profileLikes, 0);
      assert.strictEqual((await listingOf()).saveCount, SEEDED_SAVES + 1);
    },
  );

  report("profile-like counter cases");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
