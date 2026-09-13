// Leaving, properly.
//
// There was no way out. No screen offered it, no function performed it, and
// deleting somebody from the Firebase console left their listings live in the
// market, their profile readable, their CVs in Storage and their follower
// counts pointing at an account that no longer existed. Apple has required
// in-app account deletion since 2022, so this is also a review gate — but the
// reason to do it properly is that half a deletion is worse than none: it
// leaves data belonging to a person who believes it is gone.
//
// ── The hard part is the conversations ──────────────────────────────────
//
// Everything else a person owns is theirs alone and can simply go. A
// conversation is not: it is one document and two people's record of the same
// exchange. Deleting the thread would reach into somebody else's inbox and
// remove what they were told, by whom, and what they agreed — including the
// evidence behind a rating, and including whatever a buyer needs if the deal
// went wrong.
//
// So conversations are ANONYMISED, not deleted. The departing person's name
// is removed, the thread is marked as having a departed participant, and the
// messages stay where the other person can still read them. That is the same
// answer every marketplace of this shape arrives at, and it is worth being
// explicit that it IS an answer rather than an omission: the alternative
// silently destroys a third party's records.
//
// The messages the leaver wrote stay too. They are half of a conversation the
// other person is entitled to keep, and a thread of one-sided replies to
// deleted questions is not privacy, it is vandalism.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

// How fresh the sign-in must be. Deleting an account is the most destructive
// thing this app can do, so it wants the same proof of presence the password
// reset does: a token minted minutes ago, not one cached since last week on a
// phone somebody left on a table.
const AUTH_TIME_MAX_AGE_SECONDS = 5 * 60;

const FIRESTORE_BATCH_LIMIT = 500;

// Collections holding documents that belong to exactly one person, keyed by
// the field naming them. Every one of these is safe to delete outright.
const OWNED_BY_FIELD = [
  ["listings", "sellerId"],
  ["favorites", "userId"],
  ["jobFavorites", "userId"],
  ["eventLikes", "userId"],
  ["eventReactions", "userId"],
  ["ratings", "raterId"],
  ["jobApplications", "applicantUid"],
  ["follows", "followerId"],
  // The other direction: rows where somebody followed THEM. The follow
  // belongs to the follower, but it points at an account that will not
  // exist, and onFollowDeleted decrements both counters correctly.
  ["follows", "sellerId"],
  ["ads", "advertiserId"],
  // ── Added in Phase E ────────────────────────────────────────────────
  //
  // The independent audit found four collections still holding the uid of a
  // deleted account, and it found them by inventorying the collections the
  // app writes rather than by reading this list — which is the right way
  // round, because 24 passing tests all asserted what deletion DOES and none
  // of them could notice what it omits.
  //
  // reports: the reporter's identity attached to somebody else's listing.
  // The document id is `${listingId}_${uid}`, so the uid survives in the KEY
  // even if the field is cleared — anonymising is not available here, only
  // deletion. The listing keeps its reportCount, so the moderation signal
  // survives the reporter.
  ["reports", "reporterId"],
  // dealershipSuggestions: a pending suggestion, unreviewed, tied to the
  // person who made it and of no value once they are gone.
  ["dealershipSuggestions", "submittedBy"],
  // The view/share/contact markers. They are the only record that a
  // particular person looked at a particular advert, which is exactly the
  // kind of row that should leave with them. The counts they produced stay
  // on the listing, aggregated and anonymous.
  ["counterMarkers", "uid"],
];

// Documents that must SURVIVE, with the departing person's identifier removed.
//
// carParks are community directory entries that other people rely on and
// other people's screens render. Deleting them because the submitter left
// would take public data away from everybody; keeping submittedBy would leave
// a dead uid pointing at a real person's contribution. So the entry stays and
// the name comes off, which is the same treatment conversations already get.
const ANONYMISE_BY_FIELD = [["carParks", "submittedBy"]];

// Shared two-party records keyed by an array of participants. `contacts`
// records that two people spoke, and it is what firestore.rules consults
// before letting somebody leave a rating. Once one side is deleted the pair
// no longer describes two reachable accounts, and the rating it authorised
// can no longer be left about anybody, so the row is removed rather than
// half-emptied.
const OWNED_BY_ARRAY = [["contacts", "participantIds"]];

// Documents whose id IS the uid.
const OWNED_BY_ID = ["sellers", "advertisers", "sellerStats", "verifiedCompanies"];

// Subcollections beneath sellers/{uid}. Named separately from OWNED_BY_ID
// because deleting the parent document leaves these untouched and reachable
// — Firestore has no cascade — so a name added to that list gets its
// subcollections deleted only if it also appears here.
const OWNED_SUBCOLLECTIONS = ["notifications"];

// Documents whose id EMBEDS the uid behind a prefix.
//
// placesQuota/u_{uid} was marked PRESERVE in Phase E on the grounds that it
// "expires on its own window". The re-audit checked: there was no TTL, and
// the window only resets on that user's next call — which never comes after
// the account is gone. So it kept the departing uid indefinitely. It now has
// a TTL, and it is deleted here as well rather than waited out.
const OWNED_BY_PREFIXED_ID = [["placesQuota", "u_"]];

// Storage prefixes the person owns outright.
const OWNED_PREFIXES = ["sellers/", "sellerVerificationDocs/", "jobApplicationCvs/", "listings/", "ads/"];

async function deleteQueryInBatches(db, query) {
  let removed = 0;
  // Paged rather than read-all: an account with two thousand favourites
  // would otherwise build a two-thousand-document array in memory before
  // deleting anything.
  for (;;) {
    const snapshot = await query.limit(FIRESTORE_BATCH_LIMIT).get();
    if (snapshot.empty) return removed;
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    removed += snapshot.size;
    if (snapshot.size < FIRESTORE_BATCH_LIMIT) return removed;
  }
}

exports.deleteAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first.");
  }
  const uid = request.auth.uid;

  // Presence, proved recently. request.auth.token carries auth_time from the
  // ID token the caller presented, so this is the same check
  // resetSellerPassword makes and needs no second round trip.
  const authTime = request.auth.token?.auth_time;
  const nowSeconds = Date.now() / 1000;
  if (!authTime || nowSeconds - authTime > AUTH_TIME_MAX_AGE_SECONDS) {
    throw new HttpsError(
      "failed-precondition",
      "Please sign in again before deleting your account.",
    );
  }

  const db = admin.firestore();
  const summary = {};

  // 1. Everything owned outright.
  //
  // Listings first and deliberately: deleting each one fires
  // cleanupDeletedListingMedia, which removes its photographs and
  // thumbnails. Doing it through the same trigger rather than by hand means
  // there is one implementation of "what a listing owns" and it is already
  // tested (scripts/check-storage-cleanup.js).
  for (const [collection, field] of OWNED_BY_FIELD) {
    try {
      const removed = await deleteQueryInBatches(
        db,
        db.collection(collection).where(field, "==", uid),
      );
      if (removed) summary[`${collection}.${field}`] = removed;
    } catch (error) {
      // One collection failing must not strand the rest half-deleted. The
      // caller is told the deletion is incomplete at the end.
      logger.error(`deleteAccount: ${collection}.${field} failed`, error);
      summary.errors = (summary.errors ?? 0) + 1;
    }
  }

  // 1b. Two-party rows where the uid sits inside an array.
  for (const [collection, field] of OWNED_BY_ARRAY) {
    try {
      const removed = await deleteQueryInBatches(
        db,
        db.collection(collection).where(field, "array-contains", uid),
      );
      if (removed) summary[`${collection}.${field}`] = removed;
    } catch (error) {
      logger.error(`deleteAccount: ${collection}.${field} failed`, error);
      summary.errors = (summary.errors ?? 0) + 1;
    }
  }

  // 1c. Public contributions that outlive their author.
  for (const [collection, field] of ANONYMISE_BY_FIELD) {
    try {
      let anonymised = 0;
      for (;;) {
        const snapshot = await db
          .collection(collection)
          .where(field, "==", uid)
          .limit(FIRESTORE_BATCH_LIMIT)
          .get();
        if (snapshot.empty) break;
        const batch = db.batch();
        snapshot.docs.forEach((doc) =>
          batch.update(doc.ref, {
            [field]: admin.firestore.FieldValue.delete(),
          }),
        );
        await batch.commit();
        anonymised += snapshot.size;
        if (snapshot.size < FIRESTORE_BATCH_LIMIT) break;
      }
      if (anonymised) summary[`${collection}.${field}.anonymised`] = anonymised;
    } catch (error) {
      logger.error(`deleteAccount: anonymising ${collection}.${field} failed`, error);
      summary.errors = (summary.errors ?? 0) + 1;
    }
  }

  for (const [collection, prefix] of OWNED_BY_PREFIXED_ID) {
    try {
      await db.collection(collection).doc(`${prefix}${uid}`).delete();
    } catch (error) {
      logger.error(`deleteAccount: ${collection}/${prefix}${uid} failed`, error);
      summary.errors = (summary.errors ?? 0) + 1;
    }
  }

  // 1d. Subcollections hanging off the person's own documents.
  //
  // Deleting a document does NOT delete anything beneath it — the parent
  // vanishes from every query and the subcollection stays behind, live,
  // reachable by path, holding whatever it held. So this has to run
  // explicitly, and it has to run BEFORE the loop below removes the parent,
  // or the rows are orphaned under a document that no longer exists and
  // nothing will ever look for them again.
  //
  // sellers/{uid}/notifications is the server's record of what it told this
  // person: roster drafts waiting, syncs that failed. Every row is about
  // them and addressed to them, so it goes with them.
  for (const subcollection of OWNED_SUBCOLLECTIONS) {
    try {
      const removed = await deleteQueryInBatches(
        db,
        db.collection("sellers").doc(uid).collection(subcollection),
      );
      if (removed) summary[`sellers.${subcollection}`] = removed;
    } catch (error) {
      logger.error(
        `deleteAccount: sellers/${uid}/${subcollection} failed`,
        error,
      );
      summary.errors = (summary.errors ?? 0) + 1;
    }
  }

  for (const collection of OWNED_BY_ID) {
    try {
      await db.collection(collection).doc(uid).delete();
    } catch (error) {
      logger.error(`deleteAccount: ${collection}/${uid} failed`, error);
      summary.errors = (summary.errors ?? 0) + 1;
    }
  }

  // 2. Conversations: anonymised, never removed. See the note at the top.
  try {
    const threads = await db
      .collection("conversations")
      .where("participantIds", "array-contains", uid)
      .get();
    for (let i = 0; i < threads.docs.length; i += FIRESTORE_BATCH_LIMIT) {
      const batch = db.batch();
      for (const thread of threads.docs.slice(i, i + FIRESTORE_BATCH_LIMIT)) {
        batch.update(thread.ref, {
          // participantIds is NOT changed. It is what the rules read to
          // decide who may open the thread, and removing the uid would not
          // protect anybody — the account is gone — while it WOULD break the
          // remaining person's access on a rule that checks membership.
          [`participantNames.${uid}`]: null,
          deletedParticipants: admin.firestore.FieldValue.arrayUnion(uid),
        });
      }
      await batch.commit();
    }
    summary.conversationsAnonymised = threads.size;
  } catch (error) {
    logger.error("deleteAccount: conversations failed", error);
    summary.errors = (summary.errors ?? 0) + 1;
  }

  // 3. Storage owned outright.
  //
  // Listing photographs are already gone via the delete trigger above; this
  // sweeps the prefix anyway, because a file whose listing was removed before
  // that trigger existed is exactly the orphan nothing else can find.
  //
  // Chat attachments are deliberately NOT swept: they are named after the
  // uploader but they live inside a conversation the other person keeps, and
  // deleting them would blank photographs out of somebody else's thread.
  const bucket = admin.storage().bucket();
  for (const prefix of OWNED_PREFIXES) {
    try {
      await bucket.deleteFiles({ prefix: `${prefix}${uid}/`, force: true });
    } catch (error) {
      logger.error(`deleteAccount: storage ${prefix}${uid}/ failed`, error);
      summary.errors = (summary.errors ?? 0) + 1;
    }
  }

  // 4. The auth account, last.
  //
  // Last on purpose: while it exists the person can sign in and try again, so
  // a failure anywhere above is recoverable. Delete it first and a partial
  // run leaves data belonging to somebody who can no longer reach it or ask
  // for it — the exact state this function exists to prevent.
  if (summary.errors) {
    logger.warn(`deleteAccount: ${uid} incomplete`, summary);
    throw new HttpsError(
      "internal",
      "Some of your data could not be removed. Nothing was lost — please try again.",
    );
  }

  try {
    await admin.auth().revokeRefreshTokens(uid);
    await admin.auth().deleteUser(uid);
  } catch (error) {
    logger.error(`deleteAccount: auth deletion failed for ${uid}`, error);
    throw new HttpsError("internal", "Could not finish deleting the account.");
  }

  logger.info(`deleteAccount: ${uid} removed`, summary);
  return { deleted: true, summary };
});
