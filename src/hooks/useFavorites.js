import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { firestore, isFirebaseConfigured } from '../config/firebase';

// Persists the heart-toggle on listing cards server-side, per user, instead
// of the previous local-only React state (which reset on every app restart
// and had no way to be viewed anywhere else — see SavedListingsScreen).
export function useFavorites(userId) {
  const [favoriteIds, setFavoriteIds] = useState(new Set());

  useEffect(() => {
    if (!isFirebaseConfigured || !userId) {
      setFavoriteIds(new Set());
      return undefined;
    }

    const favoritesQuery = query(collection(firestore, 'favorites'), where('userId', '==', userId));
    const unsubscribe = onSnapshot(
      favoritesQuery,
      (snapshot) => {
        setFavoriteIds(new Set(snapshot.docs.map((favoriteDoc) => favoriteDoc.data().listingId)));
      },
      () => setFavoriteIds(new Set()),
    );

    return unsubscribe;
  }, [userId]);

  const toggleFavorite = async (listingId) => {
    if (!isFirebaseConfigured || !userId) return;
    const favoriteRef = doc(firestore, 'favorites', `${userId}_${listingId}`);
    if (favoriteIds.has(listingId)) {
      await deleteDoc(favoriteRef);
    } else {
      await setDoc(favoriteRef, { userId, listingId, createdAt: serverTimestamp() });
    }
  };

  return { favoriteIds, toggleFavorite };
}
