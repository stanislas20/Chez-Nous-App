# Search: what it does today, and the smallest thing that would fix it

Measured, not estimated. `scripts/rules-tests/search.test.js` seeds 1,200
listings, buries a target at position 2,321 of 2,408 by recency, and asks each
search surface to find it. The target is approved, live, and matches the query
exactly.

**Six of ten probes cannot find it.**

## Every search surface, and what it actually searches

| Screen | Data it searches | Category | Finds a buried listing? |
|---|---|---|---|
| Marketplace / Pour vous | the loaded page (60) | **B** | **NO** |
| Local, no city chosen | the loaded page (60) | **B** | **NO** |
| Local, city chosen | page of 60, city pushed into the query | **B** | **NO** |
| Category aisle (Autre, Vehicles, …) | capped category (200, growable) | **C** | **NO** |
| Cars, Services, Garages, Immobilier, Véhicules, Restaurants | capped category (200) | **C** | **NO** |
| Saved listings | the reader's own favourite ids | — | n/a — not a search |
| Pharmacies, Restaurants *nearby* | Google Places via `placesProxy` | **E** | yes, Google's index |
| Banks, Tourism, Hotels, Events, Tyres, Battery, Parts | bundled static tables + derived category data | **D / C** | static: yes; listings: no |
| *(before Phase B)* | entire approved collection | A | yes |

Categories are the ones the brief named: **A** entire dataset, **B** current
page only, **C** capped category, **D** local static data, **E** external API.

## What is actually wrong

The matcher is not the problem. `src/utils/search.js` folds accents, strips
bilingual stopwords, does a fuzzy prefix match and tolerates one bad word in a
spoken sentence. Handed the whole catalogue it finds the target immediately —
the test proves that too.

The problem is the array it is handed. Phase B bounded every read for good
reasons, and search was the collateral: a listing that exists and matches
exactly returns "no results" because it was never downloaded. That is the worst
possible failure for a marketplace, because it is indistinguishable from "we
don't have one" — the seller's listing is invisible and the buyer goes
elsewhere, and neither of them can tell anything went wrong.

Scrolling far enough does not rescue it either: 60 pages and 1,800 document
reads did not reach the target.

## The options

### Option A — Firestore keyword tokens on the listing

Write a `searchTokens` array field at publish time: the title and description
folded, split, stopworded, deduplicated, capped at ~40 entries. Query with
`where("searchTokens", "array-contains", token)` plus the existing category and
status filters, paginated as everything else now is.

- **Complexity**: low. One field in `CreateListingScreen`, one query path, one
  composite index per filter combination, a backfill for existing listings.
  Roughly a day, entirely inside skills this codebase already uses.
- **Firestore reads**: one page per search. Same order as browsing.
- **Quality**: prefix and exact word matching only. `array-contains` takes one
  value, so a two-word query means filtering the first token's results
  client-side — fine at this scale, weaker as a category grows.
- **Typo tolerance**: **none.** "congelateur" finds nothing if the seller wrote
  "congélateur"— though folding at write time fixes accents specifically, which
  is the common case here. A genuine misspelling finds nothing.
- **French/accents**: solved, because both sides are folded with the same
  function the matcher already uses.
- **Category/city filtering**: native. Combines with the existing `where`
  clauses and the indexes already deployed.
- **Cost**: no new service. Slightly larger documents and one extra index.
- **Maintenance**: the tokeniser must stay in step with the matcher. Guardable
  by a check script, like the other duplicated rules in this project.
- **Scale**: good to roughly tens of thousands of listings per category.

### Option B — Algolia or Typesense

- **Complexity**: medium. An extension or a Cloud Function to mirror listings
  into the index, an API key in the app (search-only, restricted), a new
  results path, and moderation state to keep in sync — an unapproved listing
  must never appear.
- **Firestore reads**: near zero for search; the index answers.
- **Quality**: much better. Ranking, synonyms, prefix-as-you-type.
- **Typo tolerance**: yes, and it is the main reason to choose this.
- **French/accents**: yes, properly, with stemming.
- **Filtering**: yes, facets included.
- **Cost**: Algolia bills per search after a free tier; Typesense is free
  self-hosted, which is a server to run and patch. Either is a new bill or a
  new operational burden for a marketplace that does not yet have users.
- **Maintenance**: a second datastore that can drift from Firestore. Deleting a
  listing must delete it from the index too, or search returns things that no
  longer exist — the mirror image of today's bug.
- **Scale**: essentially unlimited.

### Option C — already in this codebase

Two things exist and neither is a search architecture, but both are worth
naming so they are not mistaken for one:

- **`useCategoryListings` growing window** (Phase C). Lets a reader browse past
  200 by scrolling. It does not help search: a query still only sees what has
  been loaded, and nobody scrolls 2,000 listings to make a search work.
- **`placesProxy`** already provides real search over Google's index for
  pharmacies and restaurants. It is not applicable to user listings — Google
  does not index them — but it is why those two screens are the only ones that
  find things reliably today.

## Recommendation

**Option A, before launch. Not Option B, not yet.**

The reasoning is about matching the fix to the problem. Today's failure is not
"search results are poorly ranked" — it is "search cannot see the data". Option
A fixes exactly that, costs nothing per month, adds no second datastore that
can drift, and is a day of work in patterns this project already uses.

Option B is a better search engine and would be the right answer at, say,
20,000 listings with real traffic. Buying it now means paying and maintaining a
mirror before there is anything to search, and its biggest failure mode — index
drift showing listings that no longer exist — is one this app has just spent
two phases eliminating elsewhere.

The honest limitation of Option A is typo tolerance. Accent-folding at write
time covers the common French case; a genuine misspelling will find nothing.
That is a real regression against the pre-Phase-B behaviour only for
misspellings, and against nothing else.

**Not implemented.** The brief asked for a proposal, and the choice is yours.
Until one is made, search is a launch blocker: a marketplace whose search
cannot find its own listings will be read as an empty marketplace.

### If you approve Option A, what it touches

1. `src/utils/search.js` — export the tokeniser the matcher already contains.
2. `src/screens/CreateListingScreen.js` — write `searchTokens` at publish and
   on edit. Rules cap its length (the `listingLimits` pattern).
3. `firestore.rules` — validate `searchTokens` is an array of ≤40 short strings.
4. `firestore.indexes.json` — `status + searchTokens + createdAt`, and one with
   `categoryKey` for the aisle screens.
5. A new `useListingsSearch` beside `useListingsQuery`, same shape.
6. The search screens switch from filtering their array to calling it.
7. `scripts/backfillSearchTokens.js` — Admin SDK, one pass over existing
   listings.
8. `scripts/rules-tests/search.test.js` — the same six probes, expected to pass.
