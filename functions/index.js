const { onCall, HttpsError } = require("firebase-functions/v2/https");
const {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentUpdated,
  onDocumentWritten,
} = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
// Used by the moderator-queue paths and the claim sync below, and never
// imported until now — `logger` is not a global in the v2 runtime, so every
// one of those calls was a ReferenceError waiting on its branch. The one in
// moderatorPushTokens fires exactly when no moderators are configured,
// which is the moment somebody is trying to work out why no moderator was
// notified.
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { recordNotification } = require("./recordNotification");
// The document half of search. Twinned with src/utils/searchTokens.js and
// held in step by scripts/check-search-tokens.js.
const {
  searchTokensFor,
  searchTokensUnchanged,
  searchPairsFor,
  searchPairsUnchanged,
} = require("./searchTokens");

admin.initializeApp();

// Keep costs bounded on a low-traffic endpoint.
setGlobalOptions({ maxInstances: 10 });

exports.syncPharmacyRosters =
  require("./pharmacyRosterSync").syncPharmacyRosters;
exports.sendPaperReminders =
  require("./paperReminders").sendPaperReminders;
// The page a shared listing links to. Required after initializeApp above,
// like the two before it, because it reads Firestore on the first request.
exports.listingPage = require("./listingPage").listingPage;
exports.profilePage = require("./profilePage").profilePage;
// Google Places, called from a server that can hold a key — the app used
// to call it directly with a key EXPO_PUBLIC_ had inlined into the bundle.
exports.placesProxy = require("./placesProxy").placesProxy;
// The way out. Anonymises shared conversations rather than deleting them —
// see the note in the file for why that is a decision and not an omission.
exports.deleteAccount = require("./deleteAccount").deleteAccount;

const PSEUDO_EMAIL_DOMAIN = "chez-nous.app";
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 128;
// How long after the phone-OTP sign-in the resulting ID token is trusted for
// a password reset. Ties the reset tightly to the OTP flow that just ran.
const AUTH_TIME_MAX_AGE_SECONDS = 5 * 60;
const E164_RE = /^\+[1-9]\d{6,14}$/;

// The one country whose numbers may publish. Mirrors POSTING_DIAL in
// src/data/countries.js; both are checked against each other by
// scripts/check-posting-gate.js, because a disagreement between them would
// mean the app shows one rule and the server enforces another.
const POSTING_DIAL = "+229";

function phoneToPseudoEmail(e164Phone) {
  // Mirrors src/auth/phoneAuth.js#phoneToPseudoEmail exactly.
  return `${e164Phone.replace("+", "")}@${PSEUDO_EMAIL_DOMAIN}`;
}

exports.resetSellerPassword = onCall(async (request) => {
  const { idToken, newPassword } = request.data || {};

  if (typeof idToken !== "string" || !idToken) {
    throw new HttpsError("invalid-argument", "Missing verification token.");
  }
  if (
    typeof newPassword !== "string" ||
    newPassword.length < MIN_PASSWORD_LENGTH ||
    newPassword.length > MAX_PASSWORD_LENGTH
  ) {
    throw new HttpsError("invalid-argument", "Invalid password.");
  }

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    throw new HttpsError(
      "unauthenticated",
      "Invalid or expired verification token.",
    );
  }

  if (decodedToken.firebase?.sign_in_provider !== "phone") {
    throw new HttpsError("permission-denied", "Phone verification required.");
  }

  const phoneNumber = decodedToken.phone_number;
  if (!phoneNumber || !E164_RE.test(phoneNumber)) {
    throw new HttpsError(
      "permission-denied",
      "Missing or invalid phone number claim.",
    );
  }

  const authTimeSeconds = decodedToken.auth_time;
  const nowSeconds = Date.now() / 1000;
  if (
    !authTimeSeconds ||
    nowSeconds - authTimeSeconds > AUTH_TIME_MAX_AGE_SECONDS
  ) {
    throw new HttpsError(
      "deadline-exceeded",
      "Phone verification expired. Please verify again.",
    );
  }

  const pseudoEmail = phoneToPseudoEmail(phoneNumber);

  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(pseudoEmail);
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      throw new HttpsError(
        "not-found",
        "No seller account found for this phone number.",
      );
    }
    throw new HttpsError("internal", "Could not look up account.");
  }

  try {
    await admin.auth().updateUser(userRecord.uid, { password: newPassword });
    // Invalidate any other active sessions for this seller now that the
    // password has changed.
    await admin.auth().revokeRefreshTokens(userRecord.uid);
  } catch (error) {
    if (error.code === "auth/invalid-password") {
      throw new HttpsError("invalid-argument", "Invalid password.");
    }
    throw new HttpsError("internal", "Could not update password.");
  }

  return { success: true };
});

// Grants an account the right to publish, from a phone number Firebase
// verified rather than one somebody typed.
//
// Chez-Nous is open to the world to read and to Bénin to write. The client
// knows that rule too, but a client-side rule stops only the honest: anyone
// can talk to Firestore with the SDK. So the decision is recorded as a custom
// claim, which only this function can set, and the Firestore rules read the
// claim.
//
// What makes it worth anything is where the number comes from. The caller
// presents the ID token minted by the SMS step, and `phone_number` on a
// verified token is put there by Firebase after a code was delivered to that
// handset — it is not a field the caller chose. The account blessed is then
// the one derived from that same number, so verifying one number cannot
// grant another account anything.
//
// The gap this closes is real: before it, sign-up confirmed the code on the
// device and then threw the result away, so an account could be created for
// any number at all by calling Firebase directly and skipping the SMS.
exports.claimPhoneCountry = onCall(async (request) => {
  const { idToken } = request.data || {};

  if (typeof idToken !== "string" || !idToken) {
    throw new HttpsError("invalid-argument", "Missing verification token.");
  }

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    throw new HttpsError(
      "unauthenticated",
      "Invalid or expired verification token.",
    );
  }

  // An e-mail/password token would carry whatever address the account was
  // created with; only a phone sign-in proves a handset answered.
  if (decodedToken.firebase?.sign_in_provider !== "phone") {
    throw new HttpsError("permission-denied", "Phone verification required.");
  }

  const phoneNumber = decodedToken.phone_number;
  if (!phoneNumber || !E164_RE.test(phoneNumber)) {
    throw new HttpsError(
      "permission-denied",
      "Missing or invalid phone number claim.",
    );
  }

  // Same freshness window as the password reset: a token kept from last month
  // is not evidence that anyone holds the handset today.
  const authTimeSeconds = decodedToken.auth_time;
  const nowSeconds = Date.now() / 1000;
  if (
    !authTimeSeconds ||
    nowSeconds - authTimeSeconds > AUTH_TIME_MAX_AGE_SECONDS
  ) {
    throw new HttpsError(
      "deadline-exceeded",
      "Phone verification expired. Please verify again.",
    );
  }

  const pseudoEmail = phoneToPseudoEmail(phoneNumber);

  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(pseudoEmail);
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      throw new HttpsError(
        "not-found",
        "No account found for this phone number.",
      );
    }
    throw new HttpsError("internal", "Could not look up account.");
  }

  const canPost = phoneNumber.startsWith(POSTING_DIAL);

  try {
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      ...(userRecord.customClaims || {}),
      canPost,
      phoneVerified: true,
    });
  } catch (error) {
    throw new HttpsError("internal", "Could not record verification.");
  }

  // The caller has to refresh its ID token before Firestore sees this — a
  // claim set now is not in a token minted a minute ago.
  return { canPost };
});

// Names the account behind a phone number while it is being typed, so the
// person recovering can see they have reached the right one before they ask
// for a code — the "Compte trouvé" card in the design.
//
// This answers "does this number have an account, and whose?" to a caller who
// has proved nothing yet, which is an enumeration oracle by construction. Two
// things keep it from being a usable directory:
//
//   1. The name is abbreviated to a first name and an initial, never the full
//      legal name and never the phone number, e-mail or anything else on the
//      account.
//   2. Lookups are capped per caller IP per hour. A person recovering their
//      own account needs one or two; harvesting needs thousands.
//
// A company name is returned whole: it is already printed on every listing
// that company posts, so withholding it protects nothing.
// ── The recovery oracle, narrowed ──────────────────────────────────────
//
// This endpoint answers "does an account exist for this number, and whose is
// it" to anybody at all, with no authentication. It exists because somebody
// who has lost their password needs to confirm they are about to reset the
// right account before an SMS is spent — that is a real need and removing the
// endpoint would break recovery, which the brief forbids.
//
// What it does not need to do is help somebody walk a numbering plan. Three
// changes, none of which touch the honest path:
//
//   * The window is 5 rather than 20. A person recovering their own account
//     looks up one number, maybe twice. Twenty was sized for nothing.
//   * The surname initial is gone. "Kofi A." plus a phone number is a
//     stronger identifier than the owner needs to recognise themselves;
//     "Kofi" is enough, and it is what a stranger learns least from.
//   * A per-NUMBER window as well as a per-IP one. The IP limit is what
//     carrier-grade NAT makes weak, and the number limit is the dimension an
//     attacker cannot rotate: enumerating 10,000 numbers still needs 10,000
//     distinct addresses, but re-probing one number is now capped whatever
//     the address.
//
// Stated honestly: this narrows the oracle, it does not close it. Closing it
// means requiring the SMS challenge BEFORE confirming the account exists,
// which is a change to the recovery flow rather than to this function.
const LOOKUP_WINDOW_MS = 60 * 60 * 1000;
const LOOKUP_MAX_PER_WINDOW = 5;
const LOOKUP_MAX_PER_NUMBER = 3;

// First name only. Enough for the owner to recognise the account, and the
// least a stranger can learn from a number they do not own.
function abbreviateName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts[0] ?? "";
}

exports.lookupSellerForRecovery = onCall(async (request) => {
  const { phone } = request.data || {};
  if (typeof phone !== "string" || !E164_RE.test(phone)) {
    throw new HttpsError("invalid-argument", "Invalid phone number.");
  }

  const rawIp = request.rawRequest?.ip || "unknown";
  const ipKey = rawIp.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 128);
  const limitRef = admin.firestore().doc(`recoveryLookups/${ipKey}`);

  try {
    await admin.firestore().runTransaction(async (tx) => {
      const snap = await tx.get(limitRef);
      const now = Date.now();
      const windowStart = snap.exists ? (snap.data().windowStart ?? 0) : 0;
      const count = snap.exists ? (snap.data().count ?? 0) : 0;

      if (now - windowStart > LOOKUP_WINDOW_MS) {
        tx.set(limitRef, { windowStart: now, count: 1 });
        return;
      }
      if (count >= LOOKUP_MAX_PER_WINDOW) {
        throw new HttpsError(
          "resource-exhausted",
          "Too many lookups. Try again later.",
        );
      }
      tx.set(limitRef, { windowStart, count: count + 1 }, { merge: true });
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    // A failure to record the attempt must not open the gate.
    throw new HttpsError("internal", "Could not check the lookup limit.");
  }

  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(phoneToPseudoEmail(phone));
  } catch (error) {
    if (error.code === "auth/user-not-found") return { found: false };
    throw new HttpsError("internal", "Could not look up account.");
  }

  const sellerSnap = await admin
    .firestore()
    .doc(`sellers/${userRecord.uid}`)
    .get();
  const seller = sellerSnap.exists ? sellerSnap.data() : null;
  const createdAt = seller?.createdAt?.toDate?.() ?? null;

  return {
    found: true,
    name:
      seller?.companyName ||
      abbreviateName(seller?.fullName || userRecord.displayName),
    // Year only, never the exact signup date.
    memberSince: createdAt ? createdAt.getFullYear() : null,
  };
});

// The id the app creates in ensureNotificationChannels() at DEFAULT
// importance with sound and vibration. It has to match that string exactly:
// naming a channel Android has never been told about is the same as naming
// none, and lands the notification back in FCM's fallback channel.
const MESSAGES_CHANNEL = "messages";

exports.sendMessagePush = onDocumentCreated(
  "conversations/{conversationId}/messages/{messageId}",
  async (event) => {
    const message = event.data?.data();
    if (!message) return;

    const { conversationId } = event.params;
    const conversationSnap = await admin
      .firestore()
      .doc(`conversations/${conversationId}`)
      .get();
    if (!conversationSnap.exists) return;

    const conversation = conversationSnap.data();
    const recipientUid = conversation.participantIds.find(
      (id) => id !== message.senderId,
    );
    if (!recipientUid) return;

    // Don't notify if either side has blocked this conversation.
    if (
      conversation.blockedBy?.[recipientUid] ||
      conversation.blockedBy?.[message.senderId]
    )
      return;

    const [recipientSnap, senderSnap] = await Promise.all([
      admin.firestore().doc(`sellers/${recipientUid}`).get(),
      admin.firestore().doc(`sellers/${message.senderId}`).get(),
    ]);

    const pushToken = recipientSnap.exists
      ? recipientSnap.data().pushToken
      : null;
    if (!pushToken) return;

    const senderName = senderSnap.exists ? senderSnap.data().fullName : null;
    const body =
      message.text ||
      (message.imageUrl
        ? "📷 Photo"
        : message.audioUrl
          ? "🎤 Voice message"
          : "New message");

    try {
      await admin.messaging().send({
        token: pushToken,
        notification: {
          title: senderName || "New message",
          body,
        },
        data: {
          conversationId,
          listingTitle: conversation.listingTitle || "",
        },
        // Without an explicit channelId, Android files the notification
        // under fcm_fallback_notification_channel — a channel FCM invents,
        // named "Miscellaneous" in the system UI. Two consequences, both
        // observed on a physical device: the `messages` channel the app
        // creates at DEFAULT importance with sound and vibration is
        // bypassed entirely, and a reader who wants to silence marketplace
        // chatter without silencing everything has nothing to switch off,
        // because the channel they would look for is never the one being
        // used.
        //
        // paperReminders.js has always set this. Message pushes did not,
        // which is why they were the ones landing in the fallback.
        android: {
          priority: "high",
          notification: {
            channelId: MESSAGES_CHANNEL,
            sound: "default",
            defaultVibrateTimings: true,
          },
        },
        apns: {
          payload: { aps: { sound: "default" } },
        },
      });
    } catch (error) {
      // Token is no longer valid (app uninstalled, etc.) — drop it so we stop
      // trying to send to it.
      if (
        error.code === "messaging/invalid-registration-token" ||
        error.code === "messaging/registration-token-not-registered"
      ) {
        await admin.firestore().doc(`sellers/${recipientUid}`).update({
          pushToken: admin.firestore.FieldValue.delete(),
        });
      }
    }
  },
);

// The moderation gate, and who skips it.
//
// Every listing is created 'pending' — firestore.rules pins it there, so no
// client can publish itself. This decides what happens next:
//
//   verified company  -> published immediately
//   everyone else     -> stays pending for manual review
//
// The split is deliberate. Pre-moderating everything is the safe default
// while volume is low, but latency is what kills a marketplace: a seller
// who posts and sees nothing concludes the app is broken. A verified
// company has already had its RCCM and IFU checked against the national
// registry by a human — a far stronger identity test than reading its
// listing would be — so making it wait again buys nothing, and it gives the
// badge a concrete reward beyond a checkmark.
//
// Flipping the status here fires notifyListingModerated, which stamps
// `approvedAt` and tells the seller, so an auto-published listing reaches
// the feeds by exactly the same path a hand-approved one does.
exports.autoPublishVerifiedCompanyListing = onDocumentCreated(
  "listings/{listingId}",
  async (event) => {
    const listing = event.data?.data();
    if (!listing?.sellerId) return;
    // Never override a status someone else already set.
    if (listing.status !== "pending") return;

    const sellerSnap = await admin
      .firestore()
      .doc(`sellers/${listing.sellerId}`)
      .get();
    if (!sellerSnap.exists) return;
    const seller = sellerSnap.data();

    const isVerifiedCompany =
      seller.accountType === "company" &&
      seller.verificationStatus === "verified";
    if (!isVerifiedCompany) return;

    // The badge is stamped here now, not copied from the phone.
    //
    // CreateListingScreen still writes sellerVerified, and firestore.rules
    // now refuses it as anything but false — because it was the one claim
    // in the app that means "a human checked this against the national
    // registry", and it was being asserted by the account being checked.
    // Removing the client's ability to set it would have quietly broken
    // the badge for the sellers who have actually earned it: a verified
    // company's new listing would publish stamped false and stay that way,
    // since backfillVerifiedBadge only runs on the verification
    // transition, which for them already happened.
    //
    // So the same read of the seller document that decides auto-publishing
    // decides the badge, in the same write. `verified` is the second copy
    // of the same fact on a job post — the shape backfillVerifiedBadge
    // already uses, kept identical so the two cannot disagree.
    const badge = { sellerVerified: true };
    if (listing.categoryKey === "jobs") badge.verified = true;

    await event.data.ref.update({ status: "approved", ...badge });
  },
);

// The words a listing can be found by, written by the server.
//
// ── Why this is a trigger and not a field the app writes ────────────────
//
// The app could produce these tokens itself and firestore.rules could check
// their length and type. What no rule can check is that they came from the
// title: `array-contains` does not care where a word came from, so a client
// that writes its own tokens can put "toyota", "corolla" and "iphone" on a
// listing for a broken chair and appear in all three searches. That is
// keyword stuffing, it is the oldest abuse a marketplace search invites, and
// it is invisible in moderation because the moderator reads the title.
//
// So the rules refuse a client-written searchTokens entirely — the same shape
// as sellerVerified in Phase A — and this writes it from the document the
// moderator actually read.
//
// ── The latency costs nothing, and that is not a coincidence ────────────
//
// A listing is created `pending`, and search only ever queries
// `status == "approved"`. So a listing is not searchable until a moderator
// (or autoPublishVerifiedCompanyListing) approves it, which is minutes or
// hours after this trigger has run. The seconds this takes are invisible.
//
// ── Why it compares before writing ──────────────────────────────────────
//
// This fires on every write to a listing, including its own. Writing
// unconditionally would re-trigger itself once and settle — harmless but
// wasteful — and, worse, every unrelated edit would cost a second write.
// searchTokensUnchanged is what makes it a no-op for the writes that do not
// change any searchable field, which is most of them: a price drop, a
// saleStatus, a view counter.
exports.syncListingSearchTokens = onDocumentWritten(
  "listings/{listingId}",
  async (event) => {
    const after = event.data?.after;
    // Deleted. Nothing to tokenise, and cleanupDeletedListingMedia is already
    // handling what deletion means.
    if (!after?.exists) return;

    const listing = after.data();
    // Compared separately, not together. Both arrays derive from the same
    // words, so a single "unchanged?" test would skip a document written
    // before searchPairs existed — its tokens already match, and its pairs
    // are missing entirely. That is exactly the back catalogue.
    const tokensStale = !searchTokensUnchanged(listing, listing.searchTokens);
    const pairsStale = !searchPairsUnchanged(listing, listing.searchPairs);
    if (!tokensStale && !pairsStale) return;

    const update = {};
    if (tokensStale) update.searchTokens = searchTokensFor(listing);
    if (pairsStale) update.searchPairs = searchPairsFor(listing);
    // update(), not set(merge): this must never create a document, and a
    // listing deleted between the event and this line should fail rather than
    // be resurrected as a husk carrying nothing but tokens.
    await after.ref.update(update).catch((error) => {
      // NOT_FOUND is the ordinary race above and is not worth a log line.
      if (error?.code === 5) return;
      logger.warn(
        `search metadata not written for ${event.params.listingId}`,
        error?.code ?? error,
      );
    });
  },
);

// The seller half of moderation. A listing sits at 'pending' until someone
// runs scripts/moderateListing.js, and until this existed the person who
// posted it was never told the outcome either way — they had to keep
// reopening the app to find out. It fires on both outcomes for that reason.
//
// This replaced a broadcast that pushed every newly approved listing to
// every registered device. That was survivable only while nothing was ever
// approved; with a queue now being drained by hand, working through twenty
// listings in one sitting would have sent twenty notifications to the
// entire user base. Discovery of new listings is already covered in-app
// without interrupting anyone — useNewListingsFeed orders by `approvedAt`
// and useNotificationsSeen filters against the viewer's own
// notificationsLastSeenAt — so dropping the broadcast costs nothing there,
// and removes a full `sellers` collection scan per approval.
// The people who pressed Suivre on this seller, told when the seller
// publishes.
//
// This is the targeted replacement for the broadcast removed above: fan-out
// is bounded by one seller's followers instead of the entire `sellers`
// collection, and it is opt-in, so nobody is interrupted who did not ask to
// hear from this person.
//
// Kept as its own trigger rather than folded into notifyListingModerated,
// because that one returns early when the *seller* has no push token — and
// a seller with notifications off must not silence their followers.
exports.notifyFollowersOfNewListing = onDocumentUpdated(
  "listings/{listingId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    // Only the moment a listing becomes visible. Later edits to an
    // already-approved listing are not a new post.
    if (before.status === after.status) return;
    if (after.status !== "approved") return;
    if (!after.sellerId) return;

    // ── E14: bounded fan-out ─────────────────────────────────────────
    //
    // This read every follow row for the seller with no limit, then every
    // follower's profile, then multicast — all inside one trigger with a
    // default timeout. Nothing in the app has enough followers for that to
    // matter today, which is exactly why it would have been discovered by a
    // seller with a real audience rather than by a test.
    //
    // The cliff is not gradual: at some follower count the function stops
    // mid-fan-out, and what arrives is a partial delivery with no record of
    // where it stopped. A retry then re-notifies everyone it already reached.
    //
    // A cap rather than a queue. A queue (Tasks, or a paging state document)
    // is the right shape at a size this app is nowhere near, and it is a new
    // piece of infrastructure to run and to reason about. FOLLOWER_FANOUT_CAP
    // makes the failure explicit instead: the newest followers are notified,
    // the overflow is logged with a number, and that log line is the signal
    // to build the queue — a decision made from a real figure rather than a
    // guess.
    const FOLLOWER_FANOUT_CAP = 2000;
    const follows = admin.firestore().collection("follows");

    // Two bounded queries, because orderBy silently excludes what it cannot
    // sort.
    //
    // The cap needs an order to be meaningful — "the newest 2,000" rather
    // than an arbitrary 2,000 — but a Firestore orderBy drops every document
    // missing the field entirely. firestore.rules now requires createdAt on
    // every new follow, so no NEW row can have the problem; rows written
    // before that rule can, and quietly losing a seller's oldest followers
    // is exactly the kind of thing nobody would ever notice.
    //
    // So the ordered query is joined by an unordered sweep, which sees
    // everything including the legacy rows, and the two are merged by id.
    // Both are bounded, so the fan-out is still capped.
    //
    // The sweep exists only until the legacy rows are gone. Once a backfill
    // has stamped createdAt on every follow, this second query and the merge
    // can be deleted.
    const [orderedSnap, sweepSnap] = await Promise.all([
      follows
        .where("sellerId", "==", after.sellerId)
        .orderBy("createdAt", "desc")
        .limit(FOLLOWER_FANOUT_CAP + 1)
        .get(),
      follows
        .where("sellerId", "==", after.sellerId)
        .limit(FOLLOWER_FANOUT_CAP + 1)
        .get(),
    ]);

    const merged = new Map();
    for (const doc of [...orderedSnap.docs, ...sweepSnap.docs]) {
      if (!merged.has(doc.id)) merged.set(doc.id, doc);
    }
    const followsSnap = {
      docs: [...merged.values()],
      size: merged.size,
      empty: merged.size === 0,
    };
    const legacy = sweepSnap.docs.filter((d) => !d.data().createdAt).length;
    if (legacy) {
      logger.info(
        `notifyFollowersOfNewListing: ${legacy} follow row(s) for ` +
          `${after.sellerId} predate createdAt and were caught by the sweep. ` +
          `Backfill them and this second query can go.`,
      );
    }
    if (followsSnap.empty) return;

    if (followsSnap.size > FOLLOWER_FANOUT_CAP) {
      logger.warn(
        `notifyFollowersOfNewListing: seller ${after.sellerId} has more than ` +
          `${FOLLOWER_FANOUT_CAP} followers. The newest ${FOLLOWER_FANOUT_CAP} ` +
          `were notified. This is the point at which the fan-out needs a ` +
          `queue rather than a cap.`,
      );
    }

    const followerIds = [
      ...new Set(
        followsSnap.docs
          .map((doc) => doc.data().followerId)
          // Self-follows are rejected by the rules, but a stale row must
          // never make a seller notify themselves about their own listing.
          .filter((id) => id && id !== after.sellerId),
      ),
    ];
    if (!followerIds.length) return;

    // getAll in batches rather than one read per follower: a seller with
    // 300 followers would otherwise cost 300 round trips per publish.
    const tokensByUid = new Map();
    for (let i = 0; i < followerIds.length; i += 200) {
      const batch = followerIds.slice(i, i + 200);
      const snaps = await admin
        .firestore()
        .getAll(...batch.map((id) => admin.firestore().doc(`sellers/${id}`)));
      snaps.forEach((snap, index) => {
        const token = snap.exists ? snap.data().pushToken : null;
        if (token) tokensByUid.set(batch[index], token);
      });
    }
    if (!tokensByUid.size) return;

    const title =
      after.titleFr || after.titleEn || after.title || "Nouvelle annonce";
    const sellerName = after.sellerName || "Un vendeur que vous suivez";
    const entries = [...tokensByUid.entries()];

    // FCM caps a multicast at 500 tokens.
    for (let i = 0; i < entries.length; i += 500) {
      const chunk = entries.slice(i, i + 500);
      let response;
      try {
        response = await admin.messaging().sendEachForMulticast({
          tokens: chunk.map(([, token]) => token),
          notification: {
            title: `${sellerName} a publi\u00e9 une annonce`,
            body: title,
          },
          data: {
            type: "followedSellerListing",
            listingId: event.params.listingId,
          },
        });
      } catch (error) {
        // One bad chunk must not stop the rest of the followers being told.
        console.error("notifyFollowersOfNewListing send failed", error);
        continue;
      }

      // Same pruning the seller notification does: a token that the device
      // has thrown away is dead weight on every future publish.
      await Promise.all(
        response.responses.map((result, index) => {
          const code = result.error?.code;
          if (
            code !== "messaging/invalid-registration-token" &&
            code !== "messaging/registration-token-not-registered"
          ) {
            return null;
          }
          return admin
            .firestore()
            .doc(`sellers/${chunk[index][0]}`)
            .update({ pushToken: admin.firestore.FieldValue.delete() })
            .catch(() => {});
        }),
      );
    }
  },
);

// Telling the moderator there is something to moderate.
//
// Publishing wrote status:"pending" and then told nobody. The only way to
// learn a listing was waiting was to run --list-pending on a laptop, so a
// mechanic who posted at nine in the evening was live the next time somebody
// happened to check. Three listing pushes already existed and all three point
// away from the moderator: the seller hears when they are approved, followers
// hear when one goes live.
//
// Routed by the moderator role rather than by a named account. The claim is
// what actually authorises approving, so the notification follows the same
// list — grant a second moderator and they start hearing about it without
// anybody remembering to update a config document.
const MODERATOR_NOTIFY_WINDOW_MS = 10 * 60 * 1000;

async function moderatorPushTokens() {
  const db = admin.firestore();
  const snap = await db.doc("appConfig/moderators").get();
  const uids = snap.exists ? (snap.data().uids ?? []) : [];
  if (!uids.length) {
    logger.info("No moderators configured — skipping review notification.");
    return [];
  }

  const sellers = await Promise.all(
    uids.map((uid) => db.doc(`sellers/${uid}`).get()),
  );
  // The language travels with the token now, because the text is chosen per
  // recipient rather than once for everybody. See localeOf().
  return sellers
    .map((doc) =>
      doc.exists && doc.data().pushToken
        ? { token: doc.data().pushToken, language: localeOf(doc.data()) }
        : null,
    )
    .filter(Boolean);
}

// Which language to write a push in.
//
// A moderator using the app in English received "Nouvelle annonce à valider
// — … attend votre validation.": an entirely French notification, in an
// English app, from a server that had never been told which language the
// reader uses. That was the actual defect. The strings were not missing —
// the recipient's locale simply did not exist anywhere the server could
// read it, because the preference lived only in AsyncStorage on the handset.
//
// sellers/{uid}.language is written by the client whenever the language is
// chosen or the user signs in, which is what makes this possible at all.
// Absent for anyone who has not opened the app since that shipped, so the
// fallback is French: it is what these notifications have always been, and
// it is the majority language of the readership.
function localeOf(seller) {
  return seller?.language === "en" ? "en" : "fr";
}

// A seller correcting three listings in a row should not buzz three times.
// The count travels in the message, so a suppressed push is not a lost one —
// the next notification names the whole queue.
async function shouldNotifyNow(db) {
  const ref = db.doc("appConfig/moderatorNotifyState");
  const snap = await ref.get();
  const lastSentAt = snap.exists ? snap.data().lastSentAt?.toMillis?.() : null;
  if (lastSentAt && Date.now() - lastSentAt < MODERATOR_NOTIFY_WINDOW_MS) {
    return false;
  }
  await ref.set(
    { lastSentAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true },
  );
  return true;
}

// `arrival` says how the listing got here: "new", "edited" (an approved
// listing pulled back by a material change) or "resubmitted" (a rejected one
// answered). It was a boolean while there were two of those, and the third
// is not a shade of either — a resubmission is the one arrival a moderator
// has already ruled on, and the only one where the card carries a note in
// their own words.
async function notifyModeratorOfQueue(listing, listingId, arrival) {
  const db = admin.firestore();

  const tokens = await moderatorPushTokens();
  if (!tokens.length) return;
  if (!(await shouldNotifyNow(db))) {
    logger.info(`Review push suppressed (within window) for ${listingId}.`);
    return;
  }

  // Counted, never guessed: the number in the notification is the number of
  // documents actually waiting.
  const pending = await db
    .collection("listings")
    .where("status", "==", "pending")
    .count()
    .get();
  const waiting = pending.data().count;

  await Promise.all(
    tokens.map(({ token, language }) => {
      const copy = MODERATION_PUSH_COPY[language];
      // The listing's own title follows the reader too where both exist —
      // a French moderator should not be shown the English title of a
      // bilingual listing just because that field happened to be set first.
      const title =
        (language === "en"
          ? listing.titleEn || listing.titleFr
          : listing.titleFr || listing.titleEn) || copy.untitled;

      return admin
        .messaging()
        .send({
          token,
          notification: {
            title: copy.arrival[arrival] ?? copy.arrival.new,
            body:
              waiting > 1
                ? copy.bodyMany(title, waiting)
                : copy.bodyOne(title),
          },
          data: { type: "listingPendingReview", listingId },
        })
        .catch((error) =>
          logger.warn("Review push failed", error?.code ?? error),
        );
    }),
  );
}

// Kept beside the sender rather than in a shared bundle: these are the only
// server-composed strings a reader ever sees, and two languages of four
// lines each does not need an i18n framework on the backend. If a third
// language or a second notification family arrives, this is the seam to
// widen — not a reason to widen it now.
const MODERATION_PUSH_COPY = {
  fr: {
    untitled: "Annonce",
    arrival: {
      new: "Nouvelle annonce à valider",
      edited: "Annonce modifiée à revoir",
      resubmitted: "Annonce corrigée à revoir",
    },
    bodyOne: (title) => `${title} attend votre validation.`,
    bodyMany: (title, waiting) =>
      `${title} · ${waiting} annonces en attente de validation.`,
  },
  en: {
    untitled: "Listing",
    arrival: {
      new: "New listing to review",
      edited: "Edited listing to review",
      resubmitted: "Corrected listing to review",
    },
    bodyOne: (title) => `${title} is waiting for your review.`,
    bodyMany: (title, waiting) =>
      `${title} · ${waiting} listings waiting for review.`,
  },
};

// One list of moderators, and the claim that actually gates them, kept in
// step by the same write.
//
// There were two answers to "is this person a moderator" and nothing held
// them together. The review push reads appConfig/moderators.uids; every
// rule in firestore.rules, and every gate in the app, reads the `moderator`
// custom claim on the ID token. Adding a uid to the array bought a
// notification and nothing else — so a moderator was told an listing was
// waiting, opened the app, and was offered no way to approve or deny it.
// Reported, reasonably, as the buttons being missing.
//
// The array stays the place a human edits, because it is a document you can
// read and audit. The claim is derived from it here, so the two cannot
// drift: granting is now one edit, and revoking is deleting a uid from the
// same line.
//
// setCustomUserClaims replaces the whole claims object, so existing claims
// are read and merged rather than overwritten — an account that is both a
// moderator and something else must not lose the something else.
exports.syncModeratorClaims = onDocumentWritten(
  "appConfig/moderators",
  async (event) => {
    const before = event.data?.before?.data()?.uids ?? [];
    const after = event.data?.after?.data()?.uids ?? [];

    const granted = after.filter((uid) => !before.includes(uid));
    const revoked = before.filter((uid) => !after.includes(uid));
    if (!granted.length && !revoked.length) return;

    const apply = async (uid, isModerator) => {
      try {
        const user = await admin.auth().getUser(uid);
        const claims = { ...(user.customClaims ?? {}) };
        if (isModerator) {
          claims.moderator = true;
        } else {
          delete claims.moderator;
        }
        await admin.auth().setCustomUserClaims(uid, claims);
        // The token on the device does not carry the new claim until it
        // refreshes. revokeRefreshTokens forces that to happen rather than
        // leaving somebody waiting up to an hour to be able to moderate —
        // or, on a revoke, still able to.
        await admin.auth().revokeRefreshTokens(uid);
        logger.info(
          `Moderator claim ${isModerator ? "granted to" : "revoked from"} ${uid}.`,
        );
      } catch (error) {
        // A uid that is not a real account is a typo in the list, not a
        // reason to abandon the rest of it.
        logger.warn(
          `Could not set moderator claim for ${uid}`,
          error?.code ?? error,
        );
      }
    };

    await Promise.all([
      ...granted.map((uid) => apply(uid, true)),
      ...revoked.map((uid) => apply(uid, false)),
    ]);
  },
);

exports.notifyModeratorOfNewListing = onDocumentCreated(
  "listings/{listingId}",
  async (event) => {
    const listing = event.data?.data();
    if (listing?.status !== "pending") return;
    if (!listing.sellerId) return;

    // A verified company's listing is approved moments from now by
    // autoPublishVerifiedCompanyListing, which runs on this same event.
    // Checking the same condition here rather than racing it keeps the
    // moderator from being called to a queue that empties itself.
    const sellerSnap = await admin
      .firestore()
      .doc(`sellers/${listing.sellerId}`)
      .get();
    const seller = sellerSnap.exists ? sellerSnap.data() : null;
    if (
      seller?.accountType === "company" &&
      seller?.verificationStatus === "verified"
    ) {
      return;
    }

    await notifyModeratorOfQueue(listing, event.params.listingId, "new");
  },
);

// A material edit sends an approved listing back to pending, and that was as
// silent as a new one — arguably worse, because the listing stays visible in
// its old form until somebody looks.
//
// A rejected listing that its seller has fixed arrives the same way and was
// missed for the same reason: this trigger asked for before.status ===
// 'approved', which is exactly the one path that existed when it was
// written. Without this, the way back out of a rejection ends in a queue
// nobody is called to — the seller is told their correction is in review,
// and it waits until a moderator happens to open the screen. That is the
// failure the seller is least able to see and least able to chase.
exports.notifyModeratorOfEditedListing = onDocumentUpdated(
  "listings/{listingId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    if (after.status !== "pending") return;
    if (before.status !== "approved" && before.status !== "rejected") return;

    await notifyModeratorOfQueue(
      after,
      event.params.listingId,
      before.status === "rejected" ? "resubmitted" : "edited",
    );
  },
);

exports.notifyListingModerated = onDocumentUpdated(
  "listings/{listingId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    if (before.status === after.status) return;

    const approved = after.status === "approved";
    if (!approved && after.status !== "rejected") return;

    const { listingId } = event.params;

    // Stamped independently of whether the push below succeeds — the in-app
    // feed orders and filters off this field, not off push delivery, so it
    // has to land even for a seller with no token.
    if (approved) {
      await event.data.after.ref.update({
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    if (!after.sellerId) return;
    const sellerSnap = await admin
      .firestore()
      .doc(`sellers/${after.sellerId}`)
      .get();
    const pushToken = sellerSnap.exists ? sellerSnap.data().pushToken : null;
    if (!pushToken) return;

    const title =
      after.titleFr || after.titleEn || after.title || "Votre annonce";

    try {
      await admin.messaging().send({
        token: pushToken,
        notification: approved
          ? {
              title: "Annonce en ligne",
              body: `${title} est maintenant visible par les acheteurs.`,
            }
          : {
              title: "Annonce refus\u00e9e",
              body: after.moderationNote
                ? `${title} : ${after.moderationNote}`
                : `${title} n\u2019a pas \u00e9t\u00e9 approuv\u00e9e. Ouvrez Mes annonces pour la corriger.`,
            },
        data: {
          type: approved ? "listingApproved" : "listingRejected",
          listingId,
        },
      });
    } catch (error) {
      if (
        error.code === "messaging/invalid-registration-token" ||
        error.code === "messaging/registration-token-not-registered"
      ) {
        await admin.firestore().doc(`sellers/${after.sellerId}`).update({
          pushToken: admin.firestore.FieldValue.delete(),
        });
      }
    }
  },
);

// Notifies a job poster the moment someone applies to one of their real
// listings — the counterpart to notifyListingModerated, but targeted
// (one employer) rather than broadcast, since an application is only ever
// relevant to the specific person who posted that job.
exports.notifyNewJobApplication = onDocumentCreated(
  "jobApplications/{applicationId}",
  async (event) => {
    const application = event.data?.data();
    if (!application?.employerUid) return;

    const employerSnap = await admin
      .firestore()
      .doc(`sellers/${application.employerUid}`)
      .get();
    const pushToken = employerSnap.exists
      ? employerSnap.data().pushToken
      : null;
    if (!pushToken) return;

    const applicantName = application.applicantName?.trim() || "Quelqu’un";
    const jobTitle = application.jobTitle || "votre offre";

    try {
      await admin.messaging().send({
        token: pushToken,
        notification: {
          title: "Nouvelle candidature",
          body: `${applicantName} a postulé pour ${jobTitle}`,
        },
        data: {
          type: "newJobApplication",
          jobId: application.jobId || "",
        },
      });
    } catch (error) {
      if (
        error.code === "messaging/invalid-registration-token" ||
        error.code === "messaging/registration-token-not-registered"
      ) {
        await admin
          .firestore()
          .doc(`sellers/${application.employerUid}`)
          .update({
            pushToken: admin.firestore.FieldValue.delete(),
          });
      }
    }
  },
);

// Every file a listing owns, from whichever of the four fields holds it.
//
// A listing's media has accumulated shapes: `mediaPath` is the cover, `media`
// is the ordered array each entry of which carries its own `mediaPath` and
// `thumbPath`, and `thumbUrl`/`thumbPath` at the top level is the cover's
// small copy. Anything that cleans up has to know all four, and the client's
// delete knew two — which is why every thumbnail ever generated outlived its
// listing.
function listingStoragePaths(listing) {
  const paths = [listing?.mediaPath, listing?.thumbPath];
  for (const item of Array.isArray(listing?.media) ? listing.media : []) {
    paths.push(item?.mediaPath, item?.thumbPath);
  }
  // Deduplicated because the cover is also the first entry of `media`, so
  // every listing names its own cover twice.
  return [...new Set(paths.filter((path) => typeof path === "string" && path))];
}

// Delete the files a listing owned, wherever the deletion came from.
//
// Cleanup lived in MyListingsScreen and therefore only ran when a seller
// pressed Supprimer in the app. A listing removed from the console, by a
// script, or by any future admin tool left its photographs in the bucket
// forever — unreferenced, so not findable again without walking the whole
// bucket. This runs on the document event, so it covers all of those.
//
// It also fixes the ordering. The client deleted the FILES first and the
// document second, so a delete that failed halfway left a live listing whose
// photographs had already gone: a card in the market with broken images.
// Doing it here means the document goes first by construction.
//
// Idempotent on purpose. Storage answers 404 for a file already gone, and
// this treats that as success — a retried event, or a client that managed to
// delete some files before the document write landed, must not turn into a
// failed function that retries forever.
exports.cleanupDeletedListingMedia = onDocumentDeleted(
  "listings/{listingId}",
  async (event) => {
    const listing = event.data?.data();
    const paths = listingStoragePaths(listing);
    if (!paths.length) return;

    const bucket = admin.storage().bucket();
    const results = await Promise.allSettled(
      paths.map((path) => bucket.file(path).delete({ ignoreNotFound: true })),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    logger.info(
      `Listing ${event.params.listingId} deleted: removed ${
        paths.length - failed
      }/${paths.length} stored files.`,
    );
    if (failed) {
      // Logged rather than thrown: a retry would re-delete the files that
      // did succeed, which is harmless, but the listing is already gone and
      // a function that keeps failing is noise on a dashboard rather than a
      // problem anybody can act on.
      logger.warn(
        `Listing ${event.params.listingId}: ${failed} file(s) could not be ` +
          `removed and are now orphaned.`,
      );
    }
  },
);

// ── Chat attachments, when a message is tombstoned ──────────────────────
//
// Deleting a message used to leave its photograph or voice note in the
// bucket forever. Nothing referenced the file afterwards, so it could not be
// found again without walking the whole bucket, and nothing ever did. That
// orphan predates tombstoning — the old hard delete had the same hole — and
// this is where it gets closed.
//
// A message stores only the download URL. Unlike a listing, which carries
// its own `mediaPath`, there is no stored path to trust, so the path has to
// be recovered from the URL and then PROVEN before anything is deleted.
// "Recovered from a URL" is exactly the kind of input that turns a cleanup
// job into a delete-anything primitive, so the proof is the point of this
// function and the deletion is the easy part.
//
// Three things must hold, and all three come from data the SERVER has:
//
//   * the URL is a Firebase Storage download URL for THIS bucket
//   * the decoded object path sits under conversations/{thisConversationId}/
//   * the file name begins with the uid of the message's sender
//
// The last two are not decoration. Without the conversation check, a sender
// could put another thread's attachment URL on their own message and delete
// somebody else's photo by deleting their own text. Without the sender
// check, either participant could delete the other's attachments — Storage
// itself enforces the same `uid-` prefix on upload, so this mirrors the rule
// that put the file there.
//
// Anything that fails a check is logged and left alone. A cleanup job that
// is unsure must delete nothing.
const STORAGE_URL_PREFIX = "https://firebasestorage.googleapis.com/v0/b/";

function chatMediaPath(url, conversationId, senderId) {
  if (typeof url !== "string" || !url.startsWith(STORAGE_URL_PREFIX)) return null;
  // .../v0/b/<bucket>/o/<url-encoded path>?alt=media&token=...
  const afterBucket = url.slice(STORAGE_URL_PREFIX.length);
  const slash = afterBucket.indexOf("/o/");
  if (slash === -1) return null;
  const bucketName = afterBucket.slice(0, slash);
  if (bucketName !== admin.storage().bucket().name) return null;

  const encoded = afterBucket.slice(slash + 3).split("?")[0];
  let objectPath;
  try {
    objectPath = decodeURIComponent(encoded);
  } catch {
    // A malformed escape sequence. Not a path we are willing to guess at.
    return null;
  }

  // No traversal, and exactly the two segments the upload path has.
  if (objectPath.includes("..")) return null;
  const parts = objectPath.split("/");
  if (parts.length !== 3) return null;
  const [root, threadId, fileName] = parts;
  if (root !== "conversations") return null;
  if (threadId !== conversationId) return null;
  if (!senderId || !fileName.startsWith(`${senderId}-`)) return null;
  return objectPath;
}

// Firestore caps a batched write at 500 operations, and this trigger uses
// one for quote sanitization below.
const SANITIZE_BATCH_LIMIT = 400;

exports.cleanupDeletedMessageMedia = onDocumentDeleted(
  "conversations/{conversationId}/messages/{messageId}",
  async (event) => {
    const gone = event.data?.data();
    if (!gone) return;
    const { conversationId, messageId } = event.params;

    // ── 1. The attachment ────────────────────────────────────────────────
    //
    // The deleted snapshot carries the whole document, so imageUrl and
    // audioUrl are simply present — no before/after comparison and no
    // transition gate, which is what the tombstone version needed and what
    // made it fire on every edit only to return early.
    const candidates = [gone.imageUrl, gone.audioUrl].filter(Boolean);
    const paths = [];
    for (const url of candidates) {
      const path = chatMediaPath(url, conversationId, gone.senderId);
      if (path) {
        paths.push(path);
      } else {
        // Named loudly, because a physical delete leaves no document behind
        // to find the file from later. An orphan here is unreferenced by
        // anything and only this line says it exists.
        logger.error(
          `ORPHANED ATTACHMENT: message ${conversationId}/${messageId} was ` +
            `deleted and its attachment URL did not resolve to a file this ` +
            `message owns, so nothing was removed. The object is now ` +
            `unreferenced and must be found by hand.`,
        );
      }
    }
    if (paths.length) {
      const bucket = admin.storage().bucket();
      const results = await Promise.allSettled(
        paths.map((path) => bucket.file(path).delete({ ignoreNotFound: true })),
      );
      const failed = results
        .map((r, i) => (r.status === "rejected" ? paths[i] : null))
        .filter(Boolean);
      logger.info(
        `Message ${conversationId}/${messageId} deleted: removed ${
          paths.length - failed.length
        }/${paths.length} attachment(s).`,
      );
      for (const path of failed) {
        logger.error(
          `ORPHANED ATTACHMENT: ${path} could not be removed after its ` +
            `message was deleted. Unreferenced; remove by hand.`,
        );
      }
    }

    // ── 2. Quotes of this message, in other people's documents ───────────
    //
    // A reply stores a COPY of what it quotes. Deleting the original alone
    // therefore leaves its text sitting inside somebody else's message —
    // which is not deletion, and is exactly what the feature exists to
    // prevent.
    //
    // This runs here rather than on the client for one reason: the client
    // cannot be made to do it. Letting a sender write another participant's
    // message would need the update rule relaxed, and even then the sanitize
    // is a SECOND write that an app which is killed, offline, or simply
    // hostile never performs — leaving the deleted text in place forever. A
    // guarantee that depends on the deleting party volunteering a follow-up
    // write is not a guarantee. On the deletion event it cannot be skipped.
    //
    // textPreview is DROPPED rather than blanked, so the quoted words are
    // gone from the document rather than replaced in it.
    let quoting;
    try {
      quoting = await admin
        .firestore()
        .collection(`conversations/${conversationId}/messages`)
        .where("replyTo.messageId", "==", messageId)
        .limit(SANITIZE_BATCH_LIMIT)
        .get();
    } catch (error) {
      logger.error(
        `Message ${conversationId}/${messageId}: could not look up replies ` +
          `quoting it, so their copies of its text remain. ${error}`,
      );
      return;
    }
    if (quoting.empty) return;

    const batch = admin.firestore().batch();
    for (const docSnap of quoting.docs) {
      // Rewriting the whole map, not merging into it: a merge would leave
      // textPreview untouched, which is the entire thing being removed.
      //
      // Idempotent by construction — a retried event writes byte-identical
      // data over an already-sanitized quote. type "unavailable" is
      // server-only: firestore.rules restricts replyTo.type to
      // text/image/audio on CREATE, so no client can forge this state, and
      // no client can write replyTo at all after creation.
      batch.update(docSnap.ref, {
        replyTo: {
          messageId,
          senderId: gone.senderId ?? null,
          type: "unavailable",
        },
      });
    }
    // A quote can be deleted between the read above and this write — both
    // participants deleting at once, or the whole conversation being purged
    // because neither of them kept it. batch.update() on a document that has
    // since gone fails the WHOLE batch with NOT_FOUND, and an unguarded
    // commit turns that ordinary race into a function error.
    //
    // Nothing is lost when it happens: a quote that no longer exists cannot
    // still be holding the deleted text. So this is reported at info and the
    // invocation succeeds, because a stream of spurious errors here is what
    // would bury a real ORPHANED ATTACHMENT line.
    try {
      await batch.commit();
    } catch (error) {
      logger.info(
        `Message ${conversationId}/${messageId}: ${quoting.size} quote(s) ` +
          `could not be sanitized, most likely deleted concurrently. ` +
          `${error?.code ?? error}`,
      );
      return;
    }
    logger.info(
      `Message ${conversationId}/${messageId} deleted: sanitized ${
        quoting.size
      } quote(s) of it.`,
    );
  },
);

// Firestore caps a batched write at 500 operations.
const FIRESTORE_BATCH_LIMIT = 500;

// Stamps the Verified badge onto everything a company had already posted
// before its review came back. Listings carry `sellerVerified` copied from
// the seller's profile at write time (see CreateListingScreen) — that
// denormalisation is what lets a buyer see the badge without being allowed
// to read the seller doc, but it also means a company approved on day 3
// has its day-1 and day-2 listings stamped `false` forever unless they're
// backfilled here. That window is exactly when a new business posts most,
// so leaving it stale would blank the badge on the listings that need it
// most. Job posts carry a second copy of the same fact as `verified`.
async function backfillVerifiedBadge(sellerId) {
  const snap = await admin
    .firestore()
    .collection("listings")
    .where("sellerId", "==", sellerId)
    .get();
  if (snap.empty) return 0;

  const stale = snap.docs.filter(
    (doc) =>
      doc.data().sellerVerified !== true ||
      (doc.data().categoryKey === "jobs" && doc.data().verified !== true),
  );

  for (let i = 0; i < stale.length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = admin.firestore().batch();
    stale.slice(i, i + FIRESTORE_BATCH_LIMIT).forEach((doc) => {
      const update = { sellerVerified: true };
      if (doc.data().categoryKey === "jobs") update.verified = true;
      batch.update(doc.ref, update);
    });
    await batch.commit();
  }
  return stale.length;
}

// Tells a candidate when the employer actually decides.
//
// Only shortlisted and declined fire. 'reviewed' is the employer's own
// bookkeeping and means nothing to the applicant — pushing it would be
// noise, and worse, it would imply an outcome that hasn't happened. A
// candidate who applies and hears nothing forever is the same silent
// decision the company-verification flow used to have.
exports.notifyApplicationDecision = onDocumentUpdated(
  "jobApplications/{applicationId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    if (before.status === after.status) return;
    if (after.status !== "shortlisted" && after.status !== "declined") return;
    if (!after.applicantUid) return;

    const applicantSnap = await admin
      .firestore()
      .doc(`sellers/${after.applicantUid}`)
      .get();
    const pushToken = applicantSnap.exists
      ? applicantSnap.data().pushToken
      : null;

    const jobTitle = after.jobTitle || "votre candidature";
    const shortlisted = after.status === "shortlisted";

    const notification = shortlisted
      ? {
          title: "Candidature retenue",
          body: `Votre candidature pour ${jobTitle} a \u00e9t\u00e9 pr\u00e9s\u00e9lectionn\u00e9e.`,
        }
      : {
          title: "Candidature non retenue",
          body: `Votre candidature pour ${jobTitle} n\u2019a pas \u00e9t\u00e9 retenue cette fois.`,
        };
    const data = {
      type: shortlisted ? "applicationShortlisted" : "applicationDeclined",
    };

    // Recorded first, and recorded whether or not there is a token.
    //
    // A shortlisting result is about nothing else \u2014 no listing, no
    // conversation \u2014 so openNotification has no case for it and its default
    // branch lands on the notification centre. Until this row existed the
    // centre had nothing to show: the applicant was told the outcome of
    // their application, tapped Voir, and read "no notifications yet". The
    // early `if (!pushToken) return` above made it worse, because an
    // applicant with no registered token got no record either.
    await recordNotification(after.applicantUid, { ...notification, data });

    if (!pushToken) return;

    try {
      await admin.messaging().send({
        token: pushToken,
        notification,
        data,
      });
    } catch (error) {
      if (
        error.code === "messaging/invalid-registration-token" ||
        error.code === "messaging/registration-token-not-registered"
      ) {
        await admin.firestore().doc(`sellers/${after.applicantUid}`).update({
          pushToken: admin.firestore.FieldValue.delete(),
        });
      }
    }
  },
);

// The public face of a verified company, powering the "Entreprises
// vérifiées" row on the home feed.
//
// It has to be its own collection because firestore.rules restricts
// `sellers` reads to the owning account — and rightly so: that document
// holds the company's phone number, RCCM, IFU and links to its
// representative's ID. None of that can be world-readable just to render a
// name and a sector on a carousel. So the Admin SDK projects the handful of
// genuinely public fields into `verifiedCompanies`, and the rules keep that
// collection read-only to everyone (see firestore.rules) — a company can no
// more insert itself into this row than it can grant itself the badge.
//
// Written on approval, removed on rejection, so a company that later loses
// verification also leaves the carousel rather than lingering as a stale
// endorsement.
async function syncVerifiedCompanyEntry(sellerId, seller, isVerified) {
  const ref = admin.firestore().doc(`verifiedCompanies/${sellerId}`);
  if (!isVerified) {
    await ref.delete().catch(() => {});
    return;
  }
  await ref.set({
    companyName: seller.companyName || seller.fullName || "",
    sector: seller.sector || null,
    city: seller.companyCity || null,
    photoUrl: seller.photoUrl || null,
    // Published for companies only, and only once verified. A business
    // number is a contact point its owner expects to be called on — the
    // same reasoning that put WhatsApp on restaurant listings and kept it
    // off individual ones, where the number is personal data. Everything
    // else in `sellers` (RCCM, IFU, the representative's ID) stays private.
    phone: seller.phone || null,
    verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// The review itself happens outside the app — scripts/verifySeller.js under
// the Admin SDK, because no public API exists to check an RCCM/IFU against
// Bénin's registry. This trigger is what makes that decision visible: it
// fires wherever the write came from, so a future admin panel gets the same
// behaviour for free rather than having to remember to notify.
exports.notifyCompanyVerificationDecision = onDocumentUpdated(
  "sellers/{sellerId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    const { sellerId: earlySellerId } = event.params;

    // An already-verified company editing its public details — a logo, a
    // city — still has to reach the public projection, which is the only
    // copy the home feed can read. Without this a company could upload a
    // logo and watch its card keep showing initials forever, since the
    // projection is only ever written on a status change.
    if (
      before.verificationStatus === after.verificationStatus &&
      after.verificationStatus === "verified" &&
      after.accountType === "company"
    ) {
      const projectedChanged =
        before.photoUrl !== after.photoUrl ||
        before.phone !== after.phone ||
        before.companyCity !== after.companyCity ||
        before.sector !== after.sector ||
        before.companyName !== after.companyName;
      if (projectedChanged) {
        await syncVerifiedCompanyEntry(earlySellerId, after, true);
      }
      return;
    }

    // Seller docs are written on every profile edit, push-token refresh and
    // notifications-seen bump, so bail unless this write is the transition
    // we care about.
    if (before.verificationStatus === after.verificationStatus) return;
    if (after.accountType !== "company") return;
    if (
      after.verificationStatus !== "verified" &&
      after.verificationStatus !== "rejected"
    )
      return;

    const { sellerId } = event.params;
    const isVerified = after.verificationStatus === "verified";

    // Runs before the push and independently of it: the badge has to be
    // correct whether or not the notification is deliverable.
    if (isVerified) {
      await backfillVerifiedBadge(sellerId);
    }
    await syncVerifiedCompanyEntry(sellerId, after, isVerified);

    const pushToken = after.pushToken;

    const companyName = after.companyName?.trim() || "Votre entreprise";

    const notification = isVerified
      ? {
          title: "Entreprise vérifiée",
          body: `${companyName} est confirmée au registre. Le badge Vérifié apparaît désormais sur vos annonces.`,
        }
      : {
          title: "Vérification non aboutie",
          body: `Nous n’avons pas pu valider le dossier de ${companyName}. Ouvrez votre tableau de bord pour la suite.`,
        };
    const data = { type: isVerified ? "companyVerified" : "companyRejected" };

    // The outcome of a manual review, which the company has often been
    // waiting days for, and which points at no document of its own — so it
    // reaches the notification centre by openNotification's default branch
    // and needs a row waiting there. Recorded before the token check for the
    // same reason as everywhere else: a company with no registered token is
    // exactly the one that most needs to be able to find this later.
    await recordNotification(sellerId, { ...notification, data });

    if (!pushToken) return;

    try {
      await admin.messaging().send({
        token: pushToken,
        notification,
        data,
      });
    } catch (error) {
      if (
        error.code === "messaging/invalid-registration-token" ||
        error.code === "messaging/registration-token-not-registered"
      ) {
        await admin.firestore().doc(`sellers/${sellerId}`).update({
          pushToken: admin.firestore.FieldValue.delete(),
        });
      }
    }
  },
);

// ---------------------------------------------------------------------------
// Profile counters: followers, following, likes.
//
// Kept as counters in a public `sellerStats/{uid}` document rather than
// counted on demand, for two reasons. The source data is unreadable to the
// viewer by design — `favorites` is private per user, so a visitor cannot
// count anyone's likes — and `sellers` itself is private, so nothing on it
// can be shown to a visitor at all. firestore.rules lets no client write
// here; only these triggers do, which is what stops a follower count from
// being inflated straight from a phone.
// ---------------------------------------------------------------------------

// The seller's picture and display name, mirrored into the public
// projection.
//
// A buyer's app cannot read `sellers/{uid}` — that rule is what keeps RCCM,
// IFU and ID scans off the wire — so a profile photo has no route to a
// listing page on its own. Copying it onto each listing at publish time was
// the first attempt and it is worse: every listing published before the
// seller set a picture keeps showing an initial forever, and changing the
// picture never reaches them. Projecting it here instead means one copy,
// always current, visible on every listing the seller has ever posted.
//
// Only these triggers write sellerStats (firestore.rules denies all client
// writes), so this cannot be spoofed from a phone.
exports.syncSellerPublicProfile = onDocumentWritten(
  "sellers/{sellerId}",
  async (event) => {
    const after = event.data?.after?.data();
    // Deleting the profile clears the projection rather than leaving a face
    // behind on listings.
    const photoUrl = after?.photoUrl ?? null;
    const displayName = after?.fullName ?? null;
    // Deliberately unconditional. Skipping when photoUrl is unchanged looks
    // like an obvious saving and is exactly wrong: a profile whose picture
    // never changes would then never seed its projection, so every existing
    // seller would keep showing an initial forever. Any write to the
    // profile — including the push-token refresh on app start — now
    // reconciles it, which is what backfills accounts created before this
    // function existed. One small merge write is cheaper than that bug.
    await admin
      .firestore()
      .collection("sellerStats")
      .doc(event.params.sellerId)
      .set({ photoUrl, displayName }, { merge: true });
  },
);

function bumpSellerStat(sellerId, field, delta) {
  if (!sellerId) return Promise.resolve();
  const ref = admin.firestore().collection("sellerStats").doc(sellerId);

  // Going up is a plain atomic increment — nothing to guard against.
  if (delta > 0) {
    return ref.set(
      { [field]: admin.firestore.FieldValue.increment(delta) },
      { merge: true },
    );
  }

  // Going down has to be floored at zero, and a bare increment(-1) can't be.
  // Favourites existed in this database before these triggers did, so
  // un-favouriting an old listing fires a delete whose matching create was
  // never counted — that would take a seller's likes to -1 and leave it
  // there. The transaction reads the stored value, which increment() by
  // design never does.
  return admin.firestore().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const current = Number(snapshot.data()?.[field]) || 0;
    tx.set(ref, { [field]: Math.max(0, current + delta) }, { merge: true });
  });
}

async function applyFollowDelta(follow, delta) {
  const followerId = follow?.followerId;
  const sellerId = follow?.sellerId;
  // Self-follows are rejected by the rules; ignoring them here too means a
  // stray document can't quietly inflate both of one account's counters.
  if (!followerId || !sellerId || followerId === sellerId) return;
  await Promise.all([
    bumpSellerStat(sellerId, "followers", delta),
    bumpSellerStat(followerId, "following", delta),
  ]);
}

exports.onFollowCreated = onDocumentCreated(
  "follows/{followId}",
  async (event) => {
    await applyFollowDelta(event.data?.data(), 1);
  },
);

exports.onFollowDeleted = onDocumentDeleted(
  "follows/{followId}",
  async (event) => {
    await applyFollowDelta(event.data?.data(), -1);
  },
);

// A like belongs to a listing, and the listing knows its seller — the
// favourite document deliberately doesn't carry sellerId, so it's read here
// rather than trusting a denormalised copy the client wrote.
async function applyFavouriteDelta(favourite, delta) {
  const listingId = favourite?.listingId;
  if (!listingId) return;
  const listing = await admin
    .firestore()
    .collection("listings")
    .doc(listingId)
    .get();
  // A favourite outliving its listing is normal (the listing was deleted);
  // there's simply no seller left to credit.
  if (!listing.exists) return;
  await bumpSellerStat(listing.data()?.sellerId, "likes", delta);

  // And on the listing itself, because the seller's question is not "how
  // many likes do I have" but "why is this one not selling". A listing with
  // views, saves and no calls is priced wrong or missing something a buyer
  // needs before they will ring; the same listing with views and no saves
  // was simply not wanted. The total across a profile cannot tell them
  // which, and `favorites` is per-user private, so a seller cannot count
  // their own listing's saves from the client — this is the only place the
  // number can come from.
  //
  // Floored at zero here for the same reason bumpSellerStat floors: a
  // delete replayed after the counter was reset must not print "-1".
  const current = Number(listing.data()?.saveCount) || 0;
  await listing.ref.update({ saveCount: Math.max(0, current + delta) });
}

exports.onFavoriteCreated = onDocumentCreated(
  "favorites/{favoriteId}",
  async (event) => {
    await applyFavouriteDelta(event.data?.data(), 1);
  },
);

exports.onFavoriteDeleted = onDocumentDeleted(
  "favorites/{favoriteId}",
  async (event) => {
    await applyFavouriteDelta(event.data?.data(), -1);
  },
);

// ---------------------------------------------------------------------------
// Ratings, and the interaction gate behind them.
//
// Anyone-can-rate-anyone is worthless within a month: a competitor
// one-stars a rival from three accounts and a seller five-stars themselves
// from two. So a rating requires that the two people have actually spoken.
//
// The check has to be something firestore.rules can evaluate, and rules
// cannot run queries — only exists()/get() on a path they can construct.
// A conversation's id is `${listingId}_${buyerUid}`, which the two user
// ids alone cannot reproduce. So the first message between a pair mints a
// `contacts/{a_b}` marker at a deterministic path, and the rating rule
// tests for that.
//
// Sorted so the pair has one canonical id whichever way round it is read.
function contactPairId(a, b) {
  return [a, b].sort().join("_");
}

// Fires on the first MESSAGE, not on the conversation document.
//
// openChat() creates the conversation the moment someone taps Message,
// before a word is sent — gating ratings on that would mean "tapped a
// button once", which costs an attacker nothing. Requiring a real message
// means a fake review needs a real exchange the other person can see and
// report.
exports.onMessageCreated = onDocumentCreated(
  "conversations/{conversationId}/messages/{messageId}",
  async (event) => {
    const conversationSnap = await admin
      .firestore()
      .doc(`conversations/${event.params.conversationId}`)
      .get();
    const [a, b] = conversationSnap.data()?.participantIds ?? [];
    if (!a || !b || a === b) return;

    await admin
      .firestore()
      .collection("contacts")
      .doc(contactPairId(a, b))
      .set(
        {
          participantIds: [a, b].sort(),
          // Kept for auditing a disputed review: which exchange unlocked it.
          firstConversationId: event.params.conversationId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        // merge: later messages must not restamp the original date.
        { merge: true },
      );
  },
);

// Averages are recomputed from a running sum rather than by re-reading
// every rating: a seller with 400 reviews would otherwise cost 400 reads
// on each new one. The transaction keeps sum and count consistent when two
// ratings land together.
async function applyRatingDelta(ratedId, starsDelta, countDelta) {
  if (!ratedId) return;
  const ref = admin.firestore().collection("sellerStats").doc(ratedId);
  await admin.firestore().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const data = snapshot.data() ?? {};
    const ratingCount = Math.max(
      0,
      (Number(data.ratingCount) || 0) + countDelta,
    );
    const ratingSum = Math.max(0, (Number(data.ratingSum) || 0) + starsDelta);
    tx.set(
      ref,
      {
        ratingCount,
        ratingSum,
        // Stored rounded to one decimal because that is all any screen
        // shows, and it keeps clients from rendering 4.333333.
        rating: ratingCount
          ? Math.round((ratingSum / ratingCount) * 10) / 10
          : 0,
      },
      { merge: true },
    );
  });
}

exports.onRatingCreated = onDocumentCreated(
  "ratings/{ratingId}",
  async (event) => {
    const rating = event.data?.data();
    await applyRatingDelta(rating?.ratedId, Number(rating?.stars) || 0, 1);
  },
);

exports.onRatingUpdated = onDocumentUpdated(
  "ratings/{ratingId}",
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!before || !after) return;
    const delta = (Number(after.stars) || 0) - (Number(before.stars) || 0);
    // An edited comment changes no total; only the score moves the average.
    if (delta === 0) return;
    await applyRatingDelta(after.ratedId, delta, 0);
  },
);

exports.onRatingDeleted = onDocumentDeleted(
  "ratings/{ratingId}",
  async (event) => {
    const rating = event.data?.data();
    await applyRatingDelta(rating?.ratedId, -(Number(rating?.stars) || 0), -1);
  },
);

// ---------------------------------------------------------------------------
// Reports: make a reported listing visibly different, without acting on it.
//
// A moderation queue nobody opens is the same as no queue, so the signal is
// stamped onto the listing itself — where it shows up in the console, in
// scripts/reviewReports.js, and anywhere a listing is inspected later.
//
// Deliberately NOT auto-unpublishing at a threshold: three accounts and
// three taps is all it would take for a competitor to remove a rival's
// listing, and here that could be a genuine property advert worth millions
// of FCFA. Counting is automatic; removing stays a human decision.
// ---------------------------------------------------------------------------
exports.onReportCreated = onDocumentCreated(
  "reports/{reportId}",
  async (event) => {
    const report = event.data?.data();
    const listingId = report?.listingId;
    if (!listingId) return;

    const ref = admin.firestore().collection("listings").doc(listingId);
    const snapshot = await ref.get();
    // Jobs shown from sample data have ids that are not listing documents.
    // update() would fail and set() would conjure a listing out of a report,
    // so a report against something that is not a real listing is counted
    // nowhere and simply waits in the queue for a human.
    if (!snapshot.exists) return;

    // The document id is `${listingId}_${reporterId}`, so a create event only
    // ever fires once per person per listing — this counts reporters, not
    // reports.
    await ref.update({
      reportCount: admin.firestore.FieldValue.increment(1),
      lastReportedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  },
);

// ── E13: the counter increments, server side ───────────────────────────
//
// A reader creates counterMarkers/{listingId}_{uid}_{kind}_{yyyy-mm-dd} and
// this turns that into the increment. The marker's ID is the rate limit:
// Firestore refuses a duplicate create on its own, so one account moves one
// listing's one counter by one per day and every attempt after that is a
// refused write that costs nothing to serve.
//
// The client can no longer write viewCount, shareCount or contactCount at
// all — firestore.rules removed those branches — so the number is
// server-authored, the same shape as searchTokens and sellerVerified.
const COUNTER_KINDS = {
  view: ["viewCount", "viewCountToday", "viewCountDate"],
  share: ["shareCount", null, null],
  contact: ["contactCount", "contactCountToday", "contactCountDate"],
};

exports.onCounterMarkerCreated = onDocumentCreated(
  "counterMarkers/{markerId}",
  async (event) => {
    const marker = event.data?.data();
    if (!marker) return;

    const { listingId, kind, day } = marker;
    const fields = COUNTER_KINDS[kind];
    if (!listingId || !fields) return;

    const [lifetime, todayField, dayField] = fields;
    const ref = admin.firestore().collection("listings").doc(listingId);

    try {
      await admin.firestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        // Gone, or never public. A marker for a listing nobody can see is
        // not worth a write, and this is also what stops a marker created
        // against a pending listing counting later.
        if (!snap.exists || snap.data().status !== "approved") return;

        const update = {
          [lifetime]: admin.firestore.FieldValue.increment(1),
        };
        // The daily bucket resets rather than accumulating across days, so
        // "today" means today whether or not anybody looked yesterday.
        if (todayField && dayField) {
          const current = snap.data();
          update[dayField] = day;
          update[todayField] =
            current[dayField] === day
              ? admin.firestore.FieldValue.increment(1)
              : 1;
        }
        tx.update(ref, update);
      });
    } catch (error) {
      // A counter is not worth failing anything over, but a systematic
      // failure should be visible rather than silently flattening every
      // number in the market.
      logger.warn(
        `counter ${kind} not applied to ${listingId}`,
        error?.code ?? error,
      );
    }
  },
);

// ── Reclaiming a conversation nobody keeps ─────────────────────────────
//
// "Delete chat" in the inbox is per-viewer: it writes deletedBy.<uid> and
// hides the thread from that person's list. It deliberately destroys
// nothing, because the conversation document and its messages are ONE copy
// shared by two people — deleting them when one side pressed delete would
// erase the other side's history without asking.
//
// So the storage is only reclaimable at the moment BOTH participants have
// deleted it. Then nobody can see the thread, nobody can bring it back by
// opening it, and every byte it occupies is unreachable. That is what this
// purges.
//
// THE TRAP: deletedBy is a tombstone, not a state. A chat that both people
// deleted comes BACK for both of them the moment either one sends a new
// message — the inbox compares lastMessageAt against each viewer's cutoff
// rather than testing the key's presence. Purging on `deletedBy covers
// everyone` alone would therefore delete a live conversation the first time
// anything touched the document after a revival: the unread counter, the
// preview, a read receipt. The condition has to be the same one the inbox
// renders with, per participant, or the server and the screen disagree about
// whether a thread exists.
const PURGE_PAGE = 300;

function everyoneDeleted(conversation) {
  const participants = conversation?.participantIds;
  if (!Array.isArray(participants) || participants.length === 0) return false;
  const deletedBy = conversation.deletedBy ?? {};
  const lastMessageAt = conversation.lastMessageAt;
  return participants.every((uid) => {
    const cutoff = deletedBy[uid];
    if (!cutoff || typeof cutoff.toMillis !== "function") return false;
    // No messages at all, or an unresolved write: nothing can post-date the
    // deletion, so the thread is hidden for this participant.
    if (typeof lastMessageAt?.toMillis !== "function") return true;
    return lastMessageAt.toMillis() <= cutoff.toMillis();
  });
}

exports.purgeFullyDeletedConversation = onDocumentUpdated(
  "conversations/{conversationId}",
  async (event) => {
    const after = event.data?.after?.data();
    if (!after || !everyoneDeleted(after)) return;
    // Only the transition INTO that state does the work. Without this the
    // same purge is attempted again by every write that lands while the
    // condition already holds.
    const before = event.data?.before?.data();
    if (before && everyoneDeleted(before)) return;

    const { conversationId } = event.params;
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const messages = db.collection(`conversations/${conversationId}/messages`);

    let removedDocs = 0;
    let removedFiles = 0;
    try {
      // Paged rather than recursive: a thread is unbounded, and a single
      // batch caps at 500 writes.
      for (;;) {
        const page = await messages.limit(PURGE_PAGE).get();
        if (page.empty) break;

        // The attachments go first. A message document deleted before its
        // file leaves nothing behind pointing at the file.
        const paths = [];
        for (const snapshot of page.docs) {
          const data = snapshot.data() ?? {};
          for (const url of [data.imageUrl, data.audioUrl].filter(Boolean)) {
            const path = chatMediaPath(url, conversationId, data.senderId);
            if (path) paths.push(path);
            else
              logger.error(
                `ORPHANED ATTACHMENT: message ${conversationId}/` +
                  `${snapshot.id} was purged and its attachment URL did not ` +
                  `resolve to a file this message owns. Unreferenced; remove ` +
                  `by hand.`,
              );
          }
        }
        if (paths.length) {
          const results = await Promise.allSettled(
            paths.map((path) =>
              bucket.file(path).delete({ ignoreNotFound: true }),
            ),
          );
          results.forEach((result, index) => {
            if (result.status === "rejected")
              logger.error(
                `ORPHANED ATTACHMENT: ${paths[index]} survived the purge of ` +
                  `conversation ${conversationId}. Unreferenced; remove by hand.`,
              );
            else removedFiles += 1;
          });
        }

        const batch = db.batch();
        page.docs.forEach((snapshot) => batch.delete(snapshot.ref));
        await batch.commit();
        removedDocs += page.size;
        if (page.size < PURGE_PAGE) break;
      }

      // Last, so that a failure above leaves the conversation document in
      // place and the thread still reachable by this trigger on the next
      // write, rather than stranding an unreferenced subcollection.
      await db.doc(`conversations/${conversationId}`).delete();
      logger.info(
        `Conversation ${conversationId} purged: both participants had ` +
          `deleted it. Removed ${removedDocs} message(s) and ` +
          `${removedFiles} attachment(s).`,
      );
    } catch (error) {
      logger.error(
        `Conversation ${conversationId}: purge failed after ${removedDocs} ` +
          `message(s) and ${removedFiles} attachment(s).`,
        error?.code ?? error,
      );
    }
  },
);
