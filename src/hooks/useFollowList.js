import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";

// Follower and following lists, newest first.
//
// A page, not a graph. A seller with ten thousand followers must not cost ten
// thousand reads to render a screen that shows the first twenty-five of them,
// so this reads one page and hands back a `loadMore` for the next.
//
// 25 to match REVIEW_PAGE, and to sit inside usePublicProfiles' per-pass
// lookup bound with room to spare — the screen hydrates one avatar per row
// from the public projection, and a page that outran that bound would render
// rows with no face and nothing saying why.
export const FOLLOW_PAGE = 25;

// getDocs rather than onSnapshot, deliberately.
//
// This list was realtime, which bought nothing: a followers list does not
// need to rearrange itself while somebody is reading it, and a live listener
// cannot be paginated with a cursor — every snapshot would replace the whole
// accumulated set and the reader would lose their place. The trade is that a
// follow gained while the screen is open appears on the next visit.
//
// The names come out of the follow document itself rather than from each
// person's profile, because `sellers/{uid}` is readable only by its owner —
// that rule is what keeps RCCM, IFU and ID documents off the wire, and it
// means a followers list can never be assembled by reading profiles. So the
// two names are written into the follow row at the moment it is created, the
// same way a conversation stores participantNames.
//
// Rows written before that existed carry no name; the screen prefers the
// live public displayName anyway and falls back to a neutral placeholder.
export function useFollowList(uid, kind) {
  const [rows, setRows] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  // The cursor, and the guard that stops onEndReached firing the same page
  // twice. FlatList calls it more than once per scroll — on momentum, on
  // layout, on content size change — and without this the second call starts
  // an identical query before the first has moved the cursor, which both
  // double-charges the read and appends every row twice.
  const cursorRef = useRef(null);
  const inFlightRef = useRef(false);
  const activeRef = useRef(true);

  // followers: everyone whose follow points AT this person.
  // following: everyone this person's follows point at.
  const field = kind === "followers" ? "sellerId" : "followerId";

  const fetchPage = useCallback(
    async (cursor) => {
      const constraints = [
        where(field, "==", uid),
        orderBy("createdAt", "desc"),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(FOLLOW_PAGE),
      ];
      const snapshot = await getDocs(
        query(collection(firestore, "follows"), ...constraints),
      );
      return {
        page: snapshot.docs.map((item) => {
          const data = item.data();
          const otherId =
            kind === "followers" ? data.followerId : data.sellerId;
          const otherName =
            kind === "followers" ? data.followerName : data.sellerName;
          return { id: item.id, uid: otherId, name: otherName ?? null };
        }),
        last: snapshot.docs[snapshot.docs.length - 1] ?? null,
        // A page that came back full may have more behind it; a short one is
        // the end of the list.
        more: snapshot.docs.length === FOLLOW_PAGE,
      };
    },
    [field, kind, uid],
  );

  useEffect(() => {
    activeRef.current = true;
    cursorRef.current = null;
    inFlightRef.current = false;
    setRows(null);
    setHasMore(false);
    setError(false);

    if (!isFirebaseConfigured || !uid) {
      setRows([]);
      return undefined;
    }

    inFlightRef.current = true;
    fetchPage(null)
      .then(({ page, last, more }) => {
        if (!activeRef.current) return;
        cursorRef.current = last;
        setRows(page);
        setHasMore(more);
      })
      .catch(() => {
        // Most often a composite index still building. An empty list beats a
        // screen stuck loading forever, and the flag lets the screen say so.
        if (!activeRef.current) return;
        setRows([]);
        setError(true);
      })
      .finally(() => {
        inFlightRef.current = false;
      });

    return () => {
      activeRef.current = false;
    };
  }, [uid, kind, fetchPage]);

  const loadMore = useCallback(() => {
    if (inFlightRef.current) return;
    if (!hasMore) return;
    if (!cursorRef.current) return;

    inFlightRef.current = true;
    setLoadingMore(true);
    fetchPage(cursorRef.current)
      .then(({ page, last, more }) => {
        if (!activeRef.current) return;
        cursorRef.current = last ?? cursorRef.current;
        // Appended, never replaced. A failed or empty next page must not
        // take the rows already on screen with it.
        setRows((current) => [...(current ?? []), ...page]);
        setHasMore(more);
      })
      .catch(() => {
        if (!activeRef.current) return;
        // The rows already loaded stay exactly where they are. Only the
        // promise of more is withdrawn, so the list stops asking.
        setHasMore(false);
        setError(true);
      })
      .finally(() => {
        inFlightRef.current = false;
        if (activeRef.current) setLoadingMore(false);
      });
  }, [fetchPage, hasMore]);

  return { rows, hasMore, loadingMore, error, loadMore };
}
