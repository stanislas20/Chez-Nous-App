const admin = require("firebase-admin");
const { logger } = require("firebase-functions");

// The durable half of a push.
//
// FCM is a delivery attempt and keeps no record. For most notifications that
// is fine, because the thing they are about is itself a document: a message
// push points at a conversation, an approval push at a listing, and tapping
// either opens the real thing. openNotification deep links all of those.
//
// It is the notifications that are about nothing else that break. A pharmacy
// roster waiting for review, a shortlisting result, a company verification
// decision — these have no screen of their own, so openNotification's default
// branch sends them to the notification centre, and the centre is assembled
// from unread conversations, newly approved listings and job applications.
// It had never heard of any of them. Somebody was told their application had
// been shortlisted, tapped to see it, and was shown "no notifications yet".
//
// This is where that record goes. sellers/{uid}/notifications, read by
// useStoredNotifications, rendered by NotificationsScreen, owner-readable and
// client-unwritable in firestore.rules.
//
// Two properties matter and both are easy to lose:
//
//   Call it BEFORE sending. A throw from messaging(), an expired token, a
//   token that was never registered — none of those should be able to take
//   the notification with them.
//
//   Call it even when there is no token. Every one of these senders used to
//   open with `if (!pushToken) return;`, which meant the person least able to
//   receive a push was also the one guaranteed no record of it.
//
// Never throws. A notification that cannot be recorded must still be pushed;
// failing the caller here would trade a missing row for a missing banner.
//
// `id` is optional and changes the write from add() to set().
//
// An auto-id is right for a notification about an event that happens once:
// a verification decision, an application result. It is wrong for anything a
// trigger can be asked to do twice. Firestore triggers are at-least-once, so
// a follower fan-out that runs again would add a second row per follower with
// add(), and there would be no way to tell the duplicate from a real second
// event after the fact.
//
// A deterministic id makes the write idempotent by construction rather than
// by coordination: the same event writes the same document id, and running it
// ten times leaves one row. The caller chooses the id from something stable
// about the event — for followed-seller listings, the listing id, because a
// listing is published once and a follower wants one row about it.
//
// Existing callers pass no id and keep add(). Nothing about their behaviour
// changes, and the two id styles coexist in one subcollection without
// trouble: nothing reads the id except React's key.
async function recordNotification(uid, { title, body, data, id } = {}) {
  if (!uid) return;
  try {
    const collection = admin
      .firestore()
      .collection("sellers")
      .doc(uid)
      .collection("notifications");
    const payload = {
      title: title ?? "",
      body: body ?? "",
      // Lifted out for the row's icon and for filtering by kind without
      // unpacking the payload.
      type: data?.type ?? null,
      // Kept whole and handed straight back to openNotification when the
      // row is tapped, so a type that grows a listingId later starts deep
      // linking with no change on either side.
      data: data ?? {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (id) await collection.doc(String(id)).set(payload);
    else await collection.add(payload);
  } catch (error) {
    logger.error(`Failed to record notification for ${uid}`, error);
  }
}

module.exports = { recordNotification };
