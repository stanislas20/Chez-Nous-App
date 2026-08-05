import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { firestore, isFirebaseConfigured } from '../config/firebase';

const SOLD_VISIBILITY_MS = 24 * 60 * 60 * 1000;
const RECHECK_INTERVAL_MS = 5 * 60 * 1000;

export function useApprovedListings() {
  const [rawListings, setRawListings] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      // Stay null (not []) so screens can tell "no backend" apart from
      // "backend loaded, genuinely zero listings" and fall back to mock data.
      setRawListings(null);
      return undefined;
    }

    const listingsQuery = query(
      collection(firestore, 'listings'),
      where('status', '==', 'approved'),
      orderBy('createdAt', 'desc'),
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
      },
      () => {
        // Falls back to mock listings (see ForYouScreen) if the live query fails,
        // e.g. while a newly-created composite index is still building.
        setRawListings(null);
      },
    );

    return unsubscribe;
  }, []);

  // Re-evaluate the sold-listing cutoff periodically, since Firestore's
  // onSnapshot only fires on data changes, not as time passes.
  useEffect(() => {
    const interval = setInterval(() => setTick((value) => value + 1), RECHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return useMemo(() => {
    if (!rawListings) {
      return rawListings;
    }
    const now = Date.now();
    return rawListings.filter((listing) => {
      // Pharmacy duty rosters aren't hidden once dutyUntil passes: real
      // overnight coverage always exists even when our data is between
      // ONPB's weekly publications, so the last known roster stays visible
      // (labeled accordingly — see getDutyLabel) rather than disappearing.
      if (listing.categoryKey === 'pharmacyOnDuty') {
        return true;
      }

      if (listing.saleStatus !== 'sold') {
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
}
