import { Timestamp } from "firebase/firestore";

// A listing stays live for 30 days from creation, then needs a manual
// renewal (see handleRenewListing in SellerDashboardScreen). Pharmacy duty
// rosters are exempt — they're governed by dutyUntil instead, and
// useApprovedListings already keeps the last known roster visible even
// between ONPB publications.
export const LISTING_DURATION_DAYS = 30;
// A verified company keeps its listings live three times as long. Renewal
// is a per-listing chore, so a business running forty of them pays that tax
// forty times over — this is the one perk of verification with an actual
// running cost attached, rather than a badge. It's also safe to grant: the
// account behind it has had its RCCM and IFU checked by a human.
export const VERIFIED_COMPANY_LISTING_DURATION_DAYS = 90;
export const LISTING_EXPIRING_SOON_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isVerifiedCompanyProfile(sellerProfile) {
  return (
    sellerProfile?.accountType === "company" && sellerProfile?.verificationStatus === "verified"
  );
}

export function getListingExpiresAtTimestamp(fromMs = Date.now(), sellerProfile = null) {
  const days = isVerifiedCompanyProfile(sellerProfile)
    ? VERIFIED_COMPANY_LISTING_DURATION_DAYS
    : LISTING_DURATION_DAYS;
  return Timestamp.fromMillis(fromMs + days * DAY_MS);
}

// Directory entries never expire. A for-sale item goes stale because it
// gets sold; a pharmacy and a restaurant are places that stay open, and
// quietly dropping one out of the directory after 30 days would empty the
// section without anyone doing anything wrong.
const NON_EXPIRING_CATEGORIES = ["pharmacyOnDuty", "restaurants"];

export function isExpirable(listing) {
  return !NON_EXPIRING_CATEGORIES.includes(listing?.categoryKey) && !!listing?.expiresAt?.toMillis;
}

export function isListingExpired(listing, nowMs = Date.now()) {
  return isExpirable(listing) && listing.expiresAt.toMillis() <= nowMs;
}

export function isListingExpiringSoon(listing, nowMs = Date.now()) {
  if (!isExpirable(listing) || isListingExpired(listing, nowMs)) return false;
  return listing.expiresAt.toMillis() - nowMs <= LISTING_EXPIRING_SOON_DAYS * DAY_MS;
}

// Buckets view counts by day so "views today" can be computed without a
// per-view event log. Uses UTC so every client (Benin is a single timezone,
// no DST) buckets the same calendar day consistently.
export function getTodayDateString(nowMs = Date.now()) {
  return new Date(nowMs).toISOString().slice(0, 10);
}
