import { useEffect, useMemo, useState } from "react";
import {
  collection,
  documentId,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";

// Firestore caps an `in` filter at 30 values, so a longer list of sellers
// becomes several queries rather than one.
const CHUNK = 30;

// Ratings for a whole list of sellers at once.
//
// useSellerStats subscribes to one seller, which is right on a profile and
// wrong on a list: a screen showing twenty garages would open twenty
// listeners, and — worse — could not SORT by rating, because each card would
// learn its own score independently and the parent would never hold them all
// at the same moment. "Mieux noté" has to compare, so the scores have to
// arrive together.
//
// sellerStats is public-read (firestore.rules), and a query has to match the
// rule rather than merely be narrower than it — `allow read: if true` is what
// makes this batched form legal at all.
//
// Returns a map of sellerId -> { rating, ratingCount }, or null until the
// first snapshot lands. A seller nobody has rated has no document, so they
// are simply absent from the map: that is "no rating yet", which is not the
// same as zero stars and must never be drawn as one.
export function useSellerRatings(sellerIds) {
  const [byId, setById] = useState(null);

  // Sorted and de-duplicated, then joined, so the effect below re-subscribes
  // when the *set* of sellers changes and not merely when the array
  // identity does — a fresh array on every render would otherwise tear down
  // and rebuild every listener on every keystroke in the search field.
  const key = useMemo(() => {
    const unique = Array.from(new Set((sellerIds ?? []).filter(Boolean)));
    unique.sort();
    return unique.join(",");
  }, [sellerIds]);

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (!isFirebaseConfigured || ids.length === 0) {
      setById(ids.length === 0 ? {} : null);
      return undefined;
    }

    const chunks = [];
    for (let index = 0; index < ids.length; index += CHUNK) {
      chunks.push(ids.slice(index, index + CHUNK));
    }

    // One accumulator across all chunks: each listener owns its own slice
    // and merges into the shared object, so a later chunk arriving does not
    // wipe an earlier one.
    const merged = {};
    const unsubscribes = chunks.map((chunk) =>
      onSnapshot(
        query(
          collection(firestore, "sellerStats"),
          where(documentId(), "in", chunk),
        ),
        (snapshot) => {
          for (const item of snapshot.docs) {
            const data = item.data();
            const ratingCount = Math.max(0, Number(data?.ratingCount) || 0);
            // No ratings means no entry at all rather than a zero: a garage
            // that has never been rated must not render as 0,0 stars beside
            // one that genuinely earned a low score.
            if (ratingCount > 0) {
              merged[item.id] = {
                rating: Math.max(0, Number(data?.rating) || 0),
                ratingCount,
              };
            } else {
              delete merged[item.id];
            }
          }
          setById({ ...merged });
        },
        // A failed lookup shows no stars anywhere, which is the honest
        // outcome: we could not read the scores, so we do not claim any.
        () => setById({}),
      ),
    );

    return () => unsubscribes.forEach((stop) => stop());
  }, [key]);

  return byId;
}
