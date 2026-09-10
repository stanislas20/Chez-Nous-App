# Search: what it does today, and the smallest thing that would fix it

> **Phase D update.** Option A is implemented. The measurement below is the
> BEFORE. The AFTER is **10/10** — every surface finds a listing at position
> 2,321 of 2,408, reading **2 documents** to do it. What follows is kept as
> the record of the problem and the reasoning behind the choice; the sections
> marked *(implemented)* say what was actually built.

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

## Recommendation *(implemented)*

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

### What was actually built *(differs from the plan in one important way)*

The plan said "write `searchTokens` at publish". It is **written by the
server** instead, and that change is the most consequential decision in Phase
D.

A rule can check that an array is short and full of strings. What no rule can
check is that the words came from the title — and `array-contains` does not
care where a word came from. A client writing its own tokens can put
"toyota", "corolla" and "iphone" on a listing for a broken chair and appear in
all three searches, invisibly, because a moderator reads the title and not the
token array. That is keyword stuffing, and it is the oldest abuse a
marketplace search invites.

So the rules refuse a client-written `searchTokens` outright — the same shape
as `sellerVerified` in Phase A — and `syncListingSearchTokens` writes it from
the document a moderator actually read. The latency costs nothing: a listing
is created `pending` and search only ever queries `status == "approved"`, so
the tokens exist long before the listing is searchable.

| File | What it does |
|---|---|
| `src/utils/searchTokens.js` | the tokeniser, and the query side |
| `functions/searchTokens.js` | its twin, for the trigger and the backfill |
| `scripts/check-search-tokens.js` | requires the two to agree, exactly |
| `functions/index.js` | `syncListingSearchTokens` — server-authoritative |
| `firestore.rules` | refuses client-written tokens; freezes them; caps at 40 |
| `firestore.indexes.json` | three new composite indexes |
| `src/hooks/useListingsSearch.js` | the query, debounced, with its states |
| `scripts/backfillSearchTokens.js` | idempotent, resumable, one field only |
| ForYou, Local, CategoryListings | search remotely instead of filtering |

### Measured, after

| | |
|---|---|
| Surfaces finding a buried listing | **10/10** (was 4/10) |
| Buried target position | 2,321 of 2,408 |
| Documents read to find it | **2** |
| Search latency (emulator) | ~200 ms |
| Zero-result search | 0 documents read |
| Backfill | 6,990 listings, 28 pages, 2.9 s, idempotent |

### The limitation, stated plainly

**There is no typo tolerance.** Accent, case, punctuation and spacing all fold
— "Congélateur", "congelateur" and "CONGELATEUR" are one word — but a genuine
misspelling finds nothing. "congelateurr" returns zero results, and a test
asserts that it does, so nobody mistakes it for a defect later.

Two smaller limits worth knowing:

- **Whole words only.** A partial word typed mid-search ("corol") does not
  match remotely. Debouncing means this is rarely visible — by the time
  somebody stops typing they have usually finished the word — but it is why
  the local matcher is still applied to what comes back.
- **Description coverage is bounded.** The first twelve meaningful description
  words are tokenised, after the title, attributes and location. A word buried
  deep in a long description is not searchable.

If typo tolerance turns out to matter, that is the argument for Option B, and
this is the point at which it should be reconsidered — with real search logs
rather than a guess.
