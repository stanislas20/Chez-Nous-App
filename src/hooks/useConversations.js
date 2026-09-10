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

// The newest threads, live. Older ones are still reachable by searching or
// from the listing; what this must not do is hold a realtime listener over
// every conversation a busy seller has ever had, re-delivered on every write.
const CONVERSATIONS_CAP = 50;

export function useConversations(uid) {
  const [conversations, setConversations] = useState(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !uid) {
      setConversations([]);
      return undefined;
    }

    const conversationsQuery = query(
      collection(firestore, "conversations"),
      where("participantIds", "array-contains", uid),
      orderBy("lastMessageAt", "desc"),
      limit(CONVERSATIONS_CAP),
    );

    const unsubscribe = onSnapshot(
      conversationsQuery,
      (snapshot) => {
        setConversations(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        );
      },
      () => {
        setConversations([]);
      },
    );

    return unsubscribe;
  }, [uid]);

  return conversations;
}
