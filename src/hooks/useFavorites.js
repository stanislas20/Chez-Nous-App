import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";

// The reader's own saved listings, as a set of ids the heart icons consult.
//
// Bounding this has a real edge: somebody past the cap would see an older
// favourite drawn as unsaved. 500 is chosen so that edge is theoretical —
// it is far more than anybody saves in a marketplace — while still refusing
// to open an unbounded realtime listener on a collection a user controls the
// size of. The boundary is written down rather than hidden: see docs/SEARCH.md
// for the same treatment of search's limits.
const FAVORITES_CAP = 500;

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

    const favoritesQuery = query(
      collection(firestore, "favorites"),
      where("userId", "==", userId),
      limit(FAVORITES_CAP),
    );
    const unsubscribe = onSnapshot(
      favoritesQuery,
      (snapshot) => {
        setFavoriteIds(
          new Set(
            snapshot.docs.map((favoriteDoc) => favoriteDoc.data().listingId),
          ),
        );
      },
      () => setFavoriteIds(new Set()),
    );

    return unsubscribe;
  }, [userId]);

  const toggleFavorite = async (listingId) => {
    if (!isFirebaseConfigured || !userId) return;
    const favoriteRef = doc(firestore, "favorites", `${userId}_${listingId}`);
    if (favoriteIds.has(listingId)) {
      await deleteDoc(favoriteRef);
    } else {
      await setDoc(favoriteRef, {
        userId,
        listingId,
        createdAt: serverTimestamp(),
      });
    }
  };

  return { favoriteIds, toggleFavorite };
}
