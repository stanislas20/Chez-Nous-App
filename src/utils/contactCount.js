import { doc, increment, updateDoc } from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";

// How often somebody actually reached for the phone.
//
// The app counts views already, and a view is the weakest signal it has: it
// says the photograph was interesting enough to open. What a seller needs
// to know is different — did anybody call? Eleven views and no calls is a
// price problem; eleven calls and no sale is a different conversation
// entirely. Nothing in the app could tell those two apart.
//
// One function, called from every Appeler and every WhatsApp button, for
// the reason this codebase keeps rediscovering: the moment a second screen
// writes its own version, the two drift and half the taps stop counting
// with nothing to show that they have.
//
// Deliberately quiet. A failed count must never interrupt a call — the
// person is trying to reach a plumber, not to feed our statistics — so the
// write is fire-and-forget and its failure is swallowed.
function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function countContact(listing) {
  if (!isFirebaseConfigured || !listing?.id) return;
  // A seller ringing their own number is not a lead.
  if (listing.isSample) return;
  const today = todayKey();
  const sameDay = listing.contactCountDate === today;
  updateDoc(doc(firestore, "listings", listing.id), {
    contactCount: increment(1),
    contactCountToday: sameDay ? increment(1) : 1,
    contactCountDate: today,
  }).catch(() => {});
}
