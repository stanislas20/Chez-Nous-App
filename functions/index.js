const { onCall, HttpsError } = require("firebase-functions/v2/https");
const {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentUpdated,
  onDocumentWritten,
} = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();

// Keep costs bounded on a low-traffic endpoint.
setGlobalOptions({ maxInstances: 10 });

exports.syncPharmacyRosters =
  require("./pharmacyRosterSync").syncPharmacyRosters;

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
const LOOKUP_WINDOW_MS = 60 * 60 * 1000;
const LOOKUP_MAX_PER_WINDOW = 20;

function abbreviateName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
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

    await event.data.ref.update({ status: "approved" });
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

    const followsSnap = await admin
      .firestore()
      .collection("follows")
      .where("sellerId", "==", after.sellerId)
      .get();
    if (followsSnap.empty) return;

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
    if (!pushToken) return;

    const jobTitle = after.jobTitle || "votre candidature";
    const shortlisted = after.status === "shortlisted";

    try {
      await admin.messaging().send({
        token: pushToken,
        notification: shortlisted
          ? {
              title: "Candidature retenue",
              body: `Votre candidature pour ${jobTitle} a \u00e9t\u00e9 pr\u00e9s\u00e9lectionn\u00e9e.`,
            }
          : {
              title: "Candidature non retenue",
              body: `Votre candidature pour ${jobTitle} n\u2019a pas \u00e9t\u00e9 retenue cette fois.`,
            },
        data: {
          type: shortlisted ? "applicationShortlisted" : "applicationDeclined",
        },
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
    if (!pushToken) return;

    const companyName = after.companyName?.trim() || "Votre entreprise";

    try {
      await admin.messaging().send({
        token: pushToken,
        notification: isVerified
          ? {
              title: "Entreprise vérifiée",
              body: `${companyName} est confirmée au registre. Le badge Vérifié apparaît désormais sur vos annonces.`,
            }
          : {
              title: "Vérification non aboutie",
              body: `Nous n’avons pas pu valider le dossier de ${companyName}. Ouvrez votre tableau de bord pour la suite.`,
            },
        data: { type: isVerified ? "companyVerified" : "companyRejected" },
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
