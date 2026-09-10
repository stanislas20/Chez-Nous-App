import {
  countEvent,
  COUNTER_CONTACT,
} from "./countEvent";

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
  // The marker path, not a direct increment. See src/utils/countEvent.js for
  // why the client no longer writes counters, and what it changes about what
  // the number means.
  countEvent(listing, COUNTER_CONTACT);
}
