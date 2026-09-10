import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { firestore, isFirebaseConfigured } from "../config/firebase";
import { visibleListings } from "../utils/listingVisibility";
import { queryMatches } from "../utils/search";
import { queryPairCandidates, querySearchTokens } from "../utils/searchTokens";
import { listingSearchParts } from "../data/customCategories";

// Search that asks Firestore, instead of filtering what happens to be loaded.
//
// Phase C measured what the alternative costs: a listing at position 2,321 of
// 2,408 — approved, live, matching the query exactly — could not be found by
// six of the app's ten search surfaces, because each of them filtered an array
// bounded at 60 or 200. To a buyer that is indistinguishable from "there
// isn't one"; to the seller it is invisible.
//
// ── How a multi-word search stays honest ───────────────────────────────
//
// `array-contains` takes exactly one value, and the first version of this
// hook answered that by sending the longest query token and applying the
// other words to whatever came back. The independent audit measured what that
// costs and the answer was the bug this whole line of work exists to remove.
// Searching "iphone 15" sent "iphone"; Firestore returned the newest 120
// listings carrying that word; not one of them was an iPhone 15; the screen
// said "no results" while two exact matches sat in the database. Same for
// "toyota rav4", because "toyota" is longer than "rav4" and length is not
// rarity.
//
// The fix is not a better guess at which token to send. It is to stop sending
// a token at all when there is more than one word. Every listing carries the
// unordered PAIRS of its meaningful words — see searchPairsFor — so
// "15|iphone" is one array value meaning "contains both". Sending that means
// every document Firestore returns already matches both words. The cap can
// still bound how many matches are shown, which is ordinary pagination; it
// can no longer fill itself with documents that do not match and report
// nothing.
//
// ── Which pair, decided by counting rather than by guessing ─────────────
//
// A three-word query offers three pairs and they are not equally selective.
// Rather than assume, the hook asks Firestore: getCountFromServer on each
// candidate, in parallel, and sends the rarest. A count aggregation is billed
// at one read per thousand index entries it scans, so this is the cheapest
// question in the file and it is answered with real data.
//
// The count is kept afterwards, because it turns the cap from a silent
// truncation into a statement: `total` is how many listings actually match,
// and `complete` says whether the reader is looking at all of them. A screen
// can then say "showing the newest 60 of 340" instead of quietly implying
// there are 60.
//
// `array-contains-any` is not the answer here and never was: it is an OR, so
// "toyota corolla" would return every Toyota and every Corolla.
//
// ── Why it still fetches more than it shows ────────────────────────────
//
// A pair covers two words. A longer query has the remainder applied locally by
// the same queryMatches every screen already used — accent folding, bilingual
// stopwords, the fuzzy prefix rule, the one-bad-word tolerance. SEARCH_FETCH
// is the headroom for that narrowing, and it is a bound rather than a
// catalogue: at most 120 documents, whatever the database holds.
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

  // How many matches exist, and whether the reader is seeing all of them.
  const [total, setTotal] = useState(null);
  const [complete, setComplete] = useState(true);

  const words = useMemo(() => querySearchTokens(queryText ?? ""), [queryText]);
  const wordCount = words.length;
  // A one-word query is still a single token against searchTokens; there is
  // no pair to form and nothing to narrow afterwards.
  const pairs = useMemo(
    () => (wordCount >= 2 ? queryPairCandidates(queryText ?? "") : []),
    [queryText, wordCount],
  );
  const planKey = useMemo(
    () => (wordCount >= 2 ? pairs.join(",") : (words[0] ?? "")),
    [pairs, words, wordCount],
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

  // Counting every candidate pair costs one aggregation each. Six is far more
  // words than anybody types into a marketplace search, and it keeps the worst
  // case bounded rather than combinatorial.
  const MAX_COUNTED_CANDIDATES = 6;

  const run = useCallback(async () => {
    const hasQuery = wordCount >= 1;
    if (!enabled || !isFirebaseConfigured || !hasQuery) {
      setStatus("idle");
      setResults(null);
      setTotal(null);
      setComplete(true);
      return;
    }
    const generation = (generationRef.current += 1);
    setStatus("searching");

    const { filters: activeFilters, queryText: text } = latest.current;

    // The filters belong on every query this function issues — the counts as
    // much as the fetch. Counting matches across the whole catalogue and then
    // fetching within one city would report a total the reader can never
    // reach.
    const scopeConstraints = [where("status", "==", "approved")];
    for (const filter of activeFilters) {
      if (filter?.value === undefined || filter?.value === null) continue;
      scopeConstraints.push(where(filter.field, filter.op ?? "==", filter.value));
    }

    const listings = collection(firestore, "listings");
    const candidateQuery = (candidate) =>
      query(
        listings,
        ...scopeConstraints,
        where(candidate.field, "array-contains", candidate.value),
      );

    try {
      const candidates =
        wordCount >= 2
          ? pairs
              .slice(0, MAX_COUNTED_CANDIDATES)
              .map((value) => ({ field: "searchPairs", value }))
          : [{ field: "searchTokens", value: words[0] }];

      if (candidates.length === 0) {
        setStatus("idle");
        setResults(null);
        setTotal(null);
        setComplete(true);
        return;
      }

      // Ask Firestore which candidate is rarest, rather than deciding from
      // word length. One aggregation each, in parallel, and a candidate whose
      // count fails is simply not chosen.
      const counts = await Promise.all(
        candidates.map(async (candidate) => {
          try {
            const snap = await getCountFromServer(candidateQuery(candidate));
            return { candidate, count: snap.data().count };
          } catch {
            return { candidate, count: Number.POSITIVE_INFINITY };
          }
        }),
      );
      if (!mountedRef.current || generation !== generationRef.current) return;

      const best = counts.reduce((a, b) => (b.count < a.count ? b : a));
      if (!Number.isFinite(best.count)) {
        // Every count failed, which means the query itself will fail too —
        // usually a missing index. Say so rather than showing an empty page.
        throw new Error("search-count-unavailable");
      }

      const snapshot = await getDocs(
        query(
          candidateQuery(best.candidate),
          orderBy("createdAt", "desc"),
          limit(SEARCH_FETCH),
        ),
      );
      if (!mountedRef.current || generation !== generationRef.current) return;

      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Two words are already guaranteed by the pair. Anything longer has its
      // remaining words applied here, by the matcher every screen shares.
      const narrowed =
        wordCount <= 2
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

      const visible = visibleListings(narrowed);
      setResults(visible.slice(0, SEARCH_RESULTS));
      // For one and two word queries the count IS the number of matches, so
      // the screen can be exact. Beyond that the local narrowing has removed
      // some of them and the count becomes an upper bound, so completeness is
      // judged on what actually came back.
      setTotal(best.count);
      setComplete(
        wordCount <= 2
          ? best.count <= SEARCH_RESULTS
          : snapshot.size < SEARCH_FETCH && visible.length <= SEARCH_RESULTS,
      );
      setStatus("ready");
    } catch (error) {
      if (!mountedRef.current || generation !== generationRef.current) return;
      // Said, not swallowed. A failed search and an empty one look identical
      // from the reader's side, and telling somebody "no results" when the
      // query never ran is the failure this whole phase exists to remove —
      // in the other direction.
      setResults(null);
      setTotal(null);
      setComplete(true);
      setStatus("error");
    }
  }, [planKey, wordCount, filterKey, enabled]);

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
    // How many approved listings match, within the same filters. Null unless
    // a search actually ran.
    total,
    // False when more matches exist than are being shown. A screen that draws
    // this is the difference between honest pagination and a silent cap.
    complete,
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
