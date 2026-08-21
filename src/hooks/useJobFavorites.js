import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { firestore, isFirebaseConfigured } from '../config/firebase';

// Same server-side persistence pattern as useFavorites.js (listings), but
// for job postings — kept as its own collection rather than mixed into
// `favorites`, since job ids (mockJobs' "j1".."j5") and listing ids come
// from different id spaces and mean different things to favorite.
export function useJobFavorites(userId) {
  const [favoriteIds, setFavoriteIds] = useState(new Set());

  useEffect(() => {
    if (!isFirebaseConfigured || !userId) {
      setFavoriteIds(new Set());
      return undefined;
    }

    const favoritesQuery = query(collection(firestore, 'jobFavorites'), where('userId', '==', userId));
    const unsubscribe = onSnapshot(
      favoritesQuery,
      (snapshot) => {
        setFavoriteIds(new Set(snapshot.docs.map((favoriteDoc) => favoriteDoc.data().jobId)));
      },
      () => setFavoriteIds(new Set()),
    );

    return unsubscribe;
  }, [userId]);

  const toggleFavorite = async (jobId) => {
    if (!isFirebaseConfigured || !userId) return;
    const favoriteRef = doc(firestore, 'jobFavorites', `${userId}_${jobId}`);
    if (favoriteIds.has(jobId)) {
      await deleteDoc(favoriteRef);
    } else {
      await setDoc(favoriteRef, { userId, jobId, createdAt: serverTimestamp() });
    }
  };

  return { favoriteIds, toggleFavorite };
}
