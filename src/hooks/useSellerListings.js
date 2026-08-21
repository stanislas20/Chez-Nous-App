import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { firestore, isFirebaseConfigured } from '../config/firebase';

// A seller's other approved listings — safe to query publicly (the same
// read rule that lets any buyer open one of these listings already allows
// querying them), unlike the private sellers/{uid} profile doc.
export function useSellerListings(sellerId) {
  const [listings, setListings] = useState(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !sellerId) {
      setListings([]);
      return undefined;
    }

    const listingsQuery = query(
      collection(firestore, 'listings'),
      where('sellerId', '==', sellerId),
      where('status', '==', 'approved'),
    );

    const unsubscribe = onSnapshot(
      listingsQuery,
      (snapshot) => {
        setListings(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      },
      () => setListings([]),
    );

    return unsubscribe;
  }, [sellerId]);

  return listings;
}
