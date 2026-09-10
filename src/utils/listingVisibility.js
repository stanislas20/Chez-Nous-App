import { isListingExpired } from "./listingLifecycle";

// Which approved listings a buyer should actually see.
//
// Lifted out of useApprovedListings unchanged, because the paginated reads
// now need the same answer and two copies of this rule would drift within a
// week — one of them would keep showing listings that lapsed a month ago and
// nothing would say which.
//
// It stays client-side rather than moving into the query, and that is a
// deliberate limit rather than an oversight. Hiding an expired listing needs
// `expiresAt > now`, which is an inequality, and Firestore requires the first
// orderBy to be on the inequality field — so pushing it down would force
// every browse query to be ordered by expiry instead of by recency, which is
// not the order any of these screens want. The cost is that a page can come
// back partly filtered, which is why hasMore is driven by the number of
// DOCUMENTS a page returned rather than by how many survived this.
const SOLD_VISIBILITY_MS = 24 * 60 * 60 * 1000;

export function isListingVisible(listing, nowMs = Date.now()) {
  // Pharmacy duty rosters are never hidden for age: real overnight coverage
  // exists even when our data sits between ONPB's weekly publications, so the
  // last known roster stays up, labelled for what it is.
  if (listing.categoryKey === "pharmacyOnDuty") return true;

  // Past its run and not renewed. Not deleted — the seller can still see and
  // renew it from the dashboard; it is out of browse until they do.
  if (isListingExpired(listing, nowMs)) return false;

  if (listing.saleStatus !== "sold") return true;

  const soldAtMs = listing.soldAt?.toMillis?.();
  if (!soldAtMs) {
    // A sold listing with no timestamp is either our own optimistic write
    // still in flight — serverTimestamp() resolves a moment later, and
    // `_hasPendingWrites` is how a realtime snapshot says so — or a stuck
    // record. Keep the first, hide the second.
    //
    // A page read through getDocs carries no pending writes by definition, so
    // the flag is absent there and such a listing is hidden, which is the
    // same answer the realtime path gives for confirmed server data.
    return Boolean(listing._hasPendingWrites);
  }
  // Sold listings linger for a day: a buyer who was talking to the seller
  // about it should see what happened rather than find it simply gone.
  return nowMs - soldAtMs < SOLD_VISIBILITY_MS;
}

export function visibleListings(listings, nowMs = Date.now()) {
  if (!listings) return listings;
  return listings.filter((listing) => isListingVisible(listing, nowMs));
}
