import { useEffect, useState } from "react";
import {
  collection,
  limit,
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
// But the ORDER BY is descending, and that is not a contradiction. Firestore
// composite indexes are direction-specific, and the deployed index is
// (status ASC, createdAt DESC) — asking for ascending fails the query
// outright with "the query requires an index". Sorting the other way and
// reversing here costs nothing on a queue that is small by definition, and
// removes a dependency on an index nobody would think to check.
// How many pending listings the screen holds at once. Comfortably above any
// backlog a single moderator would let build up, and a hard ceiling on what
// the query can cost.
export const MODERATION_QUEUE_CAP = 100;

export function useModerationQueue(enabled) {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !enabled) {
      setPending([]);
      setLoading(false);
      return undefined;
    }

    setError(null);
    const pendingQuery = query(
      collection(firestore, "listings"),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc"),
      // Bounded, and still realtime — this is one of the two listeners worth
      // paying for, because a moderator working the queue wants a listing to
      // leave it the moment they decide, and wants a new arrival to appear
      // without a pull.
      //
      // The cap is not pagination and does not need to be. A queue is worked
      // to empty; if it is longer than this the number itself is the signal,
      // and the moderator push already carries the true count from a count()
      // aggregation rather than from this array. Oldest-first ordering means
      // the cap drops the NEWEST arrivals, which is the right end to lose:
      // the person waiting longest still gets seen first.
      limit(MODERATION_QUEUE_CAP),
    );

    const unsubscribe = onSnapshot(
      pendingQuery,
      (snapshot) => {
        const rows = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setPending(rows.reverse());
        setLoading(false);
        setError(null);
      },
      (queryError) => {
        // Said, never swallowed.
        //
        // The first version set an empty list here, so a refused read and an
        // empty queue looked identical: the screen said "Rien en attente"
        // while a listing sat waiting and the query was failing on a missing
        // index. An empty state that can also mean "broken" is worse than an
        // error.
        setPending([]);
        setError(queryError?.code || "unknown");
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [enabled]);

  return { pending, loading, error };
}
