import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";

// The people following someone, or the people they follow.
//
// The names come out of the follow document itself rather than from each
// person's profile, because `sellers/{uid}` is readable only by its owner —
// that rule is what keeps RCCM, IFU and ID documents off the wire, and it
// means a followers list can never be assembled by reading profiles. So the
// two names are written into the follow row at the moment it is created,
// the same way a conversation stores participantNames.
//
// Rows written before that existed carry no name and render as a neutral
// placeholder rather than a guess.
export function useFollowList(uid, kind) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !uid) {
      setRows([]);
      return undefined;
    }

    // followers: everyone whose follow points AT this person.
    // following: everyone this person's follows point at.
    const field = kind === "followers" ? "sellerId" : "followerId";

    const followsQuery = query(
      collection(firestore, "follows"),
      where(field, "==", uid),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      followsQuery,
      (snapshot) =>
        setRows(
          snapshot.docs.map((item) => {
            const data = item.data();
            const otherId =
              kind === "followers" ? data.followerId : data.sellerId;
            const otherName =
              kind === "followers" ? data.followerName : data.sellerName;
            return { id: item.id, uid: otherId, name: otherName ?? null };
          }),
        ),
      // Most often a composite index still building. An empty list beats a
      // screen stuck loading forever.
      () => setRows([]),
    );

    return unsubscribe;
  }, [uid, kind]);

  return rows;
}
