import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { firestore, isFirebaseConfigured } from '../config/firebase';

const FEED_LIMIT = 30;

// Recently-approved listings across every seller — the "new posts" half of
// the Notifications bell (the other half is unread messages, see
// useConversations). Ordered by `approvedAt`, not `createdAt`: a listing
// that sat in moderation for a few days should still read as "new" on the
// day it actually goes live, not the day it was originally submitted.
// `approvedAt` is stamped server-side by the notifyListingModerated
// Cloud Function the moment a listing's status flips to 'approved', so
// listings still pending review are naturally excluded (they don't have
// the field yet).
export function useNewListingsFeed() {
  const [listings, setListings] = useState(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setListings([]);
      return undefined;
    }

    const feedQuery = query(
      collection(firestore, 'listings'),
      where('status', '==', 'approved'),
      orderBy('approvedAt', 'desc'),
      limit(FEED_LIMIT),
    );

    const unsubscribe = onSnapshot(
      feedQuery,
      (snapshot) => setListings(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))),
      () => setListings([]),
    );

    return unsubscribe;
  }, []);

  return listings;
}
