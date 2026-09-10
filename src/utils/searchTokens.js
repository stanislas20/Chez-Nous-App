// The words a listing can be found by.
//
// Phase C measured the problem: six of ten search surfaces could not find a
// listing that exists, approved and matching exactly, because every screen
// filtered an array that was already on the device and the listing had never
// been downloaded. "No results" and "we don't have one" are indistinguishable
// to a buyer, and invisible to the seller.
//
// This is the document half of the fix — the words that go INTO the listing.
// The query half is useListingsSearch, and the matcher that ranks and
// AND-combines what comes back is the existing queryMatches in search.js,
// unchanged.
//
// ── This file has a twin ────────────────────────────────────────────────
//
// functions/searchTokens.js is the same logic in the Cloud Functions package,
// because the tokens are generated SERVER-side (see below) and `functions/`
// is deployed on its own — it cannot import from `src/`. Two copies drift, so
// scripts/check-search-tokens.js runs both against the same fixtures and
// requires byte-identical output. That is the same device this project
// already uses for POSTING_DIAL, listingLimits and listingStoragePaths.
//
// This copy exists so the tests, the query side and any future client-side
// preview can use it without reaching into functions/.

// Mirrors the private STOPWORDS in search.js. Words that carry no
// search-relevant meaning on their own, in both languages the app speaks.
const STOPWORDS = new Set([
  "a", "an", "the", "i", "me", "my", "for", "of", "to", "in", "on", "near",
  "please", "show", "find", "search", "looking", "look", "want", "need",
  "some", "any", "with", "is", "are", "can", "you", "get", "give",
  "je", "veux", "voudrais", "cherche", "cherchez", "trouve", "trouver",
  "un", "une", "des", "le", "la", "les", "de", "du", "pour", "dans",
  "pres", "proche", "sil", "vous", "plait", "montre", "montrez", "moi",
  "peux", "pouvez", "avec", "est", "sont", "donne", "donnez",
]);

// How many tokens a listing may carry.
//
// A cap rather than a suggestion: `searchTokens` is an array on a document
// every reader downloads, and an unbounded one is both a document-size
// problem and a way to be found by every query ever run. Forty is generous
// against a real listing — a title, a brand, a model, a city, a quartier and
// a dozen description words — and small enough that a thousand listings cost
// what a thousand listings should.
//
// Enforced in firestore.rules as well as here, because a cap that only lives
// in the writer is not a cap.
export const SEARCH_TOKEN_MAX = 40;

// A single token's bounds. One character is noise; twenty-four characters is
// longer than any French or English word anybody searches for, and the limit
// is what stops a pasted paragraph becoming one enormous "word".
export const SEARCH_TOKEN_MIN_LENGTH = 2;
export const SEARCH_TOKEN_MAX_LENGTH = 24;

// How much of the description is allowed in. Deliberately small and
// deliberately last: a description is prose, and prose fills a token cap with
// words nobody searches. The title and the attributes are what people type.
const DESCRIPTION_TOKEN_LIMIT = 12;

// Accent, case, punctuation and spacing, folded to one form.
//
// Character-for-character the `fold` in src/utils/search.js, and it must stay
// that way: the query is folded by that one and the document by this one, and
// a difference between them is a listing that can never be found. The
// character class is the combining-diacritic block U+0300–U+036F, which is
// what NFD leaves behind once é becomes e + ◌́.
export function foldForSearch(value) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function tokenize(value) {
  return foldForSearch(value)
    .split(" ")
    .filter(
      (word) =>
        word.length >= SEARCH_TOKEN_MIN_LENGTH &&
        word.length <= SEARCH_TOKEN_MAX_LENGTH &&
        !STOPWORDS.has(word),
    );
}

// The fields a listing is searched by, in the order they earn their place.
//
// Order matters because the array is truncated at SEARCH_TOKEN_MAX: what
// comes first survives. Title first because it is what people type; then the
// attributes that identify the thing (a brand, a model, a trade); then where
// it is; then a little of the description.
//
// The category KEY is included and the category LABELS are not. Filtering by
// category is done by the query — `where("categoryKey", "==", …)` — so the
// tokens do not need to carry "voiture" and "vehicle", and duplicating the
// bilingual category tables into the Cloud Functions package to produce them
// would be a lot of drift for something the filter already does.
function sourceStrings(listing) {
  if (!listing) return [];
  const ordered = [
    // What it is called.
    listing.titleFr,
    listing.titleEn,
    listing.title,
    // What it is. A vehicle's make and model, a service's trade, and the
    // free-text labels a seller chose when the list did not cover them.
    listing.brand,
    listing.model,
    listing.trade,
    listing.customCategory,
    listing.customTrade,
    listing.partType,
    listing.company,
    listing.cuisine,
    listing.categoryKey,
    // Where it is.
    listing.city,
    listing.quartier,
    listing.area,
  ];
  return ordered.filter((value) => typeof value === "string" && value);
}

/**
 * The token array for one listing document.
 *
 * Deterministic: the same document always produces the same array, in the
 * same order. That is what makes the backfill idempotent — it can compare
 * what it would write against what is there and skip the write.
 */
export function searchTokensFor(listing) {
  const seen = new Set();
  const tokens = [];

  const add = (word) => {
    if (tokens.length >= SEARCH_TOKEN_MAX) return;
    if (seen.has(word)) return;
    seen.add(word);
    tokens.push(word);
  };

  for (const value of sourceStrings(listing)) {
    for (const word of tokenize(value)) add(word);
  }

  // Last, and bounded. See DESCRIPTION_TOKEN_LIMIT.
  //
  // Guarded, because this function is handed whatever a Firestore snapshot
  // held — including nothing at all, on a document deleted between the
  // trigger firing and it running.
  const description =
    listing?.descriptionFr || listing?.descriptionEn || listing?.description || "";
  let taken = 0;
  for (const word of tokenize(description)) {
    if (taken >= DESCRIPTION_TOKEN_LIMIT) break;
    if (seen.has(word)) continue;
    add(word);
    taken += 1;
  }

  return tokens;
}

// Whether a stored array already matches what this listing should have.
// Used by the backfill and the trigger so neither writes a document that is
// already correct — which is what keeps both idempotent and stops the trigger
// re-firing itself.
export function searchTokensUnchanged(listing, existing) {
  const next = searchTokensFor(listing);
  if (!Array.isArray(existing) || existing.length !== next.length) return false;
  return next.every((token, index) => existing[index] === token);
}

// The token a query should actually be sent to Firestore as.
//
// `array-contains` takes ONE value, so a multi-word search has to pick one and
// filter the rest client-side. The longest token is the most selective in
// practice: "corolla" narrows far harder than "toyota", and rarity correlates
// with length in both languages here. Stopwords are already gone.
//
// Returns null when there is nothing worth sending — an empty query, or one
// made entirely of filler — and the caller then shows the unfiltered list
// rather than an empty search.
export function primarySearchToken(query) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return null;
  return tokens.reduce((best, word) => (word.length > best.length ? word : best));
}

// Every meaningful token in a query, for callers that want to know how many
// words the reader typed.
export function querySearchTokens(query) {
  return tokenize(query);
}

// ── Pairs: the conjunction, moved to the server ─────────────────────────
//
// `array-contains` takes one value, so Phase D sent the single "most
// selective" token and filtered the rest of the words in JavaScript over
// whatever came back. The independent audit showed what that costs. Querying
// "iphone 15" sent "iphone", Firestore returned the newest 120 listings
// carrying that word, none of them were the iPhone 15, and the search said
// "no results" while two exact matches sat in the database. The window was
// full of documents that did not match.
//
// A pair fixes the shape of the problem rather than the choice of token. Each
// listing carries every unordered 2-token combination of its most meaningful
// words, so "15|iphone" is a single value that means "contains both". Sending
// that as the array-contains means every document Firestore returns already
// matches both words — the cap can bound how many matches are shown, which is
// ordinary pagination, but it can no longer fill itself with non-matches and
// report nothing.
//
// Sorted before joining so the writer and the reader always agree: a listing
// titled "iPhone 15" and a search for "15 iphone" have to produce the same
// string.
//
// Only the first PAIR_SOURCE_MAX tokens contribute. searchTokensFor already
// orders them title, then brand/model/trade/category, then city/quartier —
// so the cheap prefix is exactly the part of a listing people search by, and
// C(14,2) = 91 pairs is a bounded number of index entries per document.
export const SEARCH_PAIR_MAX = 100;
export const PAIR_SOURCE_MAX = 14;

export function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function pairsFrom(tokens) {
  const source = tokens.slice(0, PAIR_SOURCE_MAX);
  const seen = new Set();
  const pairs = [];
  for (let i = 0; i < source.length; i += 1) {
    for (let j = i + 1; j < source.length; j += 1) {
      if (source[i] === source[j]) continue;
      const key = pairKey(source[i], source[j]);
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push(key);
      if (pairs.length >= SEARCH_PAIR_MAX) return pairs;
    }
  }
  return pairs;
}

export function searchPairsFor(listing) {
  return pairsFrom(searchTokensFor(listing));
}

export function searchPairsUnchanged(listing, existing) {
  const next = searchPairsFor(listing);
  if (!Array.isArray(existing) || existing.length !== next.length) return false;
  return next.every((pair, index) => existing[index] === pair);
}

// Every pair a query could be sent as, so the caller can ask Firestore which
// one is rarest instead of guessing from word length.
export function queryPairCandidates(query) {
  const tokens = tokenize(query).slice(0, PAIR_SOURCE_MAX);
  const seen = new Set();
  const pairs = [];
  for (let i = 0; i < tokens.length; i += 1) {
    for (let j = i + 1; j < tokens.length; j += 1) {
      if (tokens[i] === tokens[j]) continue;
      const key = pairKey(tokens[i], tokens[j]);
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push(key);
    }
  }
  return pairs;
}
