import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  documentId,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";
import { visibleListings } from "../utils/listingVisibility";

// The listings behind a set of ids the caller already holds.
//
// Saved listings were built by downloading every approved listing in the
// database and keeping the handful whose id was in the viewer's favourites.
// The favourites are already a list of ids — there was never a reason to read
// anything else — so this fetches exactly those documents and nothing more.
//
// Firestore caps an `in` filter at 30 values, so a longer list becomes
// several queries, the same way useSellerRatings already chunks. Thirty is
// also more saved listings than most people will ever have, so the common
// case is one read.
const CHUNK = 30;

// A favourite can outlive what it points at: the listing was deleted, or
// refused by a moderator, or has lapsed. Those documents simply do not come
// back, which is the correct answer — the row disappears rather than
// rendering a card for something nobody can open. It also means the count of
// what is returned can be smaller than the count of ids, and callers must not
// treat that as an error.
export function useListingsByIds(ids) {
  const [listings, setListings] = useState(null);
  const [status, setStatus] = useState(
    isFirebaseConfigured ? "loading" : "unconfigured",
  );

  // Sorted and joined so the effect re-runs when the SET changes rather than
  // when the caller handed us a fresh array with the same contents — a Set
  // spread on every render would otherwise refetch on every render.
  const key = useMemo(() => {
    const unique = [...new Set((ids ?? []).filter(Boolean))];
    unique.sort();
    return unique.join(",");
  }, [ids]);

  const generationRef = useRef(0);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setStatus("unconfigured");
      setListings(null);
      return undefined;
    }
    const wanted = key ? key.split(",") : [];
    if (wanted.length === 0) {
      setListings([]);
      setStatus("ready");
      return undefined;
    }

    const generation = (generationRef.current += 1);
    let cancelled = false;
    setStatus("loading");

    (async () => {
      try {
        const chunks = [];
        for (let i = 0; i < wanted.length; i += CHUNK) {
          chunks.push(wanted.slice(i, i + CHUNK));
        }
        const snapshots = await Promise.all(
          chunks.map((chunk) =>
            getDocs(
              query(
                collection(firestore, "listings"),
                where(documentId(), "in", chunk),
              ),
            ),
          ),
        );
        if (cancelled || generation !== generationRef.current) return;
        const rows = snapshots.flatMap((snapshot) =>
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
        );
        // Returned in the order the caller asked for, not the order Firestore
        // happened to answer in — the saved list should not reshuffle itself
        // between openings.
        const byId = new Map(rows.map((row) => [row.id, row]));
        setListings(wanted.map((id) => byId.get(id)).filter(Boolean));
        setStatus("ready");
      } catch (error) {
        if (cancelled || generation !== generationRef.current) return;
        setListings(null);
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key]);

  return {
    listings: listings ? visibleListings(listings) : null,
    status,
  };
}
