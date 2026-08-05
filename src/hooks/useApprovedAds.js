import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { firestore, isFirebaseConfigured } from '../config/firebase';

export function useApprovedAds() {
  const [ads, setAds] = useState(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setAds([]);
      return undefined;
    }

    const adsQuery = query(
      collection(firestore, 'ads'),
      where('status', '==', 'approved'),
      orderBy('createdAt', 'desc'),
    );

    const unsubscribe = onSnapshot(adsQuery, (snapshot) => {
      setAds(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    return unsubscribe;
  }, []);

  return ads;
}
