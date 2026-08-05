import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { firestore, isFirebaseConfigured } from '../config/firebase';

export function useMyListings(uid) {
  const [listings, setListings] = useState(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !uid) {
      setListings([]);
      return undefined;
    }

    const myListingsQuery = query(
      collection(firestore, 'listings'),
      where('sellerId', '==', uid),
      orderBy('createdAt', 'desc'),
    );

    const unsubscribe = onSnapshot(
      myListingsQuery,
      (snapshot) => {
        setListings(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      },
      () => {
        setListings([]);
      },
    );

    return unsubscribe;
  }, [uid]);

  return listings;
}
