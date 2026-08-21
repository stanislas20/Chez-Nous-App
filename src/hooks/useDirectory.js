import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";

// Directories that people who never sign up still belong in: the brand
// distributors and the sales parks.
//
// These started life as hardcoded arrays compiled into the bundle, which
// meant a new dealership could only be listed by shipping a release to both
// stores. They now come from Firestore, added by hand from the console, and
// the bundled array stays as the seed.
//
// The fallback is not belt-and-braces — it is the point. This row is one of
// the few things the Cars screen can always say something true about, and a
// cold start on a bad connection would otherwise show it empty. So the
// bundled list renders immediately, and live rows replace it the moment the
// snapshot lands. Same shape as useApprovedListings falling back to mock
// data when Firebase is unreachable.
//
// `order` is optional and only used to keep hand-entered rows in a
// deliberate sequence; rows without it fall to the end in id order.
// `approvedOnly` is for the directories that accept submissions from the
// app. The query has to carry the same filter the rules enforce — a query
// wider than the rule is denied outright rather than filtered — so this is
// what keeps a pending park out of the public list.
export function useDirectory(collectionName, fallback, { approvedOnly } = {}) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setRows(null);
      return undefined;
    }

    const unsubscribe = onSnapshot(
      approvedOnly
        ? query(
            collection(firestore, collectionName),
            where("status", "==", "approved"),
            orderBy("order", "asc"),
          )
        : query(collection(firestore, collectionName), orderBy("order", "asc")),
      (snapshot) => {
        // An empty collection means nobody has added one yet, not that the
        // directory is empty — keep the seed rather than blanking a section
        // that was populated a second ago.
        if (snapshot.empty) {
          setRows(null);
          return;
        }
        setRows(
          snapshot.docs.map((item) => ({ key: item.id, ...item.data() })),
        );
      },
      // Missing index, offline, rules not deployed: all of them mean "no
      // live data", and all of them should leave the seed on screen.
      () => setRows(null),
    );

    return unsubscribe;
  }, [collectionName, approvedOnly]);

  return rows ?? fallback;
}
