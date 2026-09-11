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
  // Whether `total` is a count of matches or only an upper bound. A screen
  // that says "340 results" when it means "at most 340" is the same class of
  // dishonesty as a silent cap.
  const [totalIsExact, setTotalIsExact] = useState(true);

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

  // Counting every candidate costs one aggregation each. Six is far more
  // words than anybody types into a marketplace search, and it keeps the
  // worst case bounded rather than combinatorial.
  const MAX_COUNTED_CANDIDATES = 6;

  const run = useCallback(async () => {
    const hasQuery = wordCount >= 1;
    if (!enabled || !isFirebaseConfigured || !hasQuery) {
      setStatus("idle");
      setResults(null);
      setTotal(null);
      setTotalIsExact(true);
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

    // Ask Firestore which candidate is rarest rather than deciding from word
    // length. A count aggregation is billed at one read per thousand index
    // entries, so this is the cheapest question in the file.
    const cheapest = async (candidates) => {
      const counted = await Promise.all(
        candidates.map(async (candidate) => {
          try {
            const snap = await getCountFromServer(candidateQuery(candidate));
            return { candidate, count: snap.data().count };
          } catch {
            return { candidate, count: Number.POSITIVE_INFINITY };
          }
        }),
      );
      return counted.reduce((a, b) => (b.count < a.count ? b : a));
    };

    try {
      const pairPlan =
        wordCount >= 2
          ? pairs
              .slice(0, MAX_COUNTED_CANDIDATES)
              .map((value) => ({ field: "searchPairs", value }))
          : [];
      const tokenPlan = words
        .slice(0, MAX_COUNTED_CANDIDATES)
        .map((value) => ({ field: "searchTokens", value }));

      // ── Why there is a second attempt ────────────────────────────────
      //
      // A pair covers two words server-side, which is what makes the fetch
      // window contain only real matches. But a pair only exists if BOTH
      // words fall inside the groups searchPairsFor builds from, and for a
      // very long title the twelfth word is not in any of them.
      //
      // Before, that returned zero and called itself complete. Now a pair
      // that matches nothing is treated as "this pair may simply not have
      // been built" rather than "there is nothing to find": the search falls
      // back to the rarest single TOKEN and applies the other words locally,
      // which is what the pre-pair implementation always did — except that
      // the count now tells us whether that local pass saw everything, so
      // the result can say so honestly instead of guessing.
      let best = pairPlan.length ? await cheapest(pairPlan) : null;
      let viaFallback = false;
      if (!best || !Number.isFinite(best.count) || best.count === 0) {
        const tokenBest = await cheapest(tokenPlan);
        if (!best || best.count === 0 || !Number.isFinite(best.count)) {
          best = tokenBest;
          viaFallback = wordCount >= 2;
        }
      }
      if (!mountedRef.current || generation !== generationRef.current) return;
      if (!best || !Number.isFinite(best.count)) {
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
      // A pair already guarantees two words. Everything else — a longer
      // query, or the token fallback — has the remaining words applied here
      // by the matcher every screen shares.
      const needsLocalPass = viaFallback || wordCount > 2 || pairPlan.length === 0;
      const narrowed =
        needsLocalPass && wordCount > 1
          ? rows.filter((listing) =>
              queryMatches(
                text,
                listing.titleFr,
                listing.titleEn,
                listing.city,
                ...listingSearchParts(listing),
              ),
            )
          : rows;

      const visible = visibleListings(narrowed);
      // Exhaustive means: every document that could possibly match was
      // examined. That is true exactly when the chosen candidate had no more
      // matches than the fetch window could hold.
      const exhaustive = best.count <= SEARCH_FETCH;
      const shown = visible.slice(0, SEARCH_RESULTS);

      setResults(shown);
      // The count is the number of listings carrying the chosen pair or
      // token. For a two-word pair search that IS the match count. Whenever a
      // local pass ran, some of those were filtered out, so it is only an
      // upper bound and the UI must not present it as a fact.
      const exact = !needsLocalPass;
      setTotalIsExact(exact);
      setTotal(exhaustive && !exact ? visible.length : best.count);
      setComplete(exhaustive && visible.length <= SEARCH_RESULTS);
      setStatus("ready");
    } catch (error) {
      if (!mountedRef.current || generation !== generationRef.current) return;
      // Said, not swallowed. A failed search and an empty one look identical
      // from the reader's side, and telling somebody "no results" when the
      // query never ran is the failure this whole phase exists to remove —
      // in the other direction.
      setResults(null);
      setTotal(null);
      setTotalIsExact(true);
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
    // False when more matches exist than are being shown, OR when the search
    // could not prove it saw them all. A screen that draws this is the
    // difference between honest pagination and a silent cap.
    complete,
    totalIsExact,
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
