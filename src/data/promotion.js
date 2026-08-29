// What it takes for a listing to be "mis en avant", in one place.
//
// It used to take a tap. The seller dashboard's megaphone opened the publish
// form with isPromoted: true in the route params, the form wrote that
// straight onto the document, and nothing anywhere disagreed — not the
// Firestore rules, which never mentioned the field, and not the screens,
// which read it as gospel. So any seller who could publish could promote
// every listing they owned, free, for ever. The code called it "a paid
// placement". Nothing about it was paid, and nothing about it expired.
//
// Two changes make the words true. The field is now written by a moderator
// and refused to everyone else — that part lives in firestore.rules, because
// a check in the app stops only the people using the app. And a promotion
// now ends: promotedUntil is a date, and a grant nobody renews lapses on its
// own rather than becoming permanent by neglect.
//
// A seller asks with promotionRequested, which is theirs to write and means
// exactly what it says. It buys them a place in the moderator's queue, not
// a place on the screen.

// Long enough to be worth granting, short enough that a forgotten one
// clears itself within the month.
export const PROMOTION_DAYS = 30;

// The ceiling on any single grant, matching the one in firestore.rules. A
// moderator can renew; a moderator cannot hand out a decade by typo.
export const PROMOTION_MAX_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

// Firestore hands back a Timestamp, the emulator and older documents hand
// back a Date or a number, and a listing written before this existed hands
// back nothing at all. All four have to answer the same question.
function toMillis(value) {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return null;
}

// The one question every screen should ask before drawing a promoted badge
// or reserving the featured slot.
//
// An unset promotedUntil reads as not promoted rather than as forever. That
// is the safe direction: the listings written before this change carry
// isPromoted: true and no end date, and treating those as live would keep
// exactly the free permanent placements this is meant to end.
export function isPromotionLive(listing, now = Date.now()) {
  if (!listing?.isPromoted) return false;
  const until = toMillis(listing.promotedUntil);
  return until != null && until > now;
}

// What a moderator's grant is worth, as a Date the write can carry.
export function promotionExpiry(days = PROMOTION_DAYS, from = Date.now()) {
  const capped = Math.min(days, PROMOTION_MAX_DAYS);
  return new Date(from + capped * DAY_MS);
}

// Whole days left, for the moderator's card. Floors, so "1 jour" means at
// least a day remains rather than possibly a minute.
export function promotionDaysLeft(listing, now = Date.now()) {
  const until = toMillis(listing?.promotedUntil);
  if (until == null || until <= now) return 0;
  return Math.floor((until - now) / DAY_MS);
}
