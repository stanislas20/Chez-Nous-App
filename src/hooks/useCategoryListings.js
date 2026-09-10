import { useCallback, useEffect, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";
import { visibleListings } from "../utils/listingVisibility";

// One read per category, shared by every screen and hook that wants it.
//
// Thirteen derived hooks — batteries, tyres, garages, car washes, drivers,
// driving schools, trucks, insurers, import helpers, events, hotels, parts
// sellers — each called useApprovedListings and then filtered the whole
// catalogue down to one category in JavaScript. Six of them wanted the same
// category. The read was the entire collection either way.
//
// This pushes the one filter Firestore can actually index into the query, and
// then makes sure that six hooks asking for "services" issue ONE query rather
// than six. That second half is why this is a tiny module-level store rather
// than a plain hook: without it, converting the hooks would trade one
// unbounded read for six bounded ones, which on the Services screen is not
// obviously a win.
//
// It is not a cache library and is not trying to become one. A Map, a promise
// per key so concurrent mounts coalesce, a subscriber set, and a staleness
// window. No invalidation graph, no query language, nothing to learn.

// The ceiling on one category.
//
// Honest about what it is: these screens are directories — every garage, every
// tyre fitter — sorted by distance from the reader, and a directory has no
// natural page. So this is a bound, not pagination, and a category that grows
// past it shows the most recently published rows. That is a real limit and it
// is written down rather than discovered: the fix for a category with
// thousands of live rows is a geographic query, which needs a geohash field on
// every listing and is a data migration, not a hook.
//
// 200 against today's catalogue is far above the largest category and far
// below the "download everything" it replaces.
export const CATEGORY_CAP = 200;

// How much a "voir plus" adds. The window GROWS rather than paging, which is
// the same shape ChatScreen uses and for the same reason: these screens group
// the whole set before rendering — by trade, by city, by custom label — and a
// cursor through grouped sections reshuffles them as pages land. A growing
// window is monotonic, so a section only ever gains rows.
export const CATEGORY_PAGE = 200;

// How long a category's rows are reused before the next mount refetches.
// Long enough that moving between Garages, Pneus and Batterie — three screens
// on the same category, one after another — is one read rather than three.
const STALE_AFTER_MS = 5 * 60 * 1000;

const cache = new Map();

function entryFor(key) {
  if (!cache.has(key)) {
    cache.set(key, {
      listings: null,
      status: isFirebaseConfigured ? "loading" : "unconfigured",
      fetchedAt: 0,
      promise: null,
      subscribers: new Set(),
      // How many documents this category is currently asking for, and
      // whether the answer filled it. Without the second, a truncated
      // category is indistinguishable from a complete one — which is what
      // scripts/rules-tests/categoryCap.test.js measured: at 1,000 listings
      // the reader was shown 200 and nothing said so.
      window: CATEGORY_CAP,
      hasMore: false,
    });
  }
  return cache.get(key);
}

function publish(entry) {
  for (const notify of entry.subscribers) notify();
}

async function load(categoryKey, entry) {
  // A second mount while the first read is in flight waits on the same
  // promise instead of issuing its own query.
  if (entry.promise) return entry.promise;

  entry.promise = (async () => {
    try {
      const snapshot = await getDocs(
        query(
          collection(firestore, "listings"),
          where("status", "==", "approved"),
          where("categoryKey", "==", categoryKey),
          orderBy("createdAt", "desc"),
          limit(entry.window),
        ),
      );
      entry.listings = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      // A page that came back full may have more behind it; one that came
      // back short is the whole category.
      entry.hasMore = snapshot.docs.length === entry.window;
      entry.status = "ready";
      entry.fetchedAt = Date.now();
    } catch (error) {
      // Missing index, rules refusal, or no connection. The previous rows are
      // kept if there were any — a screen that had a directory a second ago
      // should not blank because a refresh failed — and the status says what
      // happened so the screen can show it.
      entry.status = entry.listings ? "ready" : "error";
    } finally {
      entry.promise = null;
      publish(entry);
    }
  })();

  return entry.promise;
}

/**
 * Approved listings in one category, bounded and shared.
 *
 * Returns the same plain-object array useApprovedListings returned, so the
 * useMemo bodies in the derived hooks did not have to change — only the line
 * that fetches.
 */
export function useCategoryListings(categoryKey) {
  const [, forceRender] = useState(0);
  const entry = categoryKey ? entryFor(categoryKey) : null;

  useEffect(() => {
    if (!categoryKey || !isFirebaseConfigured) return undefined;
    const current = entryFor(categoryKey);
    const notify = () => forceRender((n) => n + 1);
    current.subscribers.add(notify);

    if (!current.promise && Date.now() - current.fetchedAt > STALE_AFTER_MS) {
      load(categoryKey, current);
    }

    return () => {
      current.subscribers.delete(notify);
    };
  }, [categoryKey]);

  const refresh = useCallback(() => {
    if (!categoryKey || !isFirebaseConfigured) return Promise.resolve();
    const current = entryFor(categoryKey);
    current.fetchedAt = 0;
    return load(categoryKey, current);
  }, [categoryKey]);

  // Grows the window by a page and refetches.
  //
  // Only the screens that genuinely browse an aisle to its end call this.
  // A directory landing page — Cars, Services, Garages — shows rails and
  // groupings and is a discovery surface rather than an exhaustive list, so
  // it keeps the plain 200 and says nothing.
  const loadMore = useCallback(() => {
    if (!categoryKey || !isFirebaseConfigured) return Promise.resolve();
    const current = entryFor(categoryKey);
    if (current.promise || !current.hasMore) return Promise.resolve();
    current.window += CATEGORY_PAGE;
    current.fetchedAt = 0;
    return load(categoryKey, current);
  }, [categoryKey]);

  if (!categoryKey || !isFirebaseConfigured) {
    return {
      listings: null,
      status: "unconfigured",
      hasMore: false,
      isLoadingMore: false,
      refresh,
      loadMore,
    };
  }

  return {
    // Expired and stale-sold rows are dropped here rather than in the query,
    // for the reason listingVisibility explains: it is an inequality, and
    // Firestore would make it dictate the sort order.
    listings: entry.listings ? visibleListings(entry.listings) : null,
    status: entry.status,
    // Whether this category was cut. Before this existed a truncated list and
    // a complete one looked identical to every caller, so no screen could
    // offer to show the rest and none said the list was not all of it.
    hasMore: entry.hasMore,
    isLoadingMore: Boolean(entry.promise) && Boolean(entry.listings),
    refresh,
    loadMore,
  };
}

// Several screens want two categories at once — Camions reads both vehicles
// and services, because a haulier may be filed under either.
export function useCategoryListingsMulti(categoryKeys) {
  const key = (categoryKeys ?? []).filter(Boolean).sort().join("|");
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!key || !isFirebaseConfigured) return undefined;
    const keys = key.split("|");
    const notify = () => forceRender((n) => n + 1);
    const entries = keys.map((k) => entryFor(k));
    for (const entry of entries) entry.subscribers.add(notify);
    for (let i = 0; i < keys.length; i += 1) {
      const entry = entries[i];
      if (!entry.promise && Date.now() - entry.fetchedAt > STALE_AFTER_MS) {
        load(keys[i], entry);
      }
    }
    return () => {
      for (const entry of entries) entry.subscribers.delete(notify);
    };
  }, [key]);

  if (!key || !isFirebaseConfigured) {
    return { listings: null, status: "unconfigured" };
  }

  const keys = key.split("|");
  const entries = keys.map((k) => entryFor(k));
  const anyReady = entries.some((e) => e.listings);
  if (!anyReady) {
    return {
      listings: null,
      status: entries.some((e) => e.status === "error") ? "error" : "loading",
    };
  }
  const merged = entries.flatMap((e) => e.listings ?? []);
  return { listings: visibleListings(merged), status: "ready" };
}

// For tests and for a signed-out → signed-in transition, where holding rows
// read under the previous session is simply confusing.
export function clearCategoryListingsCache() {
  cache.clear();
}
