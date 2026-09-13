import { useEffect, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";

// Notifications the server actually recorded, as opposed to the three the
// notification centre derives.
//
// The centre was built entirely out of things that were already in Firestore
// for another reason — unread conversations, listings that just cleared
// moderation, applications to your own postings. That works for exactly
// those three and silently fails for everything else: a push about a
// pharmacy roster has no listing and no conversation behind it, so there was
// nothing for the centre to derive it from, and the row simply did not
// exist. openNotification's default branch sends such a push here anyway,
// which is how "Voir" arrived at an empty screen.
//
// sellers/{uid}/notifications is the server's own record of what it told
// somebody. A subcollection rather than a top-level collection with a uid
// field, for two reasons: the security rule is `request.auth.uid == userId`
// with nothing to look up, and ordering by createdAt inside one person's
// subcollection needs no composite index, so this ships without an index
// deploy.
//
// Fifty is a screenful several times over. The list is capped rather than
// paged because these are read once and acted on; nobody scrolls their
// notification history, and an unbounded listener on a collection that only
// grows is the exact shape check-collection-reads.js exists to refuse.
const PAGE_SIZE = 50;

export function useStoredNotifications(uid) {
  // null = still loading, [] = loaded and empty. The screen tells those two
  // apart to avoid flashing "no notifications yet" over a list that is on
  // its way.
  const [notifications, setNotifications] = useState(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !uid) {
      setNotifications([]);
      return undefined;
    }

    const unsubscribe = onSnapshot(
      query(
        collection(firestore, "sellers", uid, "notifications"),
        orderBy("createdAt", "desc"),
        limit(PAGE_SIZE),
      ),
      (snapshot) =>
        setNotifications(
          snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
        ),
      // A denied or failed read renders as "none", not as a permanent
      // spinner. The badge undercounts for that session, which is the
      // failure mode that costs least.
      () => setNotifications([]),
    );

    return unsubscribe;
  }, [uid]);

  return notifications;
}
