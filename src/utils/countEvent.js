import { doc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import { firebaseAuth, firestore, isFirebaseConfigured } from "../config/firebase";

// One place that knows how a view, a share or a contact gets counted.
//
// The client used to increment the listing's counters directly. The rules
// allowed exactly +1 per write and checked carefully that nothing else on the
// document moved — and never asked how many writes. Any signed-in account
// could loop it, inflating its own listing or a rival's and billing a write
// each time.
//
// So the client no longer writes counters at all. It creates a marker whose
// ID is the whole rate limit:
//
//   counterMarkers/{listingId}_{uid}_{kind}_{yyyy-mm-dd}
//
// Firestore refuses the second create of an existing id by itself, so the
// second view of the same listing by the same person on the same day is
// refused by the database rather than by a rule that has to be got right.
// onCounterMarkerCreated then applies the increment with the Admin SDK.
//
// What this changes for a seller's numbers, stated plainly: a count is now
// unique people per day rather than taps. Ten looks at the same advert by one
// buyer used to read as ten; it now reads as one. That is a more useful
// number and a smaller one, and the seller's dashboard should be read that
// way.
// Matches the duration in firestore.rules and the TTL policy on the
// collection. Long enough that the daily bucket is never the thing that
// expires; short enough that the collection does not grow without end.
export const COUNTER_MARKER_TTL_DAYS = 7;

export const COUNTER_VIEW = "view";
export const COUNTER_SHARE = "share";
export const COUNTER_CONTACT = "contact";

// UTC, because the rule computes the same value from request.time.
//
// This used to be the device's local date, which was fine while the rule
// accepted any ten-character string. It no longer does: firestore.rules
// derives the day from the SERVER clock and refuses anything else, so a
// phone in Cotonou and the rule have to agree on what today is. UTC is the
// only clock both can name — request.time.year()/month()/day() are UTC, and
// toISOString() is UTC.
//
// The visible consequence is that the daily bucket rolls at midnight UTC,
// which is 01:00 in Bénin. A view at 00:30 local counts against the previous
// day. That is a bucket boundary, not a lost count, and it is the price of
// having a limit the client cannot move.
export function counterDayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * Record one counted event against a listing.
 *
 * Fire and forget by design — nothing on screen depends on it, and a refused
 * duplicate is the ordinary case rather than an error.
 */
export function countEvent(listing, kind) {
  if (!isFirebaseConfigured || !listing?.id) return;
  if (listing.isSample) return;
  // Only approved listings carry public numbers, and the trigger checks this
  // again server-side.
  if (listing.status && listing.status !== "approved") return;

  const uid = firebaseAuth?.currentUser?.uid;
  // Signed-out browsers are not counted. That was already true of every
  // counter — the write rules all required auth — and it is why the figures
  // are a measure of signed-in interest.
  if (!uid) return;

  // A seller acting on their own listing is not a lead. Read from auth here
  // rather than asked for at each of the seventeen call sites: a parameter
  // seventeen screens must remember to pass is one sixteen will forget.
  if (listing.sellerId && listing.sellerId === uid) return;

  const day = counterDayKey();
  const markerId = `${listing.id}_${uid}_${kind}_${day}`;

  setDoc(doc(firestore, "counterMarkers", markerId), {
    listingId: listing.id,
    uid,
    kind,
    day,
    createdAt: serverTimestamp(),
    // Retention. The rule requires exactly this value, and Firestore's TTL
    // policy deletes the document once it passes — see docs/LAUNCH-CHECKLIST.md.
    expiresAt: Timestamp.fromMillis(Date.now() + COUNTER_MARKER_TTL_DAYS * 86400000),
  }).catch(() => {
    // Already counted today, offline, or refused. All three are ordinary and
    // none of them is worth telling anybody about: the duplicate is the rate
    // limit working, and a missed count is a number being one smaller.
  });
}
