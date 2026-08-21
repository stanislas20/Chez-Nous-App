import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";

// Newest first, capped: a profile shows recent experience, and nobody
// scrolls to review number 200. The average on the profile comes from
// sellerStats, which counts every rating rather than just these.
const REVIEW_PAGE = 25;

export function useRatings(ratedId) {
  const [ratings, setRatings] = useState(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !ratedId) {
      setRatings([]);
      return undefined;
    }

    const ratingsQuery = query(
      collection(firestore, "ratings"),
      where("ratedId", "==", ratedId),
      orderBy("updatedAt", "desc"),
      limit(REVIEW_PAGE),
    );

    const unsubscribe = onSnapshot(
      ratingsQuery,
      (snapshot) => setRatings(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
      // Most often a composite index still building; an empty list is a
      // better failure than a screen stuck loading forever.
      () => setRatings([]),
    );

    return unsubscribe;
  }, [ratedId]);

  return ratings;
}

// Everything the rating control needs: whether this person is allowed to
// rate at all, and what they said last time if they already have.
export function useMyRating(ratedId, userId) {
  const [state, setState] = useState({ canRate: false, isReady: false, myRating: null });

  useEffect(() => {
    let active = true;

    if (!isFirebaseConfigured || !ratedId || !userId || ratedId === userId) {
      setState({ canRate: false, isReady: true, myRating: null });
      return undefined;
    }

    // The contacts marker is the interaction gate — see firestore.rules.
    // Checked both ways round because it is stored under the sorted pair.
    const pair = [userId, ratedId].sort().join("_");

    const unsubscribe = onSnapshot(
      doc(firestore, "ratings", `${userId}_${ratedId}`),
      async (snapshot) => {
        let canRate = false;
        try {
          const contact = await getDoc(doc(firestore, "contacts", pair));
          canRate = contact.exists();
        } catch {
          canRate = false;
        }
        if (!active) return;
        setState({
          canRate,
          isReady: true,
          myRating: snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null,
        });
      },
      () => active && setState({ canRate: false, isReady: true, myRating: null }),
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [ratedId, userId]);

  return state;
}

// Returns whether the write landed, so the caller can say something useful
// instead of leaving a button that appears to do nothing.
export async function submitRating({ ratedId, userId, stars, comment, isEdit }) {
  if (!isFirebaseConfigured || !ratedId || !userId || ratedId === userId) return false;
  const value = Number(stars);
  if (!Number.isInteger(value) || value < 1 || value > 5) return false;

  try {
    await setDoc(
      doc(firestore, "ratings", `${userId}_${ratedId}`),
      {
        raterId: userId,
        ratedId,
        stars: value,
        comment: String(comment ?? "")
          .trim()
          .slice(0, 500),
        updatedAt: serverTimestamp(),
        // Only on the first write. `merge` does not protect a field you
        // send again — including createdAt here would restamp an edited
        // review as if it were new.
        ...(isEdit ? {} : { createdAt: serverTimestamp() }),
      },
      { merge: true },
    );
    return true;
  } catch {
    return false;
  }
}

export async function removeRating({ ratedId, userId }) {
  if (!isFirebaseConfigured || !ratedId || !userId) return false;
  try {
    await deleteDoc(doc(firestore, "ratings", `${userId}_${ratedId}`));
    return true;
  } catch {
    return false;
  }
}
