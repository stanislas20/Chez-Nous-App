import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { firestore, isFirebaseConfigured } from '../config/firebase';

export function useConversations(uid) {
  const [conversations, setConversations] = useState(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !uid) {
      setConversations([]);
      return undefined;
    }

    const conversationsQuery = query(
      collection(firestore, 'conversations'),
      where('participantIds', 'array-contains', uid),
      orderBy('lastMessageAt', 'desc'),
    );

    const unsubscribe = onSnapshot(
      conversationsQuery,
      (snapshot) => {
        setConversations(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      },
      () => {
        setConversations([]);
      },
    );

    return unsubscribe;
  }, [uid]);

  return conversations;
}
