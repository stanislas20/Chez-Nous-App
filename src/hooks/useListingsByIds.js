import { useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";
import { visibleListings } from "../utils/listingVisibility";

// The listings behind a set of ids the caller already holds.
//
// Saved listings were built by downloading every approved listing in the
// database and keeping the handful whose id was in the viewer's favourites.
// The favourites are already a list of ids — there was never a reason to read
// anything else — so this fetches exactly those documents and nothing more.
//
// Read one document at a time, not `where(documentId(), "in", [...])`.
//
// The `in` form was the first attempt and it is broken in a way that only
// shows up with real data: a query is all-or-nothing against the rules, and
// the listings read rule tests `resource.data.status`, which THROWS for an id
// that no longer exists. So one deleted favourite did not drop one row — it
// failed the whole query with permission-denied, and Saved listings showed
// "listings unavailable" for a screenful of perfectly good saved items. The
// same happened for a favourite whose listing a moderator had since rejected.
//
// Measured in scripts/rules-tests/indexes.test.js, and the comment this
// replaces claimed the opposite: that missing documents "simply do not come
// back, which is the correct answer". They do not come back — they take the
// screen with them.
//
// Reading each id separately costs the same. Firestore bills a document read
// per document either way, and a favourites list is bounded by the reader's
// own saving, so this is neither slower nor more expensive — it is only
// correct. Failures are per-id, so a deleted listing removes its own row and
// nothing else.
//
// Chunked so a reader with two hundred favourites does not open two hundred
// simultaneous connections.
const CHUNK = 30;
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
        const rows = [];
        let anyFailed = false;
        for (let i = 0; i < wanted.length; i += CHUNK) {
          const chunk = wanted.slice(i, i + CHUNK);
          const settled = await Promise.all(
            chunk.map(async (id) => {
              try {
                const snapshot = await getDoc(doc(firestore, "listings", id));
                return snapshot.exists()
                  ? { id: snapshot.id, ...snapshot.data() }
                  : null;
              } catch (error) {
                // A listing the reader may no longer read — rejected, or
                // pulled back into moderation. Its row goes; the rest of the
                // screen does not.
                anyFailed = true;
                return null;
              }
            }),
          );
          rows.push(...settled.filter(Boolean));
        }
        if (cancelled || generation !== generationRef.current) return;
        // Returned in the order the caller asked for, not the order Firestore
        // happened to answer in — the saved list should not reshuffle itself
        // between openings.
        const byId = new Map(rows.map((row) => [row.id, row]));
        setListings(wanted.map((id) => byId.get(id)).filter(Boolean));
        // Ready even when some ids failed: the screen has real rows to draw
        // and the missing ones are genuinely gone. Only a total failure with
        // nothing to show is worth calling an error, and that is what an
        // offline read produces.
        setStatus(rows.length === 0 && anyFailed ? "error" : "ready");
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
