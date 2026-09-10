import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { queryMatches } from "../utils/search";
import { primarySearchToken, querySearchTokens } from "../utils/searchTokens";
import { listingSearchParts } from "../data/customCategories";

// Search that asks Firestore, instead of filtering what happens to be loaded.
//
// Phase C measured what the alternative costs: a listing at position 2,321 of
// 2,408 — approved, live, matching the query exactly — could not be found by
// six of the app's ten search surfaces, because each of them filtered an array
// bounded at 60 or 200. To a buyer that is indistinguishable from "there
// isn't one"; to the seller it is invisible.
//
// ── How one query serves a multi-word search ────────────────────────────
//
// `array-contains` takes exactly one value. So the query is sent as the single
// most selective token — the longest, which in practice is the rarest
// ("corolla" narrows far harder than "toyota") — and the AND semantics of the
// remaining words are applied to what comes back, by the same queryMatches
// every screen already used. That keeps one round trip, one index, and the
// existing matcher's behaviour: accent folding, bilingual stopwords, the
// fuzzy prefix rule and the one-bad-word tolerance on long spoken queries.
//
// The alternative, `array-contains-any`, is wrong rather than merely
// different: it is an OR, so searching "toyota corolla" would return every
// Toyota and every Corolla and rank neither.
//
// ── Why it fetches more than it shows ──────────────────────────────────
//
// The remote page is the token's matches; the local filter then narrows to
// the full query. Fetching exactly as many as the screen shows would mean a
// two-word search often returned almost nothing, because most of the page was
// spent on listings matching only the first word. SEARCH_FETCH is the
// headroom, and it is a bound, not a catalogue: this reads at most 120
// documents whatever the database holds.
const SEARCH_FETCH = 120;

// What the caller is shown. Distinct from SEARCH_FETCH above.
const SEARCH_RESULTS = 60;

/**
 * Remote search over approved listings.
 *
 * @param queryText   what the reader typed.
 * @param filters     [{ field, value }] — pushed into the query, same shape as
 *                    useListingsQuery. categoryKey and city are the two that
 *                    have indexes.
 * @param enabled     false holds the search back entirely.
 *
 * Returns `status: "idle"` when there is nothing worth searching for, which is
 * how a screen knows to show its ordinary browse list rather than an empty
 * search.
 */
export function useListingsSearch(queryText, { filters = [], enabled = true } = {}) {
  const [results, setResults] = useState(null);
  const [status, setStatus] = useState("idle");

  const token = useMemo(() => primarySearchToken(queryText ?? ""), [queryText]);
  const wordCount = useMemo(
    () => querySearchTokens(queryText ?? "").length,
    [queryText],
  );
  // Stable across renders that did not change the query, so the effect below
  // does not re-issue on every keystroke that only moved the cursor.
  const filterKey = useMemo(
    () => JSON.stringify(filters.map((f) => [f.field, f.value])),
    [filters],
  );

  const latest = useRef({ filters, queryText });
  latest.current = { filters, queryText };
  const generationRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    if (!enabled || !isFirebaseConfigured || !token) {
      setStatus(token ? "idle" : "idle");
      setResults(null);
      return;
    }
    const generation = (generationRef.current += 1);
    setStatus("searching");

    const { filters: activeFilters, queryText: text } = latest.current;
    try {
      const constraints = [
        where("status", "==", "approved"),
        where("searchTokens", "array-contains", token),
      ];
      for (const filter of activeFilters) {
        if (filter?.value === undefined || filter?.value === null) continue;
        constraints.push(where(filter.field, filter.op ?? "==", filter.value));
      }
      constraints.push(orderBy("createdAt", "desc"), limit(SEARCH_FETCH));

      const snapshot = await getDocs(
        query(collection(firestore, "listings"), ...constraints),
      );
      if (!mountedRef.current || generation !== generationRef.current) return;

      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      // The rest of the words, and the existing matcher's own cleverness.
      // A single-word query needs no second pass — the token IS the query —
      // so this only costs anything when it earns it.
      const narrowed =
        wordCount <= 1
          ? rows
          : rows.filter((listing) =>
              queryMatches(
                text,
                listing.titleFr,
                listing.titleEn,
                listing.city,
                ...listingSearchParts(listing),
              ),
            );

      setResults(visibleListings(narrowed).slice(0, SEARCH_RESULTS));
      setStatus("ready");
    } catch (error) {
      if (!mountedRef.current || generation !== generationRef.current) return;
      // Said, not swallowed. A failed search and an empty one look identical
      // from the reader's side, and telling somebody "no results" when the
      // query never ran is the failure this whole phase exists to remove —
      // in the other direction.
      setResults(null);
      setStatus("error");
    }
  }, [token, wordCount, filterKey, enabled]);

  useEffect(() => {
    run();
  }, [run]);

  return {
    // null while idle, so a screen can tell "not searching" from "searched
    // and found nothing".
    results,
    status,
    // The three states a screen has to draw, named rather than derived at
    // each call site.
    isSearching: status === "searching",
    isEmpty: status === "ready" && (results?.length ?? 0) === 0,
    failed: status === "error",
    retry: run,
  };
}

// How long to wait after the last keystroke before asking Firestore.
//
// Every keystroke issuing a query would be a document read per character
// typed, on a connection the reader pays for by the megabyte. 350ms is about
// the gap between words rather than between letters, so an ordinary two-word
// search costs one query rather than fourteen.
export const SEARCH_DEBOUNCE_MS = 350;

export function useDebouncedValue(value, delay = SEARCH_DEBOUNCE_MS) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
