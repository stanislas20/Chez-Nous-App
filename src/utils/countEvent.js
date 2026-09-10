import { doc, serverTimestamp, setDoc } from "firebase/firestore";
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
export const COUNTER_VIEW = "view";
export const COUNTER_SHARE = "share";
export const COUNTER_CONTACT = "contact";

// Local date, not UTC: "today" has to mean the seller's today.
export function counterDayKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  }).catch(() => {
    // Already counted today, offline, or refused. All three are ordinary and
    // none of them is worth telling anybody about: the duplicate is the rate
    // limit working, and a missed count is a number being one smaller.
  });
}
