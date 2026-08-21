import { useCallback, useEffect, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { firestore, isFirebaseConfigured } from '../config/firebase';

// Per-user "last opened the Notifications tab" timestamp, stored on their
// own sellers/{uid} doc. Anything approved after this is what makes up the
// unseen badge count. A missing value (pre-existing accounts that signed up
// before this field existed) is treated as "right now" rather than "the
// beginning of time" — and self-heals by writing it — so nobody gets
// retroactively hit with weeks of catalog history the first time this
// shipped.
export function useNotificationsSeen(uid) {
  const [lastSeenAt, setLastSeenAt] = useState(undefined); // undefined = still loading

  useEffect(() => {
    if (!isFirebaseConfigured || !uid) {
      setLastSeenAt(null);
      return undefined;
    }

    const ref = doc(firestore, 'sellers', uid);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        const hasField = data && Object.prototype.hasOwnProperty.call(data, 'notificationsLastSeenAt');
        if (!hasField) {
          setLastSeenAt(new Date());
          setDoc(ref, { notificationsLastSeenAt: serverTimestamp() }, { merge: true }).catch(() => {});
          return;
        }
        // A serverTimestamp() we just wrote locally echoes back as null
        // until the server confirms it — skip that tick rather than
        // treating it as "never recorded" and looping the self-heal write.
        if (data.notificationsLastSeenAt) {
          setLastSeenAt(data.notificationsLastSeenAt.toDate());
        }
      },
      () => setLastSeenAt(null),
    );

    return unsubscribe;
  }, [uid]);

  const markSeen = useCallback(() => {
    if (!isFirebaseConfigured || !uid) return;
    setDoc(doc(firestore, 'sellers', uid), { notificationsLastSeenAt: serverTimestamp() }, { merge: true }).catch(
      () => {},
    );
  }, [uid]);

  return { lastSeenAt, markSeen };
}
