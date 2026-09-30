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
import { startOfDayMs } from "../data/events";

// Upcoming events, ordered by when they happen.
//
// ── Why this is not useCategoryListings ─────────────────────────────────
//
// That hook asks for the most recently CREATED listings in a category and
// caps the result. For every other category that is the right question: a
// fridge posted today is more interesting than a fridge posted in March.
// For events it is the wrong one twice over.
//
//   It orders by the wrong clock. A concert announced in January and
//   happening in June is older than a hundred listings posted since, so a
//   busy month pushes a real, upcoming event out of the window entirely —
//   and the screen cannot show what it never fetched.
//
//   It fetches the past. Every event that has already happened still
//   occupies a slot in that window, and the client throws them away after
//   paying to read them.
//
// So events get their own query: approved, in the events category, dated
// today or later, ordered by the date they happen. The generic hook is left
// exactly as it is, because it serves a dozen other categories whose
// bounded-read and cache behaviour has nothing to do with this.
//
// ── Why a one-shot read and not a listener ──────────────────────────────
//
// An onSnapshot here would hold an open subscription on a query over the
// whole listings collection for every person who opens the tab. Events do
// not change second to second; what was actually broken is that the screen
// never asked again. So it asks again on focus, and on a pull — which costs
// a read when somebody is looking, rather than a subscription while they
// are not.
const EVENT_CAP = 200;
// Long enough that returning to the tab mid-session does not re-read, short
// enough that an event approved while the app is open turns up.
const STALE_AFTER_MS = 60 * 1000;

// Module-level, like useCategoryListings': the tab is mounted and unmounted
// as the user moves around, and refetching on every mount is what a cache
// exists to avoid. One key, because there is one query.
let cache = {
  listings: null,
  status: isFirebaseConfigured ? "loading" : "unconfigured",
  fetchedAt: 0,
  promise: null,
  subscribers: new Set(),
};

function publish() {
  for (const notify of cache.subscribers) notify();
}

async function load() {
  if (cache.promise) return cache.promise;
  cache.promise = (async () => {
    try {
      const snapshot = await getDocs(
        query(
          collection(firestore, "listings"),
          where("status", "==", "approved"),
          where("categoryKey", "==", "events"),
          // Midnight this morning, not "now": an event that started at
          // eight tonight is still tonight's event at nine.
          where("eventDateMs", ">=", startOfDayMs()),
          // The soonest first. This is the ordering the screen reads as
          // "what is on", and it is deterministic.
          orderBy("eventDateMs", "asc"),
          limit(EVENT_CAP),
        ),
      );
      cache.listings = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      cache.status = "ready";
      cache.fetchedAt = Date.now();
    } catch {
      // An empty screen is worse than a stale one: keep whatever was last
      // read and say so through the status.
      cache.status = cache.listings ? "ready" : "error";
    } finally {
      cache.promise = null;
      publish();
    }
  })();
  return cache.promise;
}

export function useUpcomingEvents() {
  const [, force] = useState(0);

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;
    const notify = () => force((n) => n + 1);
    cache.subscribers.add(notify);
    if (!cache.listings || Date.now() - cache.fetchedAt > STALE_AFTER_MS) {
      load();
    }
    return () => cache.subscribers.delete(notify);
  }, []);

  // Always re-reads. This is what the Events screen calls when it gains
  // focus and when somebody pulls the list down, and both are a person
  // saying "is there anything new?" — answering from a cache would be
  // answering a different question.
  const refresh = useCallback(() => {
    if (!isFirebaseConfigured) return Promise.resolve();
    return load();
  }, []);

  return { listings: cache.listings, status: cache.status, refresh };
}

// Tests only. The module-level cache outlives a single case otherwise.
export function __resetUpcomingEventsCache() {
  cache = {
    listings: null,
    status: isFirebaseConfigured ? "loading" : "unconfigured",
    fetchedAt: 0,
    promise: null,
    subscribers: new Set(),
  };
}
