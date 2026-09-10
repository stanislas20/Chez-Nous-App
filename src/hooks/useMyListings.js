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

// A seller's own listings, live, on their dashboard.
//
// check-bounded-reads.js guards three named hooks and this was not one of
// them, so "Phase B bounded every listings read" was not quite true even of
// listings. A dealership with two thousand active adverts opened an unbounded
// realtime listener over all of them every time it opened its dashboard.
const MY_LISTINGS_CAP = 100;

export function useMyListings(uid) {
  const [listings, setListings] = useState(null);

  useEffect(() => {
    if (!isFirebaseConfigured || !uid) {
      setListings([]);
      return undefined;
    }

    const myListingsQuery = query(
      collection(firestore, "listings"),
      where("sellerId", "==", uid),
      orderBy("createdAt", "desc"),
      limit(MY_LISTINGS_CAP),
    );

    const unsubscribe = onSnapshot(
      myListingsQuery,
      (snapshot) => {
        setListings(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        );
      },
      () => {
        setListings([]);
      },
    );

    return unsubscribe;
  }, [uid]);

  return listings;
}
