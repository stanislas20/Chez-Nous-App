import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";

// Everything waiting for a decision, oldest first.
//
// Oldest first on purpose: a queue worked newest-first strands whatever
// arrived on a busy day at the bottom forever, and the person waiting longest
// is the one with most reason to give up on the app.
//
// Only a moderator can read this — the rules refuse a pending listing to
// anybody but its author and somebody holding the claim — so the screen above
// it must not be reachable without one, or it renders a permission error.
export function useModerationQueue(enabled) {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !enabled) {
      setPending([]);
      setLoading(false);
      return undefined;
    }

    const pendingQuery = query(
      collection(firestore, "listings"),
      where("status", "==", "pending"),
      orderBy("createdAt", "asc"),
    );

    const unsubscribe = onSnapshot(
      pendingQuery,
      (snapshot) => {
        setPending(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      () => {
        // A refused read means the claim has not reached this token yet.
        // Empty rather than an error screen: the queue is not the app.
        setPending([]);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [enabled]);

  return { pending, loading };
}
