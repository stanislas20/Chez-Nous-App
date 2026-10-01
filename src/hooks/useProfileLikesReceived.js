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
import { useAuth } from "../auth/AuthContext";

// The people who have liked YOUR profile, a page at a time.
//
// Owner-only, and the ownership is taken from auth rather than from a route
// param. A screen that trusted `route.params.sellerId` would hand anyone
// else's like list to anyone who could type a uid, and the fact that nothing
// in the app links there today is not a boundary — it is an omission waiting
// to be undone by the next navigation change. firestore.rules enforces the
// same thing independently; this is the half that stops us ever asking.
//
// Same shape as useFollowList, deliberately: 25 behind a cursor, an
// in-flight guard because FlatList fires onEndReached more than once per
// scroll, pages appended rather than replacing, and a failed page that
// withdraws only the promise of more.
export const PROFILE_LIKES_PAGE = 25;

export function useProfileLikesReceived() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [rows, setRows] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const cursorRef = useRef(null);
  const inFlightRef = useRef(false);
  const activeRef = useRef(true);

  const fetchPage = useCallback(
    async (cursor) => {
      const snapshot = await getDocs(
        query(
          collection(firestore, "profileLikes"),
          where("sellerId", "==", uid),
          orderBy("createdAt", "desc"),
          ...(cursor ? [startAfter(cursor)] : []),
          limit(PROFILE_LIKES_PAGE),
        ),
      );
      return {
        page: snapshot.docs.map((item) => {
          const data = item.data();
          return {
            id: item.id,
            uid: data.likerId,
            // Seconds rather than a Timestamp object, so the row can format
            // it without importing Firestore's type. Null while the server
            // timestamp is still resolving on the writer's own device.
            createdAtMs: data.createdAt?.toMillis?.() ?? null,
          };
        }),
        last: snapshot.docs[snapshot.docs.length - 1] ?? null,
        more: snapshot.docs.length === PROFILE_LIKES_PAGE,
      };
    },
    [uid],
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
        // screen stuck loading forever.
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
  }, [uid, fetchPage]);

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
        setRows((current) => [...(current ?? []), ...page]);
        setHasMore(more);
      })
      .catch(() => {
        if (!activeRef.current) return;
        // The rows already loaded stay exactly where they are.
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
