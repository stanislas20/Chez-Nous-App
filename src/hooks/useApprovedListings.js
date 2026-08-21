import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";
import { isListingExpired } from "../utils/listingLifecycle";

const SOLD_VISIBILITY_MS = 24 * 60 * 60 * 1000;
const RECHECK_INTERVAL_MS = 5 * 60 * 1000;

// Returns { listings, status } rather than just the array, because null on
// its own conflates three situations a screen has to treat differently:
//
//   loading      — first snapshot hasn't landed. Show nothing yet.
//   ready        — real data, possibly an empty array. Show it as-is.
//   error        — the query failed (a composite index still building, rules,
//                  connectivity). Say so. Do NOT substitute sample data:
//                  invented listings during an outage send a buyer chasing a
//                  seller who doesn't exist.
//   unconfigured — no Firebase env at all, i.e. a developer's machine with no
//                  backend. Sample data is what makes the app buildable here.
//
// useApprovedListings() below keeps the old array-or-null shape for the
// screens that only need "have I got data", so this split didn't have to
// touch every caller.
export function useApprovedListingsState() {
  const [rawListings, setRawListings] = useState(null);
  const [status, setStatus] = useState(
    isFirebaseConfigured ? "loading" : "unconfigured",
  );
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      // Stay null (not []) so screens can tell "no backend" apart from
      // "backend loaded, genuinely zero listings" and fall back to mock data.
      setRawListings(null);
      setStatus("unconfigured");
      return undefined;
    }

    const listingsQuery = query(
      collection(firestore, "listings"),
      where("status", "==", "approved"),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      listingsQuery,
      (snapshot) => {
        setRawListings(
          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            _hasPendingWrites: doc.metadata.hasPendingWrites,
          })),
        );
        setStatus("ready");
      },
      () => {
        // e.g. a newly-created composite index still building, or a rules
        // change that broke this query. Screens surface this as a failure —
        // see the status doc above for why they must not paper over it with
        // sample listings.
        setRawListings(null);
        setStatus("error");
      },
    );

    return unsubscribe;
  }, []);

  // Re-evaluate the sold-listing cutoff periodically, since Firestore's
  // onSnapshot only fires on data changes, not as time passes.
  useEffect(() => {
    const interval = setInterval(
      () => setTick((value) => value + 1),
      RECHECK_INTERVAL_MS,
    );
    return () => clearInterval(interval);
  }, []);

  const listings = useMemo(() => {
    if (!rawListings) {
      return rawListings;
    }
    const now = Date.now();
    return rawListings.filter((listing) => {
      // Pharmacy duty rosters aren't hidden once dutyUntil passes: real
      // overnight coverage always exists even when our data is between
      // ONPB's weekly publications, so the last known roster stays visible
      // (labeled accordingly — see getDutyLabel) rather than disappearing.
      if (listing.categoryKey === "pharmacyOnDuty") {
        return true;
      }

      // A listing past its 30-day run stops showing to buyers until the
      // seller renews it (see the "expiring soon"/"expired" À faire items
      // and handleRenewListing on the dashboard) — it isn't deleted, just
      // hidden from browse the same way a stale sold listing is.
      if (isListingExpired(listing, now)) {
        return false;
      }

      if (listing.saleStatus !== "sold") {
        return true;
      }
      const soldAtMs = listing.soldAt?.toMillis?.();
      if (!soldAtMs) {
        // No soldAt yet: keep showing only if this is our own optimistic
        // write still in flight (serverTimestamp() resolves a moment
        // later). If it's confirmed server data with no soldAt, that's a
        // stuck/incomplete record — hide it rather than showing it forever.
        return Boolean(listing._hasPendingWrites);
      }
      return now - soldAtMs < SOLD_VISIBILITY_MS;
    });
  }, [rawListings, tick]);

  return useMemo(() => ({ listings, status }), [listings, status]);
}

// The original shape: the filtered array, or null while loading / on failure
// / with no backend. Kept for the screens that only branch on "do I have
// data" — RealEstateScreen, VehicleListScreen, CarsScreen and the rest never
// substituted sample data, so they have nothing to distinguish.
export function useApprovedListings() {
  return useApprovedListingsState().listings;
}
