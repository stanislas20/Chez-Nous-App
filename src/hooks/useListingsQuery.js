import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";
import { visibleListings } from "../utils/listingVisibility";

// Bounded reads, in one place.
//
// What this replaces: useApprovedListings opened a realtime listener over
// every approved listing in the database — no limit, no cursor — and
// twenty-seven call sites filtered the resulting array in JavaScript. The
// cost of a screen was therefore the size of the catalogue, not the size of
// what the screen showed, and it was paid again on every cold start because
// the JS SDK has no disk cache in React Native (see src/config/firebase.js).
// At ten thousand listings that is tens of megabytes down a metered
// connection before the first card paints.
//
// The shape here is deliberately small: a page of documents, a cursor, and
// the four states a screen has to be able to draw. It is not a data layer
// and not a cache library — the app has neither and does not need one to
// stop reading the whole database.
//
// Three rules the callers depend on:
//
//   1. The array it returns has exactly the shape useApprovedListings
//      returned — plain listing objects with `id` — so the useMemo bodies in
//      thirteen derived hooks and a dozen screens did not have to change.
//   2. Documents are deduplicated by id. A page boundary that shifts under
//      an insert would otherwise show the same listing twice, and two React
//      children with the same key is a rendering bug that only appears once
//      there is enough data to paginate.
//   3. Nothing is fetched until `enabled` is true, so a screen can hold a
//      query back until it knows what to ask for.

// How many documents a page holds. Chosen against a phone screen rather than
// against a round number: a two-column grid shows about six rows without
// scrolling, and thirty gives roughly five screens of scroll before the next
// page is needed — enough that load-more is rarely visible, small enough that
// the first paint is quick on a slow connection.
export const DEFAULT_PAGE_SIZE = 30;

// A stable key for a set of constraints, so the effect below re-runs when the
// QUERY changes and not merely when the caller re-rendered and handed us a
// fresh array literal. Without this every render tears down and re-issues the
// query, which is worse than the unbounded listener it replaces.
function signatureOf(filters, order, pageSize, realtime) {
  return JSON.stringify([
    filters.map((f) => [f.field, f.op, f.value]),
    order,
    pageSize,
    realtime,
  ]);
}

function buildConstraints(filters, order, pageSize, cursor) {
  const parts = [where("status", "==", "approved")];
  for (const filter of filters) {
    if (filter?.value === undefined || filter?.value === null) continue;
    parts.push(where(filter.field, filter.op ?? "==", filter.value));
  }
  parts.push(orderBy(order[0], order[1] ?? "desc"));
  if (cursor) parts.push(startAfter(cursor));
  parts.push(limit(pageSize));
  return parts;
}

/**
 * A bounded, paginated read of approved listings.
 *
 * @param filters  [{ field, op, value }] — pushed into the query, not applied
 *                 in JavaScript. A null/undefined value is dropped, so a
 *                 caller can pass an optional filter without branching.
 * @param order    [field, direction] — must have a composite index alongside
 *                 `status` and every equality field. See firestore.indexes.json.
 * @param pageSize documents per page.
 * @param realtime keep a listener on the FIRST page only. Off by default:
 *                 a browse grid does not need to animate as strangers post.
 * @param enabled  false holds the query back entirely.
 */
export function useListingsQuery({
  filters = [],
  order = ["createdAt", "desc"],
  pageSize = DEFAULT_PAGE_SIZE,
  realtime = false,
  enabled = true,
} = {}) {
  const [pages, setPages] = useState([]);
  const [status, setStatus] = useState(
    isFirebaseConfigured ? "loading" : "unconfigured",
  );
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const signature = signatureOf(filters, order, pageSize, realtime);
  // Read inside callbacks so they do not need the arrays in their dependency
  // lists — the signature above is what actually decides when to re-query.
  const latest = useRef({ filters, order, pageSize });
  latest.current = { filters, order, pageSize };

  // The last document of the last page, which is what startAfter takes. A
  // ref rather than state: changing it must not re-render, and loadMore has
  // to see the value the previous call wrote even within the same tick.
  const cursorRef = useRef(null);
  // Guards a second loadMore issued while the first is in flight — a fast
  // scroll fires onEndReached repeatedly, and two pages from the same cursor
  // are the same page twice.
  const inFlightRef = useRef(false);
  // Invalidated on every re-query so a page that arrives late cannot append
  // itself to a list it no longer belongs to.
  const generationRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchFirstPage = useCallback(
    async ({ refreshing } = {}) => {
      if (!isFirebaseConfigured) {
        setStatus("unconfigured");
        setPages([]);
        return;
      }
      const generation = (generationRef.current += 1);
      cursorRef.current = null;
      inFlightRef.current = false;
      if (refreshing) setIsRefreshing(true);
      else setStatus("loading");

      const { filters: f, order: o, pageSize: size } = latest.current;
      try {
        const snapshot = await getDocs(
          query(
            collection(firestore, "listings"),
            ...buildConstraints(f, o, size, null),
          ),
        );
        if (!mountedRef.current || generation !== generationRef.current) return;
        cursorRef.current = snapshot.docs[snapshot.docs.length - 1] ?? null;
        setPages([snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))]);
        setHasMore(snapshot.docs.length === size);
        setStatus("ready");
      } catch (error) {
        if (!mountedRef.current || generation !== generationRef.current) return;
        // A missing composite index, a rules refusal and a dead connection
        // all land here, and a screen has to be able to say so rather than
        // draw an empty grid — an empty state that can also mean "broken" is
        // the bug useApprovedListingsState was written to avoid.
        setStatus("error");
        setHasMore(false);
      } finally {
        if (mountedRef.current) setIsRefreshing(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  );

  const loadMore = useCallback(async () => {
    if (!isFirebaseConfigured) return;
    if (inFlightRef.current || !hasMore || !cursorRef.current) return;
    if (status !== "ready") return;

    inFlightRef.current = true;
    const generation = generationRef.current;
    setIsLoadingMore(true);
    const { filters: f, order: o, pageSize: size } = latest.current;
    try {
      const snapshot = await getDocs(
        query(
          collection(firestore, "listings"),
          ...buildConstraints(f, o, size, cursorRef.current),
        ),
      );
      if (!mountedRef.current || generation !== generationRef.current) return;
      cursorRef.current =
        snapshot.docs[snapshot.docs.length - 1] ?? cursorRef.current;
      const next = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPages((current) => [...current, next]);
      setHasMore(snapshot.docs.length === size);
    } catch (error) {
      if (!mountedRef.current || generation !== generationRef.current) return;
      // A failed page is not a failed screen: the pages already held stay on
      // screen and hasMore stays true, so the reader can try again by
      // scrolling. Turning the whole grid into an error state because page
      // four timed out would throw away three pages that are perfectly good.
      setHasMore(true);
    } finally {
      if (mountedRef.current) setIsLoadingMore(false);
      inFlightRef.current = false;
    }
  }, [hasMore, status]);

  useEffect(() => {
    fetchFirstPage();
  }, [fetchFirstPage]);

  // Realtime, where it is worth paying for: a listener on the first page
  // only, so a screen that genuinely wants to move as documents change costs
  // one bounded target instead of the whole collection. Later pages stay
  // one-shot reads — a listener per page would rebuild the same unbounded
  // subscription one page at a time.
  useEffect(() => {
    if (!realtime || !enabled || !isFirebaseConfigured) return undefined;
    const { filters: f, order: o, pageSize: size } = latest.current;
    const unsubscribe = onSnapshot(
      query(
        collection(firestore, "listings"),
        ...buildConstraints(f, o, size, null),
      ),
      (snapshot) => {
        if (!mountedRef.current) return;
        setPages((current) => {
          const next = [...current];
          next[0] = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          return next;
        });
        setStatus("ready");
      },
      () => {
        if (mountedRef.current) setStatus("error");
      },
    );
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, enabled, realtime]);

  // Flattened and deduplicated. The dedupe is not defensive tidiness: a
  // listing approved between page one and page two shifts every later
  // document one place, so the same id genuinely does arrive twice, and two
  // list children with one key is a rendering fault that only shows up once
  // there is enough data to paginate — which is to say, never on a
  // developer's machine.
  const listings = useMemo(() => {
    const byId = new Map();
    for (const page of pages) {
      for (const item of page) {
        if (!byId.has(item.id)) byId.set(item.id, item);
      }
    }
    return visibleListings([...byId.values()]);
  }, [pages]);

  const refresh = useCallback(
    () => fetchFirstPage({ refreshing: true }),
    [fetchFirstPage],
  );

  return {
    listings,
    status,
    // Distinct from `listings.length === 0`: a page whose documents were all
    // filtered out as expired is empty and still has more behind it.
    isEmpty: status === "ready" && listings.length === 0 && !hasMore,
    hasMore,
    isLoadingMore,
    isRefreshing,
    loadMore,
    refresh,
  };
}
